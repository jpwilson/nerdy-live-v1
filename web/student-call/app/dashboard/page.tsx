"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { TutorDashboard } from "@/components/tutor-dashboard";
import { SessionGraph } from "@/components/session-graph";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"analytics" | "settings">("analytics");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<"sessions" | "trends" | "graph">("sessions");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.email) {
        router.push("/");
      } else {
        setEmail(session.user.email);
      }
      setLoading(false);
    });
  }, [router]);

  if (loading) return <main className="dash-shell"><p style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading...</p></main>;
  if (!email) return null;

  const displayName = localStorage.getItem("livesesh_displayName") || email.split("@")[0];
  const roomCode = localStorage.getItem("livesesh_roomId") || "demo-room";
  const role = localStorage.getItem("livesesh_role") || "tutor_preview";

  const joinRoom = () => {
    const params = new URLSearchParams({ name: displayName, role });
    router.push(`/room/${encodeURIComponent(roomCode)}?${params.toString()}`);
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    localStorage.removeItem("livesesh_displayName");
    localStorage.removeItem("livesesh_roomId");
    localStorage.removeItem("livesesh_role");
    window.location.href = "/";
  };

  // Demo session data for graph visualization
  const demoSessions = [
    { id: "s1", subject: "Algebra", date: "2026-03-14", engagement: 82, eyeContact: 78, talkBalance: 42, interruptions: 2, duration: 35, student: "Sarah Chen" },
    { id: "s2", subject: "Physics", date: "2026-03-13", engagement: 91, eyeContact: 88, talkBalance: 48, interruptions: 1, duration: 45, student: "Alex Rivera" },
    { id: "s3", subject: "Chemistry", date: "2026-03-13", engagement: 45, eyeContact: 32, talkBalance: 18, interruptions: 6, duration: 50, student: "Jordan Patel" },
    { id: "s4", subject: "Algebra", date: "2026-03-12", engagement: 75, eyeContact: 72, talkBalance: 38, interruptions: 3, duration: 28, student: "Sarah Chen" },
    { id: "s5", subject: "Biology", date: "2026-03-12", engagement: 73, eyeContact: 70, talkBalance: 40, interruptions: 3, duration: 55, student: "Casey Kim" },
    { id: "s6", subject: "Physics", date: "2026-03-11", engagement: 85, eyeContact: 80, talkBalance: 45, interruptions: 2, duration: 40, student: "Alex Rivera" },
    { id: "s7", subject: "History", date: "2026-03-11", engagement: 42, eyeContact: 35, talkBalance: 15, interruptions: 7, duration: 35, student: "Morgan Davis" },
    { id: "s8", subject: "Chemistry", date: "2026-03-10", engagement: 58, eyeContact: 50, talkBalance: 25, interruptions: 4, duration: 30, student: "Jordan Patel" },
    { id: "s9", subject: "English", date: "2026-03-09", engagement: 88, eyeContact: 85, talkBalance: 55, interruptions: 1, duration: 40, student: "Casey Kim" },
    { id: "s10", subject: "History", date: "2026-03-08", engagement: 62, eyeContact: 58, talkBalance: 30, interruptions: 3, duration: 25, student: "Morgan Davis" },
    { id: "s11", subject: "Geometry", date: "2026-03-07", engagement: 79, eyeContact: 75, talkBalance: 44, interruptions: 2, duration: 42, student: "Sarah Chen" },
    { id: "s12", subject: "Mathematics", date: "2026-03-06", engagement: 68, eyeContact: 62, talkBalance: 35, interruptions: 4, duration: 60, student: "Alex Rivera" },
  ];

  return (
    <main className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-sidebar-profile">
          <div className="dash-avatar">{displayName.charAt(0).toUpperCase()}</div>
          <span className="dash-profile-name">{displayName}</span>
          <span className="dash-profile-email">{email}</span>
        </div>

        <nav className="dash-sidebar-nav">
          {(["analytics", "settings"] as const).map((tab) => (
            <button
              key={tab}
              className={`dash-sidebar-link ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "analytics" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              )}
              {tab === "settings" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              )}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        <button className="dash-sidebar-join" onClick={joinRoom}>
          Start Session →
        </button>
        <button className="dash-sidebar-signout" onClick={() => void signOut()}>
          Sign Out
        </button>
      </aside>

      <div className="dash-main">
        {activeTab === "analytics" && (
          <div className="dash-tab-panel">
            <h1 className="dash-title">Analytics</h1>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>Cross-session insights and engagement trends.</p>

            {/* Sub-tabs */}
            <div className="analytics-subtabs">
              <button className={`analytics-subtab ${analyticsSubTab === "sessions" ? "active" : ""}`} onClick={() => setAnalyticsSubTab("sessions")}>
                Previous Sessions
              </button>
              <button className={`analytics-subtab ${analyticsSubTab === "trends" ? "active" : ""}`} onClick={() => setAnalyticsSubTab("trends")}>
                Trends
              </button>
              <button className={`analytics-subtab ${analyticsSubTab === "graph" ? "active" : ""}`} onClick={() => setAnalyticsSubTab("graph")}>
                Session Graph
              </button>
            </div>

            {analyticsSubTab === "sessions" && (
              <TutorDashboard />
            )}

            {analyticsSubTab === "graph" && (
              <SessionGraph sessions={demoSessions} />
            )}

            {analyticsSubTab === "trends" && (
              <div className="trends-panel">
                {/* Per-student trend charts */}
                {["Sarah Chen", "Alex Rivera", "Jordan Patel", "Casey Kim", "Morgan Davis"].map(student => {
                  // Get sessions for this student from demoSessions
                  const studentSessions = demoSessions
                    .filter(s => s.student === student)
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                  if (studentSessions.length === 0) return null;

                  const avgEng = Math.round(studentSessions.reduce((a, b) => a + b.engagement, 0) / studentSessions.length);
                  const firstEng = studentSessions[0].engagement;
                  const lastEng = studentSessions[studentSessions.length - 1].engagement;
                  const trendDir = lastEng > firstEng + 3 ? "↑ Improving" : lastEng < firstEng - 3 ? "↓ Declining" : "→ Stable";
                  const trendColor = trendDir.includes("Improving") ? "#2D9D5E" : trendDir.includes("Declining") ? "#C4402F" : "var(--muted)";

                  return (
                    <div key={student} className="student-trend-card">
                      <div className="student-trend-header">
                        <div>
                          <span className="student-trend-name">{student}</span>
                          <span className="student-trend-sessions">{studentSessions.length} sessions · Avg: {avgEng}%</span>
                        </div>
                        <span className="student-trend-dir" style={{ color: trendColor }}>{trendDir}</span>
                      </div>

                      {/* Multi-metric chart */}
                      <svg viewBox="0 0 500 140" className="student-trend-chart">
                        {/* Grid */}
                        {[0, 1, 2, 3, 4].map(i => (
                          <line key={i} x1="40" y1={15 + i * 27} x2="490" y2={15 + i * 27} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                        ))}
                        {/* Y labels */}
                        <text x="8" y="18" fontSize="9" fill="#999">100</text>
                        <text x="8" y="72" fontSize="9" fill="#999">50</text>
                        <text x="8" y="126" fontSize="9" fill="#999">0</text>

                        {/* X labels — actual dates */}
                        {studentSessions.map((s, i) => (
                          <text key={i} x={40 + (i / Math.max(1, studentSessions.length - 1)) * 450} y="138" fontSize="8" fill="#999" textAnchor="middle">
                            {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </text>
                        ))}

                        {/* Engagement line */}
                        <polyline
                          fill="none" stroke="#C4402F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          points={studentSessions.map((s, i) => {
                            const x = 40 + (i / Math.max(1, studentSessions.length - 1)) * 450;
                            const y = 123 - (s.engagement / 100) * 108;
                            return `${x},${y}`;
                          }).join(" ")}
                        />
                        {studentSessions.map((s, i) => {
                          const x = 40 + (i / Math.max(1, studentSessions.length - 1)) * 450;
                          const y = 123 - (s.engagement / 100) * 108;
                          return <circle key={`e${i}`} cx={x} cy={y} r="4" fill="#C4402F" />;
                        })}

                        {/* Eye contact line */}
                        <polyline
                          fill="none" stroke="#2B86C5" strokeWidth="1.5" strokeDasharray="4 2" strokeLinecap="round"
                          points={studentSessions.map((s, i) => {
                            const x = 40 + (i / Math.max(1, studentSessions.length - 1)) * 450;
                            const y = 123 - (s.eyeContact / 100) * 108;
                            return `${x},${y}`;
                          }).join(" ")}
                        />

                        {/* Talk balance line */}
                        <polyline
                          fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeDasharray="2 3" strokeLinecap="round"
                          points={studentSessions.map((s, i) => {
                            const x = 40 + (i / Math.max(1, studentSessions.length - 1)) * 450;
                            const y = 123 - (s.talkBalance / 100) * 108;
                            return `${x},${y}`;
                          }).join(" ")}
                        />
                      </svg>

                      <div className="student-trend-legend">
                        <span><span className="legend-dot" style={{ background: "#C4402F" }} /> Engagement</span>
                        <span><span className="legend-dot" style={{ background: "#2B86C5" }} /> Eye Contact</span>
                        <span><span className="legend-dot" style={{ background: "#8B5CF6" }} /> Talk Balance</span>
                      </div>

                      <p className="student-trend-desc">
                        {trendDir.includes("Improving")
                          ? `${student}'s engagement has been trending upward across recent sessions. Eye contact and participation are both strengthening.`
                          : trendDir.includes("Declining")
                          ? `${student}'s engagement is declining. Consider changing the teaching approach — try more interactive methods or shorter sessions.`
                          : `${student} shows consistent engagement levels. Look for opportunities to push engagement higher with varied activities.`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {activeTab === "settings" && (
          <div className="dash-tab-panel">
            <h1 className="dash-title">Settings</h1>

            <div className="settings-card">
              <h2 className="settings-card-title">Profile</h2>
              <div className="settings-row">
                <span className="settings-label">Name</span>
                <span className="settings-value">{displayName}</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Email</span>
                <span className="settings-value">{email}</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Role</span>
                <span className="settings-value" style={{ color: "var(--accent)" }}>Tutor</span>
              </div>
            </div>

            <div className="settings-card">
              <h2 className="settings-card-title">Room Connection</h2>
              <div className="settings-row">
                <span className="settings-label">Room Code</span>
                <span className="settings-value">{localStorage.getItem("livesesh_roomId") || "demo-room"}</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
                Share this room code with your student. They join from the web app.
              </p>
            </div>

            <div className="settings-card">
              <h2 className="settings-card-title">Coaching Engine</h2>
              <div className="settings-row">
                <span className="settings-label">Grace period</span>
                <span className="settings-value">5 minutes</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Assessment window</span>
                <span className="settings-value">3 minutes</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Escalation</span>
                <span className="settings-value">L1 → L2 → L3</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
                Nudges are based on window-over-window engagement trends compared to the session baseline. No nudges fire during the first 5 minutes.
              </p>
            </div>

            <div className="settings-card">
              <h2 className="settings-card-title">System</h2>
              <div className="settings-row">
                <span className="settings-label">Video analysis latency</span>
                <span className="settings-value">~150ms</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Audio analysis latency</span>
                <span className="settings-value">~30ms</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">End-to-end latency</span>
                <span className="settings-value" style={{ color: "var(--accent)" }}>&lt;500ms</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
                Processing latencies measured on-device. Video analysis uses Apple Vision framework; audio analysis uses AVCaptureSession pipeline.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
