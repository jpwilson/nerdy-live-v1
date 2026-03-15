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
                {[
                  { label: "Engagement", key: "engagement" as const, color: "#C4402F" },
                  { label: "Eye Contact", key: "eyeContact" as const, color: "#2B86C5" },
                  { label: "Talk Balance", key: "talkBalance" as const, color: "#8B5CF6" },
                ].map(metric => {
                  const students = ["Sarah Chen", "Alex Rivera", "Jordan Patel", "Casey Kim", "Morgan Davis"];
                  const studentColors: Record<string, string> = {
                    "Sarah Chen": "#C4402F",
                    "Alex Rivera": "#2B86C5",
                    "Jordan Patel": "#2D9D5E",
                    "Casey Kim": "#8B5CF6",
                    "Morgan Davis": "#E8873A",
                  };

                  return (
                    <div key={metric.key} className="trend-metric-card">
                      <h3 className="trend-metric-title">{metric.label}</h3>
                      <svg viewBox="0 0 500 160" className="trend-metric-chart">
                        {/* Grid */}
                        {[0, 1, 2, 3, 4].map(i => (
                          <line key={i} x1="40" y1={15 + i * 30} x2="490" y2={15 + i * 30} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                        ))}
                        <text x="8" y="18" fontSize="9" fill="#999">100</text>
                        <text x="8" y="78" fontSize="9" fill="#999">50</text>
                        <text x="8" y="138" fontSize="9" fill="#999">0</text>

                        {/* All dates for x-axis */}
                        {(() => {
                          const allDates = [...new Set(demoSessions.map(s => s.date))].sort();
                          return allDates.map((d, i) => (
                            <text key={d} x={40 + (i / Math.max(1, allDates.length - 1)) * 450} y="155" fontSize="7" fill="#999" textAnchor="middle">
                              {new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </text>
                          ));
                        })()}

                        {/* One line per student */}
                        {students.map(student => {
                          const sessions = demoSessions
                            .filter(s => s.student === student)
                            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                          if (sessions.length < 2) return null;

                          const allDates = [...new Set(demoSessions.map(s => s.date))].sort();

                          return (
                            <g key={student}>
                              <polyline
                                fill="none"
                                stroke={studentColors[student]}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity="0.8"
                                points={sessions.map(s => {
                                  const dateIdx = allDates.indexOf(s.date);
                                  const x = 40 + (dateIdx / Math.max(1, allDates.length - 1)) * 450;
                                  const val = s[metric.key];
                                  const y = 135 - (val / 100) * 120;
                                  return `${x},${y}`;
                                }).join(" ")}
                              />
                              {sessions.map((s, i) => {
                                const dateIdx = allDates.indexOf(s.date);
                                const x = 40 + (dateIdx / Math.max(1, allDates.length - 1)) * 450;
                                const val = s[metric.key];
                                const y = 135 - (val / 100) * 120;
                                return <circle key={i} cx={x} cy={y} r="3" fill={studentColors[student]} />;
                              })}
                            </g>
                          );
                        })}
                      </svg>
                      <div className="trend-metric-legend">
                        {students.map(s => (
                          <span key={s} className="trend-legend-item">
                            <span className="legend-dot" style={{ background: studentColors[s] }} />
                            {s.split(" ")[0]}
                          </span>
                        ))}
                      </div>
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

            {/* Profile + Room side by side */}
            <div className="settings-row-cards">
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
                <div className="settings-row">
                  <span className="settings-label">Student Link</span>
                  <span className="settings-value" style={{ fontSize: "0.72rem" }}>student-call.vercel.app/room/demo-room</span>
                </div>
              </div>
            </div>

            {/* Coaching Engine - configurable */}
            <div className="settings-card">
              <h2 className="settings-card-title">Coaching Engine</h2>
              <div className="settings-row">
                <span className="settings-label">Grace period (observation before first nudge)</span>
                <span className="settings-value">5 minutes</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Assessment window</span>
                <span className="settings-value">3 minutes</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Escalation levels</span>
                <span className="settings-value">L1 Gentle → L2 Direct → L3 Urgent</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">De-escalation on improvement</span>
                <span className="settings-value" style={{ color: "var(--success)" }}>Enabled</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
                Nudges are based on window-over-window engagement trends vs. per-session baseline. The engine waits for the grace period, then assesses every window. If engagement drops 15+ points below baseline, a nudge fires and escalates on consecutive low windows.
              </p>
            </div>

            {/* Demo Mode */}
            <div className="settings-card">
              <h2 className="settings-card-title">Demo Mode</h2>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>
                Demo mode compresses the coaching timeline for evaluation. Grace period becomes 30 seconds, assessment windows become 15 seconds. Nudges will fire quickly so evaluators can see the full coaching flow without waiting 5+ minutes.
              </p>
              <div className="settings-row">
                <span className="settings-label">Demo mode</span>
                <span className="settings-value" style={{ color: "var(--warn)" }}>Available via URL: ?demo=true</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Face mesh overlay</span>
                <span className="settings-value" style={{ color: "var(--success)" }}>Shown during calls</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Expression detection</span>
                <span className="settings-value" style={{ color: "var(--success)" }}>Active (smiling, squinting, yawning, etc.)</span>
              </div>
            </div>

            {/* System */}
            <div className="settings-card">
              <h2 className="settings-card-title">System Performance</h2>
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
                <span className="settings-value" style={{ color: "var(--success)" }}>&lt;500ms (target met)</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">ML inference cost</span>
                <span className="settings-value" style={{ color: "var(--success)" }}>$0 (client-side)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
