"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  fetchSessionWithSummary,
  fetchMetricsSnapshots,
  fetchNudges,
} from "@/lib/queries";
import type {
  Session,
  SessionSummary,
  MetricsSnapshot,
  CoachingNudge,
} from "@/lib/types";

function engagementClass(score: number | null) {
  if (score === null) return "mid";
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [snapshots, setSnapshots] = useState<MetricsSnapshot[]>([]);
  const [nudges, setNudges] = useState<CoachingNudge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchSessionWithSummary(sessionId),
      fetchMetricsSnapshots(sessionId),
      fetchNudges(sessionId),
    ])
      .then(([{ session: s, summary: sm }, snaps, nds]) => {
        setSession(s);
        setSummary(sm);
        setSnapshots(snaps);
        setNudges(nds);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return <div className="loading">Loading session...</div>;
  }

  if (!session) {
    return (
      <div className="empty-state">
        <p>Session not found.</p>
        <Link href="/dashboard/sessions" className="back-link">
          &larr; Back to sessions
        </Link>
      </div>
    );
  }

  const score = summary?.engagement_score ?? session.engagement_score ?? null;

  // Chart data from metrics_snapshots
  const chartData = snapshots.map((snap) => ({
    time: formatTimestamp(snap.timestamp),
    engagement: Math.round(snap.engagement_trend * 100),
    tutorEye: Math.round(snap.tutor_eye_contact * 100),
    studentEye: Math.round(snap.student_eye_contact * 100),
    tutorTalk: Math.round(snap.tutor_talk_pct * 100),
    studentTalk: Math.round(snap.student_talk_pct * 100),
  }));

  return (
    <>
      <div className="detail-header">
        <Link href="/dashboard/sessions" className="back-link">
          &larr; Sessions
        </Link>
        <h1
          style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, flex: 1 }}
        >
          {session.student_name}
          {session.subject ? ` - ${session.subject}` : ""}
        </h1>
        {score !== null && (
          <div
            className={`detail-score engagement-badge ${engagementClass(
              score
            )}`}
          >
            {score}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Duration</span>
            <span className="stat-value cyan">
              {summary.duration_minutes} min
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Interruptions</span>
            <span className="stat-value orange">
              {summary.total_interruptions}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Engagement</span>
            <span className="stat-value purple">
              {summary.engagement_score}%
            </span>
          </div>
        </div>
      )}

      {/* Metrics Summary Table */}
      {summary && (
        <>
          <div className="section-header">
            <h2>Session Metrics</h2>
          </div>
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Tutor</th>
                <th>Student</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Talk Time</td>
                <td>{pct(summary.talk_time_ratio.tutor)}</td>
                <td>{pct(summary.talk_time_ratio.student)}</td>
              </tr>
              <tr>
                <td>Eye Contact</td>
                <td>{pct(summary.avg_eye_contact.tutor)}</td>
                <td>{pct(summary.avg_eye_contact.student)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* Session Info */}
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="stat-card">
          <span className="stat-label">Started</span>
          <span
            className="stat-value"
            style={{ fontSize: "1rem", color: "var(--muted)" }}
          >
            {formatDate(session.started_at)}
          </span>
        </div>
        {session.ended_at && (
          <div className="stat-card">
            <span className="stat-label">Ended</span>
            <span
              className="stat-value"
              style={{ fontSize: "1rem", color: "var(--muted)" }}
            >
              {formatDate(session.ended_at)}
            </span>
          </div>
        )}
        {session.student_level && (
          <div className="stat-card">
            <span className="stat-label">Student Level</span>
            <span
              className="stat-value"
              style={{ fontSize: "1rem", color: "var(--muted)" }}
            >
              {session.student_level}
            </span>
          </div>
        )}
      </div>

      {/* Engagement Timeline Chart */}
      {chartData.length > 1 && (
        <div className="chart-card">
          <h2>Engagement Timeline</h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="engLine" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4AA" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00D4AA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                stroke="#5A5B6E"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#5A5B6E"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1A1B2E",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: "0.85rem",
                }}
                formatter={(value: number, name: string) => [
                  `${value}%`,
                  name,
                ]}
              />
              <Area
                type="monotone"
                dataKey="engagement"
                stroke="#00D4AA"
                strokeWidth={2}
                fill="url(#engLine)"
                name="Engagement"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Eye Contact & Talk Time chart */}
      {chartData.length > 1 && (
        <div className="chart-card">
          <h2>Eye Contact &amp; Talk Time</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="time"
                stroke="#5A5B6E"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#5A5B6E"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1A1B2E",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: "0.85rem",
                }}
                formatter={(value: number, name: string) => [
                  `${value}%`,
                  name,
                ]}
              />
              <Line
                type="monotone"
                dataKey="tutorEye"
                stroke="#00D4AA"
                strokeWidth={2}
                dot={false}
                name="Tutor Eye Contact"
              />
              <Line
                type="monotone"
                dataKey="studentEye"
                stroke="#784BA0"
                strokeWidth={2}
                dot={false}
                name="Student Eye Contact"
              />
              <Line
                type="monotone"
                dataKey="tutorTalk"
                stroke="#FF6B35"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 4"
                name="Tutor Talk %"
              />
              <Line
                type="monotone"
                dataKey="studentTalk"
                stroke="#2B86C5"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 4"
                name="Student Talk %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Key Moments */}
      {summary && summary.key_moments && summary.key_moments.length > 0 && (
        <>
          <div className="section-header">
            <h2>Key Moments</h2>
          </div>
          <div className="moment-list">
            {summary.key_moments.map((m, i) => (
              <div key={i} className="moment-item">
                <span className="moment-type">{m.type}</span>
                <div className="moment-desc">{m.description}</div>
                {m.timestamp && (
                  <div className="moment-time">
                    {formatTimestamp(m.timestamp)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Coaching Nudges */}
      {nudges.length > 0 && (
        <>
          <div className="section-header">
            <h2>Coaching Nudges</h2>
          </div>
          <div className="nudge-list">
            {nudges.map((n) => (
              <div key={n.id} className="nudge-item">
                <span
                  className={`nudge-type ${
                    n.priority === "high"
                      ? "high"
                      : n.priority === "medium"
                      ? "medium"
                      : ""
                  }`}
                >
                  {n.nudge_type}
                </span>
                <div className="nudge-msg">{n.message}</div>
                <div className="nudge-time">
                  {formatTimestamp(n.timestamp)}
                  {n.was_dismissed ? " (dismissed)" : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recommendations */}
      {summary &&
        summary.recommendations &&
        summary.recommendations.length > 0 && (
          <>
            <div className="section-header">
              <h2>Recommendations</h2>
            </div>
            <div className="rec-list">
              {summary.recommendations.map((rec, i) => (
                <div key={i} className="rec-item">
                  <span className="rec-bullet">&bull;</span>
                  {rec}
                </div>
              ))}
            </div>
          </>
        )}
    </>
  );
}
