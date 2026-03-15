"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface AIAnalysis {
  subject?: string;
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  studentInsight?: string;
  nextSessionSuggestion?: string;
}

export default function SessionSummaryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const loadSummary = async () => {
      const sessionId = localStorage.getItem("livesesh_currentSessionId");
      const lastSession = localStorage.getItem("livesesh_lastSession");
      let sessionData: any = null;

      if (lastSession) {
        try {
          sessionData = JSON.parse(lastSession);
          setSummary(sessionData);
        } catch {}
      }

      // End the session in Supabase
      if (sessionId) {
        const sb = getSupabaseBrowserClient();
        await sb.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
        localStorage.removeItem("livesesh_currentSessionId");
      }

      setLoading(false);

      // Call AI analysis
      if (sessionData?.transcript || sessionData?.summary) {
        setAnalyzing(true);
        try {
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: sessionData.transcript || "",
              metrics: {
                engagement: 65,
                eyeContact: 70,
                studentTalk: 35,
                tutorTalk: 65,
                energy: 55,
                attentionDrift: 20,
                interruptions: 2,
                duration: 15,
              },
              model: "sonnet",
              task: "summary",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setAiAnalysis(data.result);
            // Update subject from AI if detected
            if (data.result?.subject && data.result.subject !== "General") {
              setSummary((prev: any) => ({ ...prev, subject: data.result.subject }));
            }
          }
        } catch (err) {
          console.warn("[summary] AI analysis failed:", err);
        }
        setAnalyzing(false);
      }
    };
    void loadSummary();
  }, []);

  if (loading) return <main className="shell"><p style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading summary...</p></main>;

  return (
    <main className="shell">
      <div className="summary-page">
        <h1 className="dash-title">Session Complete</h1>

        <div className="summary-card">
          <div className="summary-header">
            <span className="summary-subject">{aiAnalysis?.subject || summary?.subject || "General"}</span>
            <span className="summary-time">{new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          </div>

          {/* AI-generated summary */}
          {analyzing && (
            <p className="summary-text" style={{ color: "var(--muted)", fontStyle: "italic" }}>
              Analyzing session with Claude...
            </p>
          )}

          {aiAnalysis?.summary ? (
            <p className="summary-text">{aiAnalysis.summary}</p>
          ) : summary?.summary ? (
            <p className="summary-text">{summary.summary}</p>
          ) : null}

          {/* Strengths */}
          {aiAnalysis?.strengths && aiAnalysis.strengths.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--success)", margin: "0 0 6px" }}>Strengths</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.84rem", lineHeight: 1.6, color: "#333" }}>
                {aiAnalysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {aiAnalysis?.improvements && aiAnalysis.improvements.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--accent)", margin: "0 0 6px" }}>Areas for Improvement</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.84rem", lineHeight: 1.6, color: "#333" }}>
                {aiAnalysis.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Student insight */}
          {aiAnalysis?.studentInsight && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#FEFAF7", borderRadius: 10, border: "1px solid var(--line)" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--muted)" }}>Student Insight</span>
              <p style={{ fontSize: "0.84rem", margin: "4px 0 0", color: "#333" }}>{aiAnalysis.studentInsight}</p>
            </div>
          )}

          {/* Next session */}
          {aiAnalysis?.nextSessionSuggestion && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: "#FEFAF7", borderRadius: 10, border: "1px solid var(--line)" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--muted)" }}>Next Session</span>
              <p style={{ fontSize: "0.84rem", margin: "4px 0 0", color: "#333" }}>{aiAnalysis.nextSessionSuggestion}</p>
            </div>
          )}

          {/* Transcript */}
          {summary?.transcript && (
            <details className="summary-transcript">
              <summary>View transcript ({summary.transcript.split(" ").length} words)</summary>
              <p>{summary.transcript}</p>
            </details>
          )}
        </div>

        <div className="summary-actions">
          <button className="primary-button" onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </button>
          <button className="ghost-button" onClick={() => {
            const name = localStorage.getItem("livesesh_displayName") || "Tutor";
            const room = localStorage.getItem("livesesh_roomId") || "demo-room";
            const role = localStorage.getItem("livesesh_role") || "tutor_preview";
            const params = new URLSearchParams({ name, role });
            router.push(`/room/${encodeURIComponent(room)}?${params.toString()}`);
          }}>
            Start Another Session
          </button>
        </div>
      </div>
    </main>
  );
}
