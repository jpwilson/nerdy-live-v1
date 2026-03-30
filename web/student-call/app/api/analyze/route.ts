import { NextRequest, NextResponse } from "next/server";
import { Langfuse } from "langfuse";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Langfuse — graceful fallback if keys not set
let langfuse: Langfuse | null = null;
try {
  if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
    langfuse = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    });
  }
} catch (e) {
  console.warn("[analyze] Langfuse init failed, tracing disabled:", e);
}

const MODEL_MAP: Record<string, string> = {
  haiku: "anthropic/claude-3.5-haiku",
  sonnet: "anthropic/claude-sonnet-4-6",
  opus: "anthropic/claude-opus-4-6",
};

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const { transcript, metrics, model = "sonnet", task = "summary", demoMode = false } = await req.json();

    if (!transcript && !metrics) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    const modelId = MODEL_MAP[model] || MODEL_MAP.sonnet;

    // Start Langfuse trace (non-blocking — errors won't break the endpoint)
    const trace = langfuse?.trace({
      name: "analyze-session",
      metadata: { task, model: modelId },
    });

    let prompt = "";

    const isShortSession = (metrics?.duration ?? 0) <= 5;
    const isShortRealSession = isShortSession && !demoMode;

    if (task === "summary" && isShortRealSession) {
      prompt = `You are an AI tutoring analyst for LiveSesh AI. This session was only ${metrics?.duration ?? "N/A"} minute(s) long — too short for a full analysis.

Session transcript:
${transcript || "(No transcript available)"}

Session metrics:
- Engagement score: ${metrics?.engagement ?? "N/A"}%
- Eye contact: ${metrics?.eyeContact ?? "N/A"}%
- Student talk time: ${metrics?.studentTalk ?? "N/A"}%
- Tutor talk time: ${metrics?.tutorTalk ?? "N/A"}%
- Duration: ${metrics?.duration ?? "N/A"} minutes

This session was too brief for meaningful analysis. Just note the key metrics observed and keep it short. Do not give detailed coaching advice — there isn't enough data.

Provide a JSON response with:
{
  "subject": "detected subject or 'Brief Session'",
  "summary": "1 sentence acknowledging the short duration and noting the key metrics",
  "strengths": ["1 brief observation max, or empty array"],
  "improvements": ["1 brief observation max, or empty array"],
  "studentInsight": "",
  "nextSessionSuggestion": "Run a longer session for a full analysis"
}

Respond with ONLY the JSON, no markdown formatting.`;
    } else if (task === "summary") {
      prompt = `You are an AI tutoring analyst for LiveSesh AI. Analyze this tutoring session and provide a structured summary.

Session transcript:
${transcript || "(No transcript available)"}

Session metrics:
- Engagement score: ${metrics?.engagement ?? "N/A"}%
- Eye contact: ${metrics?.eyeContact ?? "N/A"}%
- Student talk time: ${metrics?.studentTalk ?? "N/A"}%
- Tutor talk time: ${metrics?.tutorTalk ?? "N/A"}%
- Responsiveness level: ${metrics?.responsiveness ?? metrics?.energy ?? "N/A"}%
- Attention drift: ${metrics?.attentionDrift ?? "N/A"}%
- Interruptions: ${metrics?.interruptions ?? "N/A"}
- Duration: ${metrics?.duration ?? "N/A"} minutes

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
    } else if (task === "insight") {
      prompt = `You are an AI tutoring analyst. Analyze these session summaries across multiple tutoring sessions and identify patterns.

Session data:
${JSON.stringify(metrics, null, 2)}

Identify:
1. Students who are improving vs declining
2. Subjects where engagement is highest/lowest
3. Patterns in tutor behavior (talking too much? not enough questions?)
4. Specific, actionable recommendations

Provide a JSON response:
{
  "insights": ["list of 3-5 key insights"],
  "atRiskStudents": ["students whose engagement is declining"],
  "topPerformers": ["students doing well"],
  "tutorRecommendations": ["2-3 specific coaching tips for the tutor"]
}

Respond with ONLY the JSON, no markdown formatting.`;
    }

    // Create Langfuse generation span before the API call
    const generation = trace?.generation({
      name: "openrouter-completion",
      model: modelId,
      input: [{ role: "user", content: prompt }],
      modelParameters: { max_tokens: 1024, temperature: 0.3 },
    });

    const startTime = Date.now();

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://student-call.vercel.app",
        "X-Title": "LiveSesh AI",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text();
      console.error("[analyze] OpenRouter error:", response.status, errText);
      try {
        generation?.end({ output: errText, level: "ERROR", statusMessage: `HTTP ${response.status}` });
        await langfuse?.flushAsync();
      } catch { /* tracing must not break the endpoint */ }
      return NextResponse.json({ error: "Model API error" }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Complete Langfuse generation with response data
    try {
      generation?.end({
        output: content,
        usage: {
          input: data.usage?.prompt_tokens,
          output: data.usage?.completion_tokens,
          total: data.usage?.total_tokens,
        },
        metadata: { latencyMs },
      });
    } catch { /* tracing must not break the endpoint */ }

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(content);
      try { await langfuse?.flushAsync(); } catch { /* non-blocking */ }
      return NextResponse.json({
        result: parsed,
        model: modelId,
        usage: data.usage,
      });
    } catch {
      // Return raw text if not valid JSON
      try { await langfuse?.flushAsync(); } catch { /* non-blocking */ }
      return NextResponse.json({
        result: { summary: content },
        model: modelId,
        usage: data.usage,
      });
    }
  } catch (err) {
    console.error("[analyze] error:", err);
    try { await langfuse?.flushAsync(); } catch { /* non-blocking */ }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
