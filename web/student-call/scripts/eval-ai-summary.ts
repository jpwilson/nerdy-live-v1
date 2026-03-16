/**
 * LiveSesh AI — Post-Session Summary Evaluation
 *
 * Validates that Claude's session summaries correctly identify engagement
 * problems and produce actionable, tutor-focused recommendations.
 *
 * Core thesis: The AI summary should reinforce the real-time coaching nudges
 * by identifying the same patterns post-session and giving tutors concrete
 * next steps to improve student attentiveness.
 *
 * Run: npx tsx scripts/eval-ai-summary.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname || __dirname, "../.env.local") });

const API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-3.5-haiku"; // Use Haiku for eval speed/cost

interface EvalScenario {
  name: string;
  description: string;
  metrics: Record<string, unknown>;
  transcript: string;
  /** Keywords that MUST appear in the response (case-insensitive). Arrays = any one match counts. */
  mustMention: (string | string[])[];
  /** The response must NOT suggest these (would indicate misreading the data) */
  mustNotMention?: string[];
  /** Required JSON keys in response */
  requiredKeys: string[];
}

const SCENARIOS: EvalScenario[] = [
  {
    name: "Tutor-dominated session",
    description: "Tutor talks 92% of the time. Student barely speaks. Classic lecture trap.",
    metrics: {
      engagement: 34,
      eyeContact: 52,
      studentTalk: 8,
      tutorTalk: 92,
      responsiveness: 28,
      attentionDrift: 65,
      interruptions: 1,
      duration: 35,
    },
    transcript: "Tutor explains quadratic formula for 30 minutes. Student says 'ok' and 'yeah' occasionally. No questions asked by student.",
    mustMention: ["question", ["talk", "speak", "lecture", "domin", "one-sided", "monopol"]],
    mustNotMention: ["great balance", "excellent participation"],
    requiredKeys: ["subject", "summary", "strengths", "improvements", "studentInsight", "nextSessionSuggestion"],
  },
  {
    name: "Distracted student — low eye contact",
    description: "Student looking away most of the session. Possible phone use or second screen.",
    metrics: {
      engagement: 29,
      eyeContact: 18,
      studentTalk: 22,
      tutorTalk: 78,
      responsiveness: 20,
      attentionDrift: 82,
      interruptions: 0,
      duration: 25,
    },
    transcript: "Student frequently looks down at phone. Responses are delayed. Tutor asks 'are you following?' multiple times.",
    mustMention: [["eye contact", "attention", "looking away", "gaze", "visual"], ["distract", "phone", "disengag", "unfocus"]],
    requiredKeys: ["subject", "summary", "strengths", "improvements", "studentInsight", "nextSessionSuggestion"],
  },
  {
    name: "Excellent session — high engagement",
    description: "Both participants actively engaged. Good talk balance. Student asking questions.",
    metrics: {
      engagement: 87,
      eyeContact: 78,
      studentTalk: 42,
      tutorTalk: 58,
      responsiveness: 75,
      attentionDrift: 12,
      interruptions: 3,
      duration: 40,
    },
    transcript: "Student asks about photosynthesis. Tutor guides with questions. Student explains light reactions correctly. Tutor follows up with 'why do you think that works?' Student reasons through dark reactions.",
    mustMention: [["engag", "participat", "interact", "active"], ["question", "socratic", "guided", "discussion"]],
    mustNotMention: ["distract", "low engagement", "barely spoke"],
    requiredKeys: ["subject", "summary", "strengths", "improvements", "studentInsight", "nextSessionSuggestion"],
  },
  {
    name: "Energy drop mid-session",
    description: "Session started well but energy declined significantly in second half.",
    metrics: {
      engagement: 45,
      eyeContact: 55,
      studentTalk: 30,
      tutorTalk: 70,
      responsiveness: 25,
      attentionDrift: 58,
      interruptions: 2,
      duration: 50,
    },
    transcript: "First 20 minutes: active discussion about cell biology. Last 30 minutes: student becomes quiet, one-word answers. Session ran long.",
    mustMention: [["break", "shorter", "pacing", "length", "fatigue", "duration"], ["energy", "declin", "drop", "fade", "quiet", "disengage"]],
    requiredKeys: ["subject", "summary", "strengths", "improvements", "studentInsight", "nextSessionSuggestion"],
  },
  {
    name: "High interruption session",
    description: "Tutor and student frequently talk over each other.",
    metrics: {
      engagement: 55,
      eyeContact: 65,
      studentTalk: 45,
      tutorTalk: 55,
      responsiveness: 60,
      attentionDrift: 35,
      interruptions: 14,
      duration: 30,
    },
    transcript: "Student starts answering before tutor finishes. Tutor cuts in to correct. Multiple overlapping exchanges. Both seem engaged but chaotic.",
    mustMention: [["interrupt", "overlap", "cut", "talk over"], ["wait", "turn", "paus", "listen", "space"]],
    requiredKeys: ["subject", "summary", "strengths", "improvements", "studentInsight", "nextSessionSuggestion"],
  },
];

