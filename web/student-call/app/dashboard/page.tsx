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

  if (loading) return <main className="shell"><p style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading...</p></main>;
  if (!email) return null;

  const displayName = localStorage.getItem("livesesh_displayName") || email.split("@")[0];

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    localStorage.removeItem("livesesh_displayName");
    localStorage.removeItem("livesesh_roomId");
    localStorage.removeItem("livesesh_role");
    window.location.href = "/";
  };

  return (
    <main className="shell">
      {/* Top bar */}
      <header className="dash-header">
        <div className="dash-header-left">
          <span className="dash-logo">LiveSesh AI</span>
        </div>
        <div className="dash-header-right">
          <span className="dash-user">{displayName}</span>
          <button className="dash-signout" onClick={() => void signOut()}>Sign out</button>
          <button className="primary-button" style={{ padding: "10px 18px", fontSize: "0.82rem" }} onClick={() => router.push("/")}>
            Join Room
          </button>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="dash-nav">
        {(["sessions", "analytics", "settings"] as const).map((tab) => (
          <button
            key={tab}
            className={`dash-nav-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "sessions" ? "Sessions" : tab === "analytics" ? "Analytics" : "Settings"}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="dash-content">
        {activeTab === "sessions" && <TutorDashboard />}
        {activeTab === "analytics" && (
          <div className="dash-tab-panel">
            <h1 className="dash-title">Analytics</h1>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>Cross-session analysis and tutor performance insights.</p>
            <div className="detail-timeline-placeholder" style={{ marginTop: 20, minHeight: 200 }}>
              Session graph visualization — see Settings tab for interactive graph
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
              <h2 className="settings-card-title">Coaching</h2>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                Coaching sensitivity is set per-session in the join form.
                Grace period: 5 minutes of observation before any nudges.
                Assessment windows: every 3 minutes. Escalating nudge levels.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
