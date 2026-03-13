"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchStudents } from "@/lib/queries";
import type { StudentAggregate } from "@/lib/types";

function engagementClass(score: number) {
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

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentAggregate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents()
      .then(setStudents)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading students...</div>;
  }

  return (
    <>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.5rem", fontWeight: 700 }}>
        Students
      </h1>

      {students.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">--</div>
          <p>No students found. Complete a session to see student data.</p>
        </div>
      ) : (
        <div className="students-grid">
          {students.map((st) => (
            <Link
              key={st.student_name}
              href={`/dashboard/students/${encodeURIComponent(
                st.student_name
              )}`}
              className="student-row"
            >
              <div className="student-avatar">
                {st.student_name.charAt(0).toUpperCase()}
              </div>
              <div className="student-info">
                <div className="student-name">{st.student_name}</div>
                <div className="student-meta">
                  <span>
                    {st.session_count} session
                    {st.session_count !== 1 ? "s" : ""}
                  </span>
                  <span>Last: {formatDate(st.last_session_date)}</span>
                </div>
              </div>
              <div
                className={`engagement-badge ${engagementClass(
                  st.avg_engagement
                )}`}
              >
                {st.avg_engagement}%
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
