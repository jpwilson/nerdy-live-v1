"use client";

import Link from "next/link";

type Category = "FEATURE" | "FIX" | "IMPROVEMENT";

interface ChangelogEntry {
  category: Category;
  title: string;
}

interface ChangelogDay {
  date: string;
  label?: string;
  entries: ChangelogEntry[];
}

const COMMITS_URL = "https://github.com/jpwilson/nerdy-live-v1/commits/main";

const CHANGELOG: ChangelogDay[] = [
  {
    date: "2026-03-15",
    label: "Today",
    entries: [
      { category: "FEATURE", title: "MediaPipe Pose body tracking — shoulder tilt, slouch detection, body posture overlays" },
      { category: "FEATURE", title: "Coaching nudges overhaul — absolute thresholds, multi-metric nudges, demo mode timing" },
      { category: "FEATURE", title: "3D session graph with Three.js — rotate, zoom, electric pulse on click, drag physics" },
      { category: "FEATURE", title: "New metrics — Blink Rate, Head Stability, Facial Responsiveness, Responsiveness (renamed from Energy)" },
      { category: "FEATURE", title: "Session deletion with styled confirmation dialog" },
      { category: "FEATURE", title: "Branded waiting screen with pulsing Nerdy \u00d7 Live+AI logos" },
      { category: "FEATURE", title: "Recording toggle — metrics always collected, video recording optional" },
      { category: "FEATURE", title: "Clickable stat cards with per-student breakdowns" },
      { category: "FIX", title: "Coaching nudges actually fire in demo mode (30s/15s timing)" },
      { category: "FIX", title: "Overlay modes separated — each mode shows only its relevant content" },
      { category: "FIX", title: "Metrics pipeline — real data flows to session summary instead of zeros" },
      { category: "FIX", title: "iOS camera conflict resolved — no more rear camera swapping" },
      { category: "FIX", title: "Nav auth — demo logins properly recognized" },
      { category: "IMPROVEMENT", title: "AI model config wired to localStorage (Haiku/Sonnet/Opus selection functional)" },
      { category: "IMPROVEMENT", title: "Larger radar chart labels, always-show recommendations" },
    ],
  },
  {
    date: "2026-03-15",
    label: "Morning",
    entries: [
      { category: "FEATURE", title: "Real-time speech transcription and subject auto-detection" },
      { category: "FEATURE", title: "AI-powered post-session summaries via OpenRouter (Claude Sonnet)" },
      { category: "FEATURE", title: "Per-student engagement trends with line charts" },
      { category: "FEATURE", title: "Sortable session table with multi-metric radar charts" },
      { category: "IMPROVEMENT", title: "Rich demo data showing student improvement over time" },
    ],
  },
  {
    date: "2026-03-14",
    entries: [
      { category: "FEATURE", title: "LiveKit video transport replacing peer-to-peer WebRTC" },
      { category: "FEATURE", title: "Rich engagement analysis — expressions, attention drift, interruptions" },
      { category: "FEATURE", title: "Tabbed analysis panel with Live/Trends views" },
      { category: "FEATURE", title: "Evidence-based coaching nudge architecture" },
      { category: "FEATURE", title: "Tutor dashboard with session history, detail views, radar charts" },
      { category: "FEATURE", title: "Global navigation, sidebar layout, project documentation page" },
      { category: "FEATURE", title: "Warm light theme with terracotta accents (replacing dark theme)" },
      { category: "FIX", title: "Eye contact calibration, camera defaulting to front" },
      { category: "FIX", title: "iOS light theme compatibility" },
    ],
  },
  {
    date: "2026-03-13",
    entries: [
      { category: "FEATURE", title: "Student tracking with per-student analytics" },
      { category: "FEATURE", title: "Role-based auth — tutor and student experiences" },
      { category: "FEATURE", title: "Face mesh overlays with dynamic face centering" },
      { category: "FEATURE", title: "Web tutor can analyze remote student\u2019s video in real-time" },
      { category: "FIX", title: "Remote video gravity and analysis error states" },
    ],
  },
  {
    date: "2026-03-12",
    entries: [
      { category: "FEATURE", title: "Video call UX improvements — audio, student analysis, richer coaching" },
      { category: "IMPROVEMENT", title: "Better engagement formula and coaching nudge timing" },
    ],
  },
  {
    date: "2026-03-11",
    entries: [
      { category: "FEATURE", title: "Student call web app scaffold" },
      { category: "FEATURE", title: "WebRTC signaling between iOS and web" },
      { category: "FEATURE", title: "Supabase authentication with email OTP" },
      { category: "FEATURE", title: "Nerdy dark theme branding" },
      { category: "FEATURE", title: "GitHub Actions CI with Swift tests and web typecheck" },
      { category: "FIX", title: "Multiple iOS build and compatibility fixes" },
    ],
  },
  {
    date: "2026-03-08",
    entries: [
      { category: "FEATURE", title: "Live camera capture integration with Supabase" },
    ],
  },
  {
    date: "2026-03-06",
    entries: [
      { category: "FEATURE", title: "Initial project setup — architecture, data models, design system" },
      { category: "FEATURE", title: "Core processing pipeline — video, audio, metrics engine" },
      { category: "FEATURE", title: "Coaching engine and session UI" },
      { category: "FEATURE", title: "Comprehensive test suite (90+ unit tests)" },
      { category: "FEATURE", title: "Supabase schema and edge functions" },
      { category: "FEATURE", title: "iOS Simulator support with demo data provider" },
    ],
  },
];