const SUMMARY_PROMPT_TEMPLATE = (transcript: string, metrics: Record<string, unknown>) => `You are an AI tutoring analyst for LiveSesh AI. Analyze this tutoring session and provide a structured summary.

Session transcript:
${transcript || "(No transcript available)"}

Session metrics:
- Engagement score: ${metrics.engagement ?? "N/A"}%
- Eye contact: ${metrics.eyeContact ?? "N/A"}%
- Student talk time: ${metrics.studentTalk ?? "N/A"}%
- Tutor talk time: ${metrics.tutorTalk ?? "N/A"}%
- Responsiveness level: ${metrics.responsiveness ?? "N/A"}%
- Attention drift: ${metrics.attentionDrift ?? "N/A"}%
- Interruptions: ${metrics.interruptions ?? "N/A"}
- Duration: ${metrics.duration ?? "N/A"} minutes

Provide a JSON response with:
{
  "subject": "detected subject (e.g., Algebra, Physics, English)",
  "summary": "2-3 sentence summary of what was covered and how it went",
  "strengths": ["list of what went well"],
  "improvements": ["list of specific, actionable improvements"],
  "studentInsight": "one sentence about the student's learning pattern",
  "nextSessionSuggestion": "what to focus on next time"
}

Respond with ONLY the JSON, no markdown formatting.`;

interface EvalResult {
  scenario: string;
  passed: boolean;
  schemaValid: boolean;
  mustMentionResults: { keyword: string; found: boolean }[];
  mustNotMentionResults: { keyword: string; found: boolean }[];
  improvementsCount: number;
  strengthsCount: number;
  latencyMs: number;
  tokensUsed: { input: number; output: number; total: number };
  cost: number;
  response: Record<string, unknown> | null;
  error?: string;
}

