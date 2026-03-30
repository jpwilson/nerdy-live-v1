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

interface RealMetrics {
  engagement: number;
  eyeContact: number;
  studentTalk: number;
  tutorTalk: number;
  responsiveness: number;
  attentionDrift: number;
  interruptions: number;
  duration: number;
  snapshotCount: number;
}

async function fetchRealMetrics(sessionId: string): Promise<RealMetrics | null> {
  const sb = getSupabaseBrowserClient();
  const { data: snapshots, error } = await sb
    .from("metrics_snapshots")
    .select("tutor_eye_contact, student_eye_contact, tutor_talk_pct, student_talk_pct, tutor_energy, student_energy, interruption_count, engagement_trend, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error || !snapshots || snapshots.length === 0) return null;

  const n = snapshots.length;
  let totalEyeContact = 0;
  let totalStudentTalk = 0;
  let totalTutorTalk = 0;
  let totalEnergy = 0;
  let totalInterruptions = 0;
  let risingCount = 0;
  let decliningCount = 0;

  for (const s of snapshots) {
    totalEyeContact += (s.student_eye_contact ?? s.tutor_eye_contact ?? 0);
    totalStudentTalk += (s.student_talk_pct ?? 0) * 100;
    totalTutorTalk += (s.tutor_talk_pct ?? 0) * 100;
    totalEnergy += (s.student_energy ?? s.tutor_energy ?? 0) * 100;
    totalInterruptions += (s.interruption_count ?? 0);
    if (s.engagement_trend === "rising") risingCount++;
    if (s.engagement_trend === "declining") decliningCount++;
  }

  const avgEyeContact = Math.round(totalEyeContact / n);
  const avgStudentTalk = Math.round(totalStudentTalk / n);
  const avgTutorTalk = Math.round(totalTutorTalk / n);
  const avgEnergy = Math.round(totalEnergy / n);

  // Derive engagement from eye contact + energy + talk balance
  const talkBalance = 100 - Math.abs(avgStudentTalk - 40); // optimal ~40% student talk
  const engagement = Math.round((avgEyeContact * 0.4 + avgEnergy * 0.3 + talkBalance * 0.3));

  // Duration from first to last snapshot
  const firstTs = new Date(snapshots[0].created_at).getTime();
  const lastTs = new Date(snapshots[n - 1].created_at).getTime();
  const durationMin = Math.max(1, Math.round((lastTs - firstTs) / 60000));

  // Attention drift: proportion of declining snapshots
  const attentionDrift = Math.round((decliningCount / n) * 100);

  return {
    engagement,
    eyeContact: avgEyeContact,
    studentTalk: avgStudentTalk,
    tutorTalk: avgTutorTalk,
    responsiveness: avgEnergy,
    attentionDrift,
    interruptions: totalInterruptions,
    duration: durationMin,
    snapshotCount: n,
  };
}

export default function SessionSummaryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sessionTooShort, setSessionTooShort] = useState(false);
  const [noStudentJoined, setNoStudentJoined] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [realMetrics, setRealMetrics] = useState<RealMetrics | null>(null);

  const deleteSession = async () => {
    if (!currentSessionId) {
      router.push("/dashboard");
      return;
    }
    if (!showDeleteConfirm) { setShowDeleteConfirm(true); return; }
    setDeleting(true);
    try {
      const sb = getSupabaseBrowserClient();
      await sb.from("sessions").delete().eq("id", currentSessionId);
    } catch (err) {
      console.warn("[summary] delete failed:", err);
    }
    router.push("/dashboard");
  };

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

      setCurrentSessionId(sessionId);

      // Track resolved metrics locally so we can use them for AI call in same tick
      let resolvedMetrics: RealMetrics | null = null;

      // End the session in Supabase
      if (sessionId) {
        const sb = getSupabaseBrowserClient();
        await sb.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
        localStorage.removeItem("livesesh_currentSessionId");

        // Fetch real metrics from Supabase
        const metrics = await fetchRealMetrics(sessionId);
        if (metrics) {
          resolvedMetrics = metrics;
        }
      }

      // Fall back to localStorage metrics if Supabase had nothing
      if (!resolvedMetrics) {
        const savedMetricsRaw = localStorage.getItem("livesesh_sessionMetrics");
        if (savedMetricsRaw) {
          try {
            const saved = JSON.parse(savedMetricsRaw);
            resolvedMetrics = {
              engagement: saved.engagement ?? 0,
              eyeContact: saved.eyeContact ?? 0,
              studentTalk: saved.studentTalk ?? 0,
              tutorTalk: saved.tutorTalk ?? 0,
              responsiveness: saved.responsiveness ?? 0,
              attentionDrift: saved.attentionDrift ?? 0,
              interruptions: saved.interruptions ?? 0,
              duration: saved.duration ?? 1,
              snapshotCount: saved.snapshotCount ?? 1,
            };
            // Also use subject from metrics if session data has none
            if (saved.subject && saved.subject !== "General" && sessionData) {
              if (!sessionData.subject || sessionData.subject === "General" || sessionData.subject === "Unknown") {
                sessionData.subject = saved.subject;
                setSummary({ ...sessionData });
              }
            }
          } catch { /* bad JSON */ }
        }
      }

      // Set state for display
      if (resolvedMetrics) {
        setRealMetrics(resolvedMetrics);
      }

      // Clean up localStorage metrics after loading
      localStorage.removeItem("livesesh_sessionMetrics");

      // Check minimum session validation
      const sessionStartedAt = sessionData?.timestamp
        ? sessionData.timestamp
        : null;
      const sessionDurationMs = sessionStartedAt
        ? Date.now() - sessionStartedAt
        : 0;
      const durationTooShort = sessionStartedAt && sessionDurationMs < 60_000;

      // Check if a student ever joined (stored by room-client)
      const studentJoined = localStorage.getItem("livesesh_studentJoined") === "true";
      localStorage.removeItem("livesesh_studentJoined");

      const hasTranscript = !!(sessionData?.transcript && sessionData.transcript.trim().length > 10);
      const hasContent = hasTranscript || studentJoined;

      if (durationTooShort && !hasContent) {
        setSessionTooShort(true);
      }
      if (!studentJoined && !hasTranscript) {
        setNoStudentJoined(true);
      }

      setLoading(false);

      // Only call AI analysis if the session has real content
      const skipAnalysis = (durationTooShort && !hasContent) || (!hasTranscript && !studentJoined);

      if (!skipAnalysis && (sessionData?.transcript || sessionData?.summary)) {
        setAnalyzing(true);
        try {
          // Build metrics for AI from resolved metrics (Supabase or localStorage fallback)
          let metricsForAI: Record<string, number>;

          if (resolvedMetrics && resolvedMetrics.engagement > 0) {
            metricsForAI = {
              engagement: resolvedMetrics.engagement,
              eyeContact: resolvedMetrics.eyeContact,
              studentTalk: resolvedMetrics.studentTalk,
              tutorTalk: resolvedMetrics.tutorTalk,
              responsiveness: resolvedMetrics.responsiveness,
              attentionDrift: resolvedMetrics.attentionDrift,
              interruptions: resolvedMetrics.interruptions,
              duration: resolvedMetrics.duration,
            };
          } else {
            metricsForAI = {
              engagement: 0,
              eyeContact: 0,
              studentTalk: 0,
              tutorTalk: 0,
              responsiveness: 0,
              attentionDrift: 0,
              interruptions: 0,
              duration: 0,
            };
          }

          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: sessionData.transcript || "",
              metrics: metricsForAI,
              metricsNote: metricsForAI.engagement === 0
                ? "No real-time metrics were collected for this session. Analysis is based on transcript only."
                : `Based on ${resolvedMetrics?.snapshotCount ?? "unknown"} real-time metric snapshots collected during the session. Based on real-time analysis data.`,
              model: localStorage.getItem("livesesh_model_summary") || "sonnet",
              task: "summary",
              demoMode: localStorage.getItem("livesesh_demo_mode") === "true",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setAiAnalysis(data.result);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <main className="shell"><p style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading summary...</p></main>;

  // Show short session / no student message
  if (sessionTooShort || (noStudentJoined && !aiAnalysis && !analyzing)) {
    return (
      <main className="shell">
        <div className="summary-page">
          <h1 className="dash-title">Session Too Short</h1>
          <div className="summary-card">
            <p className="summary-text" style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
              {sessionTooShort
                ? "This session was less than 1 minute long. No analysis was generated."
                : "No student joined this session. No analysis was generated."}
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", textAlign: "center" }}>
              Sessions need at least 1 minute of content with a participant to generate meaningful analysis.
            </p>
          </div>
          <div className="summary-actions">
            <button className="primary-button" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </button>
            <button
              className="ghost-button"
              style={{ color: "var(--danger)" }}
              onClick={() => void deleteSession()}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete This Session"}
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

  return (
    <main className="shell">
      <div className="summary-page">
        <h1 className="dash-title">Session Complete</h1>

        <div className="summary-card">
          <div className="summary-header">
            <span className="summary-subject">{aiAnalysis?.subject || summary?.subject || "General"}</span>
            <span className="summary-time">{new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          </div>

          {/* Real metrics display if available */}
          {realMetrics && realMetrics.snapshotCount > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, margin: "12px 0", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: realMetrics.engagement >= 60 ? "var(--success)" : "var(--warn)" }}>{realMetrics.engagement}%</div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Engagement</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#2B86C5" }}>{realMetrics.eyeContact}%</div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Eye Contact</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#8B5CF6" }}>{realMetrics.studentTalk}%</div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Student Talk</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{realMetrics.duration}m</div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Duration</div>
              </div>
            </div>
          )}

          {realMetrics && realMetrics.snapshotCount > 0 && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 8px", fontStyle: "italic" }}>
              Based on {realMetrics.snapshotCount} real-time metric snapshot{realMetrics.snapshotCount !== 1 ? "s" : ""} collected during the session.
            </p>
          )}

          {!realMetrics && !analyzing && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 8px", fontStyle: "italic" }}>
              No real-time metrics were collected for this session. Analysis is based on transcript only.
            </p>
          )}

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
          <button
            className="ghost-button"
            style={{ color: "var(--danger)" }}
            onClick={() => void deleteSession()}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Session"}
          </button>
        </div>

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.4)", display: "flex",
            alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)",
          }} onClick={() => setShowDeleteConfirm(false)}>
            <div style={{
              background: "#fff", borderRadius: 16, padding: "28px 32px",
              maxWidth: 400, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              textAlign: "center",
            }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>Delete this session?</h3>
              <p style={{ margin: "0 0 20px", fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
                This will permanently remove the session and all associated data.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  style={{
                    padding: "10px 24px", borderRadius: 10, border: "1px solid #ddd",
                    background: "#fff", fontSize: "0.85rem", fontWeight: 600,
                    cursor: "pointer", color: "var(--ink)",
                  }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  style={{
                    padding: "10px 24px", borderRadius: 10, border: "none",
                    background: "var(--danger)", color: "#fff", fontSize: "0.85rem",
                    fontWeight: 600, cursor: "pointer",
                  }}
                  onClick={() => { setShowDeleteConfirm(false); void deleteSession(); }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
