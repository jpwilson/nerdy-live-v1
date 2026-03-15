"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { TutorDashboard } from "@/components/tutor-dashboard";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sessions" | "analytics" | "settings">("sessions");

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

  return (
    <main className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-sidebar-profile">
          <div className="dash-avatar">{displayName.charAt(0).toUpperCase()}</div>
          <span className="dash-profile-name">{displayName}</span>
          <span className="dash-profile-email">{email}</span>
        </div>

        <nav className="dash-sidebar-nav">
          {(["sessions", "analytics", "settings"] as const).map((tab) => (
            <button
              key={tab}
              className={`dash-sidebar-link ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "sessions" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              )}
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

        <button className="dash-sidebar-join" onClick={() => router.push("/")}>
          Start Session →
        </button>
      </aside>

      <div className="dash-main">
        {activeTab === "sessions" && <TutorDashboard />}
        {activeTab === "analytics" && (
          <div className="dash-tab-panel">
            <h1 className="dash-title">Analytics</h1>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>Cross-session analysis and tutor performance insights.</p>
            <div className="detail-timeline-placeholder" style={{ marginTop: 20, minHeight: 200 }}>
              Interactive session graph visualization — coming soon
            </div>
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
          </div>
        )}
      </div>
    </main>
  );
}
