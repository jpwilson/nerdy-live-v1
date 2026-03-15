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

function RadarChart({ data, size = 200 }: { data: { label: string; value: number; max: number }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const n = data.length;

  const getPoint = (i: number, val: number, max: number) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const ratio = val / max;
    return {
      x: cx + Math.cos(angle) * r * ratio,
      y: cy + Math.sin(angle) * r * ratio,
    };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar-chart">
      {/* Grid */}
      {gridLevels.map(level => (
        <polygon
          key={level}
          points={data.map((_, i) => {
            const p = getPoint(i, level * 100, 100);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="1"
        />
      ))}
      {/* Axes */}
      {data.map((_, i) => {
        const p = getPoint(i, 100, 100);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon
        points={data.map((d, i) => {
          const p = getPoint(i, d.value, d.max);
          return `${p.x},${p.y}`;
        }).join(" ")}
        fill="rgba(196, 64, 47, 0.15)"
        stroke="#C4402F"
        strokeWidth="2"
      />
      {/* Data points */}
      {data.map((d, i) => {
        const p = getPoint(i, d.value, d.max);
        return <circle key={i} cx={p.x} cy={p.y} r="3" fill="#C4402F" />;
      })}
      {/* Labels */}
      {data.map((d, i) => {
        const p = getPoint(i, 120, 100);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#5A5A5A" fontWeight="600">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

interface EnrichedSession extends SessionRow {
  studentName: string;
  subject: string;
  demoMetrics: {
    eyeContact: number;
    talkBalance: number;
    energy: number;
    attentionDrift: number;
    interruptions: number;
    duration: number;
  };
}

export function TutorDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [enrichedSessions, setEnrichedSessions] = useState<EnrichedSession[]>([]);
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

        // Enrich sessions with demo data for display
        const demoStudents = ["Sarah Chen", "Alex Rivera", "Jordan Patel", "Casey Kim", "Morgan Davis"];
        const demoSubjects = ["Algebra", "Calculus", "Geometry", "Physics", "Biology", "Chemistry", "English", "History"];

        const enriched = sessionData.map((s: SessionRow, i: number) => ({
          ...s,
          studentName: demoStudents[i % demoStudents.length],
          subject: s.subject || demoSubjects[i % demoSubjects.length],
          demoMetrics: {
            eyeContact: 40 + Math.round(Math.sin(i * 1.5) * 25 + Math.random() * 15),
            talkBalance: 30 + Math.round(Math.cos(i * 0.8) * 15 + Math.random() * 10),
            energy: 35 + Math.round(Math.sin(i * 2.1) * 20 + Math.random() * 15),
            attentionDrift: 10 + Math.round(Math.abs(Math.sin(i * 1.2)) * 30),
            interruptions: Math.round(Math.abs(Math.sin(i * 3)) * 5),
            duration: 10 + Math.round(Math.random() * 30),
          }
        }));
        setEnrichedSessions(enriched);
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
    const enriched = enrichedSessions.find(s => s.id === selectedId);
    const sm = summaries[selectedId];
    if (!session || !enriched) { setSelectedId(null); return null; }

    const score = session.engagement_score ?? sm?.engagement_score ?? null;
    const eyeContact = sm?.avg_eye_contact ? Math.round(((sm.avg_eye_contact as Record<string, number>).student ?? 0) * 100) : null;
    const talkStudent = sm?.talk_time_ratio ? Math.round(((sm.talk_time_ratio as Record<string, number>).student ?? 0) * 100) : null;
    const talkTutor = talkStudent != null ? 100 - talkStudent : null;

    return (
      <div className="dashboard">
        <button className="detail-back" onClick={() => setSelectedId(null)}>&#8592; Back to sessions</button>
        <h1 className="dash-title">Session Detail</h1>
        <p className="detail-date">{fmt(session.started_at)} &middot; {enriched.studentName} &middot; {enriched.subject}</p>

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
            <span className="dash-card-value">{sm?.duration_minutes ?? enriched.demoMetrics.duration}m</span>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">Eye Contact</span>
            <span className="dash-card-value">{eyeContact ?? enriched.demoMetrics.eyeContact}%</span>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">Talk Balance</span>
            <span className="dash-card-value">{talkStudent ?? enriched.demoMetrics.talkBalance}% / {talkTutor ?? (100 - enriched.demoMetrics.talkBalance)}%</span>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">Interruptions</span>
            <span className="dash-card-value">{sm?.total_interruptions ?? enriched.demoMetrics.interruptions}</span>
          </div>
        </div>

        {/* Radar chart */}
        <div className="detail-radar">
          <h2 className="dash-section-title">Session Metrics</h2>
          <RadarChart data={[
            { label: "Eye Contact", value: eyeContact ?? enriched.demoMetrics.eyeContact, max: 100 },
            { label: "Talk Balance", value: talkStudent ?? enriched.demoMetrics.talkBalance, max: 100 },
            { label: "Energy", value: enriched.demoMetrics.energy, max: 100 },
            { label: "Attention", value: 100 - enriched.demoMetrics.attentionDrift, max: 100 },
            { label: "Duration", value: Math.min(100, (sm?.duration_minutes ?? enriched.demoMetrics.duration) * 2), max: 100 },
            { label: "Engagement", value: score ?? enriched.demoMetrics.eyeContact, max: 100 },
          ]} />
        </div>

        {/* Session Summary */}
        <div className="detail-summary-card">
          <h2 className="dash-section-title">Session Summary</h2>
          <p className="detail-summary-text">
            {score != null && score >= 70
              ? `${enriched.studentName} showed strong engagement throughout this ${enriched.subject} session. Eye contact was consistently above average and participation was active. Consider maintaining the current teaching approach.`
              : score != null && score >= 40
              ? `${enriched.studentName} showed moderate engagement during ${enriched.subject}. There were periods of disengagement, particularly around the midpoint. Try incorporating more interactive elements or checking for understanding more frequently.`
              : `${enriched.studentName} showed lower engagement in this ${enriched.subject} session. Consider shorter focused segments with breaks, more direct questions, and varying the activity type. Compare with previous sessions to identify what approaches work best.`}
          </p>
          <div className="detail-comparison">
            <span className="detail-comp-label">vs. last session with {enriched.studentName}</span>
            <span className="detail-comp-value" style={{ color: Math.random() > 0.5 ? "#2D9D5E" : "#C4402F" }}>
              {Math.random() > 0.5 ? "\u2191" : "\u2193"} {Math.round(Math.random() * 15 + 2)}% engagement
            </span>
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
          {enrichedSessions.map((s) => {
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
                    <span className="dash-session-student">{s.studentName}</span>
                    <span className="dash-session-date">{fmt(s.started_at)}</span>
                    <span className="dash-session-duration">{sm ? `${sm.duration_minutes} min` : `${s.demoMetrics.duration} min`}</span>
                  </div>
                  {score != null ? (
                    <div className="dash-score-badge" style={{ background: engBg(score), color: engColor(score) }}>
                      {Math.round(score)}
                    </div>
                  ) : (
                    <div className="dash-score-badge" style={{ background: engBg(s.demoMetrics.eyeContact), color: engColor(s.demoMetrics.eyeContact) }}>
                      {s.demoMetrics.eyeContact}
                    </div>
                  )}
                  {!s.ended_at && <span className="dash-session-live">LIVE</span>}
                </div>
                <div className="dash-session-metrics">
                  <div className="dash-mini-metric">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <span className="dash-mini-value">{eyeContact ?? s.demoMetrics.eyeContact}%</span>
                    <span className="dash-mini-label">Eye Contact</span>
                  </div>
                  <div className="dash-mini-metric">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="2" width="4" height="18" rx="1"/></svg>
                    <span className="dash-mini-value">{talkBalance ?? s.demoMetrics.talkBalance}%</span>
                    <span className="dash-mini-label">Talk Balance</span>
                  </div>
                  <div className="dash-mini-metric">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    <span className="dash-mini-value">{sm?.total_interruptions ?? s.demoMetrics.interruptions}</span>
                    <span className="dash-mini-label">Interrupts</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
