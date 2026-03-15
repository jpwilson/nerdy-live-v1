"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function SessionSummaryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    const loadSummary = async () => {
      const sessionId = localStorage.getItem("livesesh_currentSessionId");
      const lastSession = localStorage.getItem("livesesh_lastSession");

      if (lastSession) {
        try {
          const data = JSON.parse(lastSession);
          setSummary(data);
        } catch {}
      }

      // Also try to end the session in Supabase
      if (sessionId) {
        const sb = getSupabaseBrowserClient();
        await sb.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
        localStorage.removeItem("livesesh_currentSessionId");
      }

      setLoading(false);
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
            <span className="summary-subject">{summary?.subject || "General"}</span>
            <span className="summary-time">{new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          </div>

          {summary?.summary && (
            <p className="summary-text">{summary.summary}</p>
          )}

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
