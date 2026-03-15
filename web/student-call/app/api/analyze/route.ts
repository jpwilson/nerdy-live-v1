import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODEL_MAP: Record<string, string> = {
  haiku: "anthropic/claude-haiku-4-5-20251001",
  sonnet: "anthropic/claude-sonnet-4-6",
  opus: "anthropic/claude-opus-4-6",
};

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const { transcript, metrics, model = "sonnet", task = "summary" } = await req.json();

    if (!transcript && !metrics) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    const modelId = MODEL_MAP[model] || MODEL_MAP.sonnet;

    let prompt = "";

    if (task === "summary") {
      prompt = `You are an AI tutoring analyst for LiveSesh AI. Analyze this tutoring session and provide a structured summary.

Session transcript:
${transcript || "(No transcript available)"}

Session metrics:
- Engagement score: ${metrics?.engagement ?? "N/A"}%
- Eye contact: ${metrics?.eyeContact ?? "N/A"}%
- Student talk time: ${metrics?.studentTalk ?? "N/A"}%
- Tutor talk time: ${metrics?.tutorTalk ?? "N/A"}%
- Energy level: ${metrics?.energy ?? "N/A"}%
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

    if (!response.ok) {
      const errText = await response.text();
      console.error("[analyze] OpenRouter error:", response.status, errText);
      return NextResponse.json({ error: "Model API error" }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(content);
      return NextResponse.json({
        result: parsed,
        model: modelId,
        usage: data.usage,
      });
    } catch {
      // Return raw text if not valid JSON
      return NextResponse.json({
        result: { summary: content },
        model: modelId,
        usage: data.usage,
      });
    }
  } catch (err) {
    console.error("[analyze] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