const BADGE_STYLES: Record<Category, { bg: string; color: string; dot: string }> = {
  FEATURE:     { bg: "#E6F4EA", color: "#1B7A3D", dot: "#2D9D5E" },
  FIX:         { bg: "#E3EEFA", color: "#1D5EA8", dot: "#3B82F6" },
  IMPROVEMENT: { bg: "#FFF3E0", color: "#B45309", dot: "#E8873A" },
};

function formatDate(dateStr: string, label?: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return label ? `${formatted} (${label})` : formatted;
}

export default function ChangelogPage() {
  return (
    <main className="shell" style={{ maxWidth: 820, margin: "0 auto", padding: "40px 16px 80px" }}>
      <Link href="/dashboard" style={{
        display: "inline-block",
        marginBottom: 24,
        color: "var(--accent)",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: "0.9rem",
      }}>
        &larr; Back to Dashboard
      </Link>

      <h1 style={{
        fontSize: "2rem",
        fontWeight: 800,
        color: "var(--ink)",
        marginBottom: 4,
      }}>
        Changelog
      </h1>
      <p style={{
        color: "var(--muted)",
        fontSize: "1rem",
        marginBottom: 40,
        lineHeight: 1.6,
      }}>
        A record of everything shipped for LiveSesh AI — features, fixes, and improvements.
      </p>

      {/* Timeline */}
      <div style={{ position: "relative" }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute",
          left: 15,
          top: 0,
          bottom: 0,
          width: 2,
          background: "linear-gradient(180deg, var(--accent) 0%, var(--line) 100%)",
          borderRadius: 1,
        }} />

        {CHANGELOG.map((day, dayIdx) => (
          <div key={dayIdx} style={{ marginBottom: 40, position: "relative" }}>
            {/* Date header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 16,
              position: "relative",
            }}>
              {/* Large date dot */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--accent)",
                border: "3px solid var(--bg-dark)",
                flexShrink: 0,
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#fff",
                }} />
              </div>
              <h2 style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "var(--ink)",
                margin: 0,
              }}>
                {formatDate(day.date, day.label)}
              </h2>
            </div>

            {/* Entry cards */}
            <div style={{ paddingLeft: 48 }}>
              {day.entries.map((entry, entryIdx) => {
                const style = BADGE_STYLES[entry.category];
                return (
                  <div
                    key={entryIdx}
                    style={{
                      position: "relative",
                      background: "var(--bg-card)",
                      borderRadius: 10,
                      padding: "14px 18px",
                      marginBottom: 10,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                      border: "1px solid var(--line)",
                      transition: "box-shadow 0.15s ease, transform 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                    }}
                  >
                    {/* Small timeline dot */}
                    <div style={{
                      position: "absolute",
                      left: -40,
                      top: 18,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: style.dot,
                      border: "2px solid var(--bg-dark)",
                      zIndex: 1,
                    }} />

                    <div style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        {/* Category badge */}
                        <span style={{
                          display: "inline-block",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          padding: "3px 8px",
                          borderRadius: 5,
                          background: style.bg,
                          color: style.color,
                          flexShrink: 0,
                          textTransform: "uppercase",
                        }}>
                          {entry.category}
                        </span>
                        {/* Title */}
                        <span style={{
                          fontSize: "0.92rem",
                          color: "var(--ink)",
                          lineHeight: 1.45,
                          fontWeight: 500,
                        }}>
                          {entry.title}
                        </span>
                      </div>

                      {/* Code changes link */}
                      <a
                        href={COMMITS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--accent)",
                          textDecoration: "none",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          opacity: 0.7,
                          transition: "opacity 0.15s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.7"; }}
                      >
                        Code changes &rarr;
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Timeline end cap */}
        <div style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--bg-dark)",
            border: "2px solid var(--line)",
            flexShrink: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--muted)",
            }} />
          </div>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
            Project started
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        marginTop: 48,
        padding: "16px 20px",
        background: "var(--bg-card)",
        borderRadius: 10,
        border: "1px solid var(--line)",
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>Legend:</span>
        {(Object.entries(BADGE_STYLES) as [Category, typeof BADGE_STYLES[Category]][]).map(([cat, s]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.dot }} />
            <span style={{ fontSize: "0.78rem", color: s.color, fontWeight: 600 }}>{cat}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
