"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface SessionRow {
  id: string;
  subject: string;
  student_level: string;
  started_at: string;
  ended_at: string | null;
  engagement_score: number | null;
}

interface SummaryRow {
  session_id: string;
  duration_minutes: number;
  engagement_score: number;
  total_interruptions: number;
  recommendations: string[];
}

export function TutorDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SummaryRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient();

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id, subject, student_level, started_at, ended_at, engagement_score")
        .order("started_at", { ascending: false })
        .limit(20);

      if (sessionData && sessionData.length > 0) {
        setSessions(sessionData);

        const ids = sessionData.map((s: SessionRow) => s.id);
        const { data: summaryData } = await supabase
          .from("session_summaries")
          .select("session_id, duration_minutes, engagement_score, total_interruptions, recommendations")
          .in("session_id", ids);

        if (summaryData) {
          const map: Record<string, SummaryRow> = {};
          for (const s of summaryData) map[s.session_id] = s;
          setSummaries(map);
        }
      }

      setLoading(false);
    };

    void load();
  }, []);

  // Compute aggregate stats
  const completedSessions = sessions.filter((s) => s.ended_at);
  const avgEngagement =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce((sum, s) => sum + (s.engagement_score ?? 0), 0) /
            completedSessions.length
        )
      : null;
  const totalMinutes = Object.values(summaries).reduce(
    (sum, s) => sum + s.duration_minutes,
    0
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const scoreColor = (score: number | null) => {
    if (score == null) return "var(--muted)";
    if (score >= 70) return "var(--success)";
    if (score >= 40) return "var(--warn)";
    return "var(--danger)";
  };

  return (
    <div className="dashboard">
      <p className="eyebrow">Dashboard</p>
      <h1 style={{ fontSize: "1.6rem", marginBottom: 16 }}>Your Sessions</h1>

      {/* Stats row */}
      <div className="dash-stats">
        <div className="dash-stat">
          <span className="dash-stat-value">{sessions.length}</span>
          <span className="dash-stat-label">Sessions</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{totalMinutes > 0 ? `${totalMinutes}m` : "—"}</span>
          <span className="dash-stat-label">Total time</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value" style={{ color: scoreColor(avgEngagement) }}>
            {avgEngagement != null ? `${avgEngagement}%` : "—"}
          </span>
          <span className="dash-stat-label">Avg engagement</span>
        </div>
      </div>

      {/* Session list */}
      {loading ? (
        <p className="dash-empty">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div className="dash-empty-card">
          <p className="dash-empty">No sessions yet.</p>
          <p className="dash-empty-sub">
            Join a room to start your first tutoring session. Your session history and engagement stats will appear here.
          </p>
        </div>
      ) : (
        <div className="dash-sessions">
          {sessions.map((s) => {
            const summary = summaries[s.id];
            return (
              <div key={s.id} className="dash-session-card">
                <div className="dash-session-top">
                  <div>
                    <strong className="dash-session-subject">{s.subject || "Session"}</strong>
                    <span className="dash-session-level">{s.student_level}</span>
                  </div>
                  <span className="dash-session-time">{formatDate(s.started_at)}</span>
                </div>
                <div className="dash-session-meta">
                  {summary && (
                    <span className="dash-session-duration">{summary.duration_minutes}m</span>
                  )}
                  <span
                    className="dash-session-score"
                    style={{ color: scoreColor(s.engagement_score ?? summary?.engagement_score ?? null) }}
                  >
                    {s.engagement_score ?? summary?.engagement_score
                      ? `${Math.round(s.engagement_score ?? summary?.engagement_score ?? 0)}%`
                      : "—"}
                  </span>
                  {!s.ended_at && <span className="dash-session-live">LIVE</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
