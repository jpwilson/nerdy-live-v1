"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionsPage() {
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

  return (
    <>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.5rem", fontWeight: 700 }}>
        All Sessions
      </h1>

      {sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">--</div>
          <p>No sessions recorded yet.</p>
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
                <div className="session-student">{s.student_name}</div>
                <div className="session-meta">
                  <span>{formatDate(s.started_at)}</span>
                  <span>{formatTime(s.started_at)}</span>
                  {s.subject && <span>{s.subject}</span>}
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
