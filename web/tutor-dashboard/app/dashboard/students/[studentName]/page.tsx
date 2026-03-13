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
} from "recharts";
import { fetchSessionsForStudent } from "@/lib/queries";
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

export default function StudentDetailPage() {
  const params = useParams();
  const studentName = decodeURIComponent(params.studentName as string);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessionsForStudent(studentName)
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [studentName]);

  if (loading) {
    return <div className="loading">Loading student data...</div>;
  }

  const totalSessions = sessions.length;
  const avgEngagement =
    totalSessions > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + (s.engagement_score ?? 0), 0) /
            totalSessions
        )
      : 0;

  const subjects = [
    ...new Set(sessions.map((s) => s.subject).filter(Boolean)),
  ];

  const chartData = [...sessions]
    .reverse()
    .map((s) => ({
      date: new Date(s.started_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      engagement: s.engagement_score ?? 0,
    }));

  return (
    <>
      <div className="detail-header">
        <Link href="/dashboard/students" className="back-link">
          &larr; Students
        </Link>
        <h1
          style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, flex: 1 }}
        >
          {studentName}
        </h1>
      </div>

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
          <span className="stat-label">Subjects</span>
          <span className="stat-value orange">
            {subjects.length > 0 ? subjects.join(", ") : "--"}
          </span>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="chart-card">
          <h2>Engagement Trend</h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="studentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#784BA0" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#784BA0" stopOpacity={0} />
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
                stroke="#784BA0"
                strokeWidth={2}
                fill="url(#studentGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="section-header">
        <h2>Session History</h2>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">
          <p>No sessions found for this student.</p>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/sessions/${s.id}`}
              className="session-card"
            >
              <div className="session-info">
                <div className="session-student">
                  {s.subject ?? "Session"}
                </div>
                <div className="session-meta">
                  <span>{formatDate(s.started_at)}</span>
                  {s.student_level && <span>{s.student_level}</span>}
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
