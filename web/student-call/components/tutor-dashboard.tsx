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
  avg_eye_contact: Record<string, number> | null;
  talk_time_ratio: Record<string, number> | null;
  recommendations: string[];
}

export function TutorDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SummaryRow>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          .select("session_id, duration_minutes, engagement_score, total_interruptions, avg_eye_contact, talk_time_ratio, recommendations")
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

  const completed = sessions.filter((s) => s.ended_at);
  const avgEng = completed.length > 0
    ? Math.round(completed.reduce((sum, s) => sum + (s.engagement_score ?? 0), 0) / completed.length)
    : null;
  const totalMin = Object.values(summaries).reduce((sum, s) => sum + s.duration_minutes, 0);

  // Trend
  const recent = completed.slice(0, 5).map((s) => s.engagement_score ?? 0);
  const older = completed.slice(5, 10).map((s) => s.engagement_score ?? 0);
  const rAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const oAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;
  const trend = older.length === 0 ? "—" : rAvg > oAvg + 3 ? "Improving" : rAvg < oAvg - 3 ? "Declining" : "Stable";

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const engColor = (s: number | null) =>
    s == null ? "var(--muted)" : s >= 70 ? "var(--success)" : s >= 40 ? "var(--warn)" : "var(--danger)";
  const engBg = (s: number | null) =>
    s == null ? "rgba(139,140,160,0.15)" : s >= 70 ? "rgba(0,212,170,0.15)" : s >= 40 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";
  const trendColor = trend === "Improving" ? "var(--success)" : trend === "Declining" ? "var(--danger)" : "var(--muted)";

  if (selectedId) {
    const session = sessions.find(s => s.id === selectedId);
    const sm = summaries[selectedId];
    if (!session) { setSelectedId(null); return null; }

    const score = session.engagement_score ?? sm?.engagement_score ?? null;
    const eyeContact = sm?.avg_eye_contact ? Math.round(((sm.avg_eye_contact as Record<string, number>).student ?? 0) * 100) : null;
    const talkStudent = sm?.talk_time_ratio ? Math.round(((sm.talk_time_ratio as Record<string, number>).student ?? 0) * 100) : null;
    const talkTutor = talkStudent != null ? 100 - talkStudent : null;

    return (
      <div className="dashboard">
        <button className="detail-back" onClick={() => setSelectedId(null)}>&#8592; Back to sessions</button>
        <h1 className="dash-title">Session Detail</h1>
        <p className="detail-date">{fmt(session.started_at)}</p>

        {/* Score badge */}
        <div className="detail-score-section">
          <div className="detail-score-badge" style={{ background: engBg(score), color: engColor(score) }}>
            {score != null ? Math.round(score) : "\u2014"}
          </div>
          <div>
            <span className="detail-score-label">Engagement Score</span>
            <span className="detail-score-interp">
              {score != null ? (score >= 70 ? "Good session" : score >= 40 ? "Moderate engagement" : "Low engagement \u2014 review recommendations") : "No data"}
            </span>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="dash-grid">
          <div className="dash-card">
            <span className="dash-card-label">Duration</span>
            <span className="dash-card-value">{sm?.duration_minutes ?? 0}m</span>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">Eye Contact</span>
            <span className="dash-card-value">{eyeContact ?? 0}%</span>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">Talk Balance</span>
            <span className="dash-card-value">{talkStudent ?? 0}% / {talkTutor ?? 0}%</span>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">Interruptions</span>
            <span className="dash-card-value">{sm?.total_interruptions ?? 0}</span>
          </div>
        </div>

        {/* Engagement timeline placeholder */}
        <div className="detail-timeline">
          <h2 className="dash-section-title">Engagement Timeline</h2>
          <div className="detail-timeline-placeholder">
            Timeline visualization &mdash; coming soon
          </div>
        </div>

        {/* Recommendations */}
        {sm?.recommendations && sm.recommendations.length > 0 && (
          <div className="detail-recommendations">
            <h2 className="dash-section-title">Recommendations</h2>
            <ul className="detail-rec-list">
              {sm.recommendations.map((rec: string, i: number) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1 className="dash-title">Analytics</h1>

      {/* 2x2 stat grid like iOS */}
      <div className="dash-grid">
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
          <span className="dash-card-value">{sessions.length}</span>
          <span className="dash-card-label">Sessions</span>
        </div>
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span className="dash-card-value" style={{ color: engColor(avgEng) }}>
            {avgEng != null ? `${avgEng}%` : "—"}
          </span>
          <span className="dash-card-label">Avg. Score</span>
        </div>
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span className="dash-card-value">{totalMin > 0 ? `${totalMin}m` : "—"}</span>
          <span className="dash-card-label">Total Time</span>
        </div>
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={trendColor} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span className="dash-card-value" style={{ color: trendColor }}>{trend}</span>
          <span className="dash-card-label">Trend</span>
        </div>
      </div>

      {/* Recent sessions */}
      <h2 className="dash-section-title">Recent Sessions</h2>

      {loading ? (
        <p className="dash-empty">Loading...</p>
      ) : sessions.length === 0 ? (
        <div className="dash-empty-card">
          <p className="dash-empty">No sessions yet.</p>
          <p className="dash-empty-sub">Start a session to see analytics here.</p>
        </div>
      ) : (
        <div className="dash-sessions">
          {sessions.map((s) => {
            const sm = summaries[s.id];
            const score = s.engagement_score ?? sm?.engagement_score ?? null;
            const eyeContact = sm?.avg_eye_contact
              ? Math.round(((sm.avg_eye_contact as Record<string, number>).student ?? 0) * 100)
              : null;
            const talkBalance = sm?.talk_time_ratio
              ? Math.round(((sm.talk_time_ratio as Record<string, number>).student ?? 0) * 100)
              : null;
            return (
              <div key={s.id} className="dash-session-card" onClick={() => setSelectedId(s.id)}>
                <div className="dash-session-top">
                  <div>
                    <span className="dash-session-date">{fmt(s.started_at)}</span>
                    <span className="dash-session-duration">{sm ? `${sm.duration_minutes} min` : ""}</span>
                  </div>
                  {score != null && (
                    <div className="dash-score-badge" style={{ background: engBg(score), color: engColor(score) }}>
                      {Math.round(score)}
                    </div>
                  )}
                  {!s.ended_at && <span className="dash-session-live">LIVE</span>}
                </div>
                {sm && (
                  <div className="dash-session-metrics">
                    <div className="dash-mini-metric">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      <span className="dash-mini-value">{eyeContact ?? 0}%</span>
                      <span className="dash-mini-label">Eye Contact</span>
                    </div>
                    <div className="dash-mini-metric">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="2" width="4" height="18" rx="1"/></svg>
                      <span className="dash-mini-value">{talkBalance ?? 0}%</span>
                      <span className="dash-mini-label">Talk Balance</span>
                    </div>
                    <div className="dash-mini-metric">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      <span className="dash-mini-value">{sm.total_interruptions}</span>
                      <span className="dash-mini-label">Interrupts</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
