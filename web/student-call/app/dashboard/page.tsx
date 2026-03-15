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
    { id: "s1", subject: "Algebra", date: "Mar 14", engagement: 82, eyeContact: 78, talkBalance: 45, interruptions: 2, duration: 28, student: "Sarah Chen" },
    { id: "s2", subject: "Calculus", date: "Mar 13", engagement: 65, eyeContact: 55, talkBalance: 35, interruptions: 4, duration: 22, student: "Sarah Chen" },
    { id: "s3", subject: "Geometry", date: "Mar 12", engagement: 91, eyeContact: 88, talkBalance: 50, interruptions: 1, duration: 35, student: "Alex Rivera" },
    { id: "s4", subject: "Physics", date: "Mar 11", engagement: 45, eyeContact: 32, talkBalance: 20, interruptions: 6, duration: 18, student: "Jordan Patel" },
    { id: "s5", subject: "Algebra", date: "Mar 10", engagement: 73, eyeContact: 70, talkBalance: 42, interruptions: 3, duration: 30, student: "Alex Rivera" },
    { id: "s6", subject: "Biology", date: "Mar 9", engagement: 58, eyeContact: 48, talkBalance: 30, interruptions: 5, duration: 25, student: "Casey Kim" },
    { id: "s7", subject: "Algebra", date: "Mar 8", engagement: 88, eyeContact: 85, talkBalance: 55, interruptions: 1, duration: 32, student: "Sarah Chen" },
    { id: "s8", subject: "History", date: "Mar 7", engagement: 42, eyeContact: 35, talkBalance: 15, interruptions: 7, duration: 15, student: "Morgan Davis" },
    { id: "s9", subject: "Chemistry", date: "Mar 6", engagement: 76, eyeContact: 72, talkBalance: 48, interruptions: 2, duration: 27, student: "Jordan Patel" },
    { id: "s10", subject: "Geometry", date: "Mar 5", engagement: 69, eyeContact: 60, talkBalance: 38, interruptions: 3, duration: 20, student: "Casey Kim" },
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
                <div className="trends-grid">
                  {[
                    { label: "Eye Contact", values: demoSessions.map(s => s.eyeContact), color: "#2B86C5" },
                    { label: "Engagement", values: demoSessions.map(s => s.engagement), color: "#2D9D5E" },
                    { label: "Talk Balance", values: demoSessions.map(s => s.talkBalance), color: "#8B5CF6" },
                  ].map(metric => {
                    const avg = Math.round(metric.values.reduce((a, b) => a + b, 0) / metric.values.length);
                    const recent = metric.values.slice(0, 3);
                    const older = metric.values.slice(3, 6);
                    const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
                    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;
                    const trend = older.length === 0 ? "—" : recentAvg > olderAvg + 3 ? "↑ Improving" : recentAvg < olderAvg - 3 ? "↓ Declining" : "→ Stable";
                    const trendColor = trend.includes("Improving") ? "#2D9D5E" : trend.includes("Declining") ? "#C4402F" : "var(--muted)";
                    return (
                      <div key={metric.label} className="trend-card">
                        <div className="trend-card-header">
                          <span className="trend-card-label">{metric.label}</span>
                          <span className="trend-card-avg" style={{ color: metric.color }}>{avg}%</span>
                        </div>
                        {/* Mini sparkline */}
                        <svg viewBox="0 0 200 60" className="trend-sparkline">
                          <polyline
                            fill="none"
                            stroke={metric.color}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={metric.values.map((v, i) =>
                              `${(i / (metric.values.length - 1)) * 190 + 5},${55 - (v / 100) * 50}`
                            ).join(" ")}
                          />
                          {metric.values.map((v, i) => (
                            <circle
                              key={i}
                              cx={(i / (metric.values.length - 1)) * 190 + 5}
                              cy={55 - (v / 100) * 50}
                              r="3"
                              fill={metric.color}
                            />
                          ))}
                        </svg>
                        <span className="trend-card-direction" style={{ color: trendColor }}>{trend}</span>
                      </div>
                    );
                  })}
                </div>
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