async function runScenario(scenario: EvalScenario): Promise<EvalResult> {
  const prompt = SUMMARY_PROMPT_TEMPLATE(scenario.transcript, scenario.metrics);
  const start = Date.now();

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "HTTP-Referer": "https://student-call.vercel.app",
        "X-Title": "LiveSesh AI Eval",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    const latencyMs = Date.now() - start;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Haiku pricing: $0.80/1M input, $4/1M output
    const cost = (usage.prompt_tokens * 0.0000008) + (usage.completion_tokens * 0.000004);

    // Parse JSON
    let parsed: Record<string, unknown> | null = null;
    let schemaValid = false;
    try {
      parsed = JSON.parse(content);
      schemaValid = scenario.requiredKeys.every((key) => key in (parsed as Record<string, unknown>));
    } catch {
      // JSON parse failed
    }

    // Check mustMention keywords
    const fullText = JSON.stringify(parsed || content).toLowerCase();
    const mustMentionResults = scenario.mustMention.map((kw) => {
      if (Array.isArray(kw)) {
        const found = kw.some((alt) => fullText.includes(alt.toLowerCase()));
        return { keyword: kw.join("|"), found };
      }
      return { keyword: kw, found: fullText.includes(kw.toLowerCase()) };
    });

    const mustNotMentionResults = (scenario.mustNotMention || []).map((kw) => ({
      keyword: kw,
      found: fullText.includes(kw.toLowerCase()),
    }));

    const allMustMentionPass = mustMentionResults.every((r) => r.found);
    const allMustNotMentionPass = mustNotMentionResults.every((r) => !r.found);

    const improvements = Array.isArray((parsed as Record<string, unknown>)?.improvements) ? ((parsed as Record<string, unknown>).improvements as unknown[]).length : 0;
    const strengths = Array.isArray((parsed as Record<string, unknown>)?.strengths) ? ((parsed as Record<string, unknown>).strengths as unknown[]).length : 0;

    return {
      scenario: scenario.name,
      passed: schemaValid && allMustMentionPass && allMustNotMentionPass,
      schemaValid,
      mustMentionResults,
      mustNotMentionResults,
      improvementsCount: improvements,
      strengthsCount: strengths,
      latencyMs,
      tokensUsed: { input: usage.prompt_tokens, output: usage.completion_tokens, total: usage.total_tokens },
      cost,
      response: parsed,
    };
  } catch (err) {
    return {
      scenario: scenario.name,
      passed: false,
      schemaValid: false,
      mustMentionResults: [],
      mustNotMentionResults: [],
      improvementsCount: 0,
      strengthsCount: 0,
      latencyMs: Date.now() - start,
      tokensUsed: { input: 0, output: 0, total: 0 },
      cost: 0,
      response: null,
      error: String(err),
    };
  }
}

async function main() {
  if (!API_KEY) {
    console.error("OPENROUTER_API_KEY not set");
    process.exit(1);
  }

  console.log("LiveSesh AI — Post-Session Summary Evaluation");
  console.log("=".repeat(60));
  console.log(`Model: ${MODEL}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log("");

  const results: EvalResult[] = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`  ${scenario.name}... `);
    const result = await runScenario(scenario);
    results.push(result);
    console.log(result.passed ? "PASS" : "FAIL", `(${result.latencyMs}ms, $${result.cost.toFixed(4)})`);

    if (!result.passed) {
      if (!result.schemaValid) console.log("    Schema invalid or missing keys");
      for (const r of result.mustMentionResults) {
        if (!r.found) console.log(`    Missing keyword: "${r.keyword}"`);
      }
      for (const r of result.mustNotMentionResults) {
        if (r.found) console.log(`    Should NOT mention: "${r.keyword}"`);
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const schemaPass = results.filter((r) => r.schemaValid).length;
  const avgLatency = Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / total);
  const totalCost = results.reduce((a, r) => a + r.cost, 0);
  const avgImprovements = (results.reduce((a, r) => a + r.improvementsCount, 0) / total).toFixed(1);
  const avgStrengths = (results.reduce((a, r) => a + r.strengthsCount, 0) / total).toFixed(1);

  console.log(`\nResults: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`Schema compliance: ${schemaPass}/${total} (${Math.round((schemaPass / total) * 100)}%)`);
  console.log(`Avg latency: ${avgLatency}ms`);
  console.log(`Total eval cost: $${totalCost.toFixed(4)}`);
  console.log(`Avg improvements per summary: ${avgImprovements}`);
  console.log(`Avg strengths per summary: ${avgStrengths}`);

  // Output JSON for docs
  const report = {
    model: MODEL,
    timestamp: new Date().toISOString(),
    scenarios: total,
    passed,
    schemaCompliance: `${schemaPass}/${total}`,
    avgLatencyMs: avgLatency,
    totalCostUsd: parseFloat(totalCost.toFixed(4)),
    results: results.map((r) => ({
      scenario: r.scenario,
      passed: r.passed,
      schemaValid: r.schemaValid,
      latencyMs: r.latencyMs,
      tokens: r.tokensUsed,
      costUsd: parseFloat(r.cost.toFixed(4)),
      improvements: r.improvementsCount,
      strengths: r.strengthsCount,
      mustMention: r.mustMentionResults,
      mustNotMention: r.mustNotMentionResults,
    })),
  };

  const fs = await import("fs");
  const outPath = new URL("../eval-results.json", import.meta.url).pathname;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull results saved to: eval-results.json`);
}

main();
