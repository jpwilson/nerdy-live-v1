"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchSessions } from "@/lib/queries";
import type { Session } from "@/lib/types";

function engagementClass(score: number | null) {
  if (score === null) return "mid";
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OverviewPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading sessions...</div>;
  }

  const totalSessions = sessions.length;
  const uniqueStudents = new Set(sessions.map((s) => s.student_name)).size;
  const avgEngagement =
    totalSessions > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + (s.engagement_score ?? 0), 0) /
            totalSessions
        )
      : 0;

  // Build chart data: engagement over time (chronological)
  const chartData = [...sessions]
    .reverse()
    .map((s) => ({
      date: new Date(s.started_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      engagement: s.engagement_score ?? 0,
    }));

  const recentSessions = sessions.slice(0, 10);

  return (
    <>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.5rem", fontWeight: 700 }}>
        Overview
      </h1>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Sessions</span>
          <span className="stat-value cyan">{totalSessions}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Avg Engagement</span>
          <span className="stat-value purple">{avgEngagement}%</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Students</span>
          <span className="stat-value orange">{uniqueStudents}</span>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="chart-card">
          <h2>Engagement Over Time</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4AA" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00D4AA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke="#5A5B6E"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#5A5B6E"
                fontSize={12}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1A1B2E",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  color: "#fff",
                }}
                formatter={(value: number) => [`${value}%`, "Engagement"]}
              />
              <Area
                type="monotone"
                dataKey="engagement"
                stroke="#00D4AA"
                strokeWidth={2}
                fill="url(#engGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="section-header">
        <h2>Recent Sessions</h2>
        <Link href="/dashboard/sessions" className="back-link">
          View all
        </Link>
      </div>

      {recentSessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">--</div>
          <p>No sessions yet. Start a tutoring session from the iOS app.</p>
        </div>
      ) : (
        <div className="session-list">
          {recentSessions.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/sessions/${s.id}`}
              className="session-card"
            >
              <div className="session-info">
                <div className="session-student">{s.student_name}</div>
                <div className="session-meta">
                  <span>{formatDate(s.started_at)}</span>
                  {s.subject && <span>{s.subject}</span>}
                </div>
              </div>
              <div
                className={`engagement-badge ${engagementClass(
                  s.engagement_score
                )}`}
              >
                {s.engagement_score ?? "--"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
