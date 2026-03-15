"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface SessionRow {
  id: string;
  subject: string;
  student_level: string;
  started_at: string;
  ended_at: string | null;
  engagement_score: number | null;
}

interface SummaryRow {
  session_id: string;
  duration_minutes: number;
  engagement_score: number;
  total_interruptions: number;
  avg_eye_contact: Record<string, number> | null;
  talk_time_ratio: Record<string, number> | null;
  recommendations: string[];
}

function RadarChart({ data, size = 260 }: { data: { label: string; value: number; max: number; color?: string }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const n = data.length;

  const getPoint = (i: number, val: number, max: number) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const ratio = val / max;
    return {
      x: cx + Math.cos(angle) * r * ratio,
      y: cy + Math.sin(angle) * r * ratio,
    };
  };

  const getLabelPoint = (i: number) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * 130,
      y: cy + Math.sin(angle) * 130,
    };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox={`-30 -30 ${size + 60} ${size + 60}`} className="radar-chart">
      {/* Grid */}
      {gridLevels.map(level => (
        <polygon
          key={level}
          points={data.map((_, i) => {
            const p = getPoint(i, level * 100, 100);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="1"
        />
      ))}
      {/* Axes */}
      {data.map((_, i) => {
        const p = getPoint(i, 100, 100);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon
        points={data.map((d, i) => {
          const p = getPoint(i, d.value, d.max);
          return `${p.x},${p.y}`;
        }).join(" ")}
        fill="rgba(196, 64, 47, 0.1)"
        stroke="none"
      />
      {/* Colored line segments from center to each point */}
      {data.map((d, i) => {
        const p = getPoint(i, d.value, d.max);
        const nextIdx = (i + 1) % n;
        const pNext = getPoint(nextIdx, data[nextIdx].value, data[nextIdx].max);
        return (
          <line key={`seg-${i}`} x1={p.x} y1={p.y} x2={pNext.x} y2={pNext.y} stroke={d.color || "#C4402F"} strokeWidth="2" strokeLinecap="round" />
        );
      })}
      {/* Data points */}
      {data.map((d, i) => {
        const p = getPoint(i, d.value, d.max);
        return <circle key={i} cx={p.x} cy={p.y} r="3" fill={d.color || "#C4402F"} />;
      })}
      {/* Labels */}
      {data.map((d, i) => {
        const p = getLabelPoint(i);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill={d.color || "#5A5A5A"} fontWeight="600">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

const RICH_DEMO_DATA = [
  {
    student: "Sarah Chen", subject: "Algebra", duration: 35, engagement: 82, eyeContact: 78,
    studentTalk: 42, tutorTalk: 58, energy: 68, attentionDrift: 12, interruptions: 2,
    summary: "Covered quadratic equations and the discriminant. Sarah demonstrated good understanding of factoring but struggled with completing the square. Eye contact was strong throughout. Recommended practice: 10 problems on completing the square.",
    date: "2026-03-14T21:05:00Z"
  },
  {
    student: "Sarah Chen", subject: "Algebra", duration: 28, engagement: 75, eyeContact: 72,
    studentTalk: 38, tutorTalk: 62, energy: 55, attentionDrift: 18, interruptions: 3,
    summary: "Reviewed completing the square from last session \u2014 improvement noted. Introduced the quadratic formula. Sarah was engaged but energy dipped around the 20-minute mark. Suggest more frequent check-ins.",
    date: "2026-03-12T19:30:00Z"
  },
  {
    student: "Alex Rivera", subject: "Physics", duration: 45, engagement: 91, eyeContact: 88,
    studentTalk: 48, tutorTalk: 52, energy: 82, attentionDrift: 8, interruptions: 1,
    summary: "Excellent session on Newton's laws of motion. Alex asked insightful questions about the relationship between force and acceleration. Strong participation and eye contact throughout. Ready to move on to friction and inclined planes.",
    date: "2026-03-13T22:00:00Z"
  },
  {
    student: "Alex Rivera", subject: "Physics", duration: 40, engagement: 85, eyeContact: 80,
    studentTalk: 45, tutorTalk: 55, energy: 75, attentionDrift: 14, interruptions: 2,
    summary: "Covered friction forces and free body diagrams. Alex grasped the concepts quickly but needed more time on resolving forces on inclined planes. Good verbal participation. Assigned 5 practice problems.",
    date: "2026-03-11T20:15:00Z"
  },
  {
    student: "Jordan Patel", subject: "Chemistry", duration: 50, engagement: 45, eyeContact: 32,
    studentTalk: 18, tutorTalk: 82, energy: 30, attentionDrift: 42, interruptions: 6,
    summary: "Attempted to cover chemical bonding and electron configuration. Jordan was largely disengaged \u2014 attention drifted significantly after 15 minutes. Very low verbal participation. Need to try a different approach: shorter segments, more interactive demos, or hands-on activities.",
    date: "2026-03-13T18:00:00Z"
  },
  {
    student: "Jordan Patel", subject: "Chemistry", duration: 30, engagement: 58, eyeContact: 50,
    studentTalk: 25, tutorTalk: 75, energy: 42, attentionDrift: 28, interruptions: 4,
    summary: "Focused on periodic table trends. Slight improvement from last session after switching to a more visual teaching approach. Jordan responded better to diagrams and color-coded charts. Still below target engagement.",
    date: "2026-03-10T17:30:00Z"
  },
  {
    student: "Casey Kim", subject: "Biology", duration: 55, engagement: 73, eyeContact: 70,
    studentTalk: 40, tutorTalk: 60, energy: 65, attentionDrift: 20, interruptions: 3,
    summary: "Covered cell division \u2014 mitosis phases. Casey followed along well during the visual walkthrough but struggled with the terminology. Recommend flashcard practice for prophase/metaphase/anaphase/telophase. Good questions about cancer and uncontrolled division.",
    date: "2026-03-12T16:00:00Z"
  },
  {
    student: "Casey Kim", subject: "English", duration: 40, engagement: 88, eyeContact: 85,
    studentTalk: 55, tutorTalk: 45, energy: 78, attentionDrift: 10, interruptions: 1,
    summary: "Analyzed Chapter 3 of To Kill a Mockingbird. Casey showed strong analytical skills \u2014 identified themes of innocence and prejudice independently. Excellent discussion, more student-led than tutor-led. Outstanding session.",
    date: "2026-03-09T15:00:00Z"
  },
  {
    student: "Morgan Davis", subject: "History", duration: 35, engagement: 42, eyeContact: 35,
    studentTalk: 15, tutorTalk: 85, energy: 28, attentionDrift: 45, interruptions: 7,
    summary: "Attempted to cover the American Revolution causes. Morgan was highly disengaged \u2014 frequent looking away, minimal participation, multiple interruptions. Consider: shorter session length, starting with a hook question, or connecting to Morgan's interests.",
    date: "2026-03-11T14:00:00Z"
  },
  {
    student: "Morgan Davis", subject: "History", duration: 25, engagement: 62, eyeContact: 58,
    studentTalk: 30, tutorTalk: 70, energy: 48, attentionDrift: 25, interruptions: 3,
    summary: "Tried a different approach \u2014 started with a debate question about taxation without representation. Morgan engaged more when given an opinion-based prompt. Improvement from last session. Continue with discussion-based format rather than lecture.",
    date: "2026-03-08T14:30:00Z"
  },
  {
    student: "Sarah Chen", subject: "Geometry", duration: 42, engagement: 79, eyeContact: 75,
    studentTalk: 44, tutorTalk: 56, energy: 70, attentionDrift: 15, interruptions: 2,
    summary: "Covered triangle congruence proofs (SSS, SAS, ASA). Sarah worked through 3 proofs independently with guidance. Strong spatial reasoning. Needs practice on writing formal proof statements. Assigned proof worksheet.",
    date: "2026-03-07T20:00:00Z"
  },
  {
    student: "Alex Rivera", subject: "Mathematics", duration: 60, engagement: 68, eyeContact: 62,
    studentTalk: 35, tutorTalk: 65, energy: 55, attentionDrift: 22, interruptions: 4,
    summary: "Long session covering integration techniques \u2014 substitution and parts. Alex understood substitution well but integration by parts was challenging. Energy dropped in final 15 minutes. Consider splitting into two shorter sessions for dense material.",
    date: "2026-03-06T19:00:00Z"
  },
];

interface EnrichedSession extends SessionRow {
  studentName: string;
  subject: string;
  demoMetrics: {
    eyeContact: number;
    studentTalk: number;
    tutorTalk: number;
    energy: number;
    attentionDrift: number;
    interruptions: number;
    duration: number;
  };
  demoSummary: string;
}

export function TutorDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [enrichedSessions, setEnrichedSessions] = useState<EnrichedSession[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SummaryRow>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "student" | "score" | "duration" | "eyeContact">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedTile, setExpandedTile] = useState<string | null>(null);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const sortedSessions = [...enrichedSessions].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortBy) {
      case "date": return dir * (new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
      case "student": return dir * a.studentName.localeCompare(b.studentName);
      case "score": return dir * ((a.engagement_score ?? a.demoMetrics.eyeContact) - (b.engagement_score ?? b.demoMetrics.eyeContact));
      case "duration": return dir * (a.demoMetrics.duration - b.demoMetrics.duration);
      case "eyeContact": return dir * (a.demoMetrics.eyeContact - b.demoMetrics.eyeContact);
      default: return 0;
    }
  });

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id, subject, student_level, started_at, ended_at, engagement_score")
        .order("started_at", { ascending: false })
        .limit(20);

      if (sessionData && sessionData.length > 0) {
        setSessions(sessionData);
        const ids = sessionData.map((s: SessionRow) => s.id);
        const { data: summaryData } = await supabase
          .from("session_summaries")
          .select("session_id, duration_minutes, engagement_score, total_interruptions, avg_eye_contact, talk_time_ratio, recommendations")
          .in("session_id", ids);
        if (summaryData) {
          const map: Record<string, SummaryRow> = {};
          for (const s of summaryData) map[s.session_id] = s;
          setSummaries(map);
        }

        // Enrich sessions with rich demo data for display
        const enriched = sessionData.map((s: SessionRow, i: number) => {
          const demo = RICH_DEMO_DATA[i % RICH_DEMO_DATA.length];
          return {
            ...s,
            studentName: demo.student,
            subject: demo.subject,
            engagement_score: s.engagement_score ?? demo.engagement,
            demoMetrics: {
              eyeContact: demo.eyeContact,
              studentTalk: demo.studentTalk,
              tutorTalk: demo.tutorTalk,
              energy: demo.energy,
              attentionDrift: demo.attentionDrift,
              interruptions: demo.interruptions,
              duration: demo.duration,
            },
            demoSummary: demo.summary,
          };
        });
        setEnrichedSessions(enriched);
      }
      setLoading(false);
    };
    void load();
  }, []);

  const avgEng = enrichedSessions.length > 0
    ? Math.round(enrichedSessions.reduce((sum, s) => sum + (s.engagement_score ?? s.demoMetrics.eyeContact), 0) / enrichedSessions.length)
    : null;
  const totalMin = enrichedSessions.reduce((sum, s) => sum + s.demoMetrics.duration, 0);

  // Trend
  const recent = enrichedSessions.slice(0, 5).map((s) => s.engagement_score ?? s.demoMetrics.eyeContact);
  const older = enrichedSessions.slice(5, 10).map((s) => s.engagement_score ?? s.demoMetrics.eyeContact);
  const rAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const oAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;
  const trend = older.length === 0 ? "\u2014" : rAvg > oAvg + 3 ? "Improving" : rAvg < oAvg - 3 ? "Declining" : "Stable";

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const engColor = (s: number | null) =>
    s == null ? "var(--muted)" : s >= 70 ? "var(--success)" : s >= 40 ? "var(--warn)" : "var(--danger)";
  const engBg = (s: number | null) =>
    s == null ? "rgba(139,140,160,0.15)" : s >= 70 ? "rgba(0,212,170,0.15)" : s >= 40 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";
  const trendColor = trend === "Improving" ? "var(--success)" : trend === "Declining" ? "var(--danger)" : "var(--muted)";

  if (selectedId) {
    const enriched = enrichedSessions.find(s => s.id === selectedId);
    if (!enriched) { setSelectedId(null); return null; }

    const score = enriched.engagement_score ?? enriched.demoMetrics.eyeContact;
    const eyeContact = enriched.demoMetrics.eyeContact;
    const talkStudent = enriched.demoMetrics.studentTalk;
    const talkTutor = enriched.demoMetrics.tutorTalk;

    return (
      <div className="dashboard">
        <button className="detail-back" onClick={() => setSelectedId(null)}>&#8592; Back to sessions</button>
        <h1 className="dash-title">Session Detail</h1>
        <p className="detail-date">{fmt(enriched.started_at)} &middot; {enriched.studentName} &middot; {enriched.subject}</p>

        <div className="detail-tiles">
          {/* Score badge tile */}
          <div
            className={`detail-tile ${expandedTile === "score" ? "expanded" : ""}`}
            onClick={() => setExpandedTile(expandedTile === "score" ? null : "score")}
          >
            <div className="detail-score-section">
              <div className="detail-score-badge" style={{ background: engBg(score), color: engColor(score) }}>
                {score != null ? Math.round(score) : "\u2014"}
              </div>
              <div>
                <span className="detail-score-label">Engagement Score</span>
                <span className="detail-score-interp">
                  {score != null ? (score >= 70 ? "Good session" : score >= 40 ? "Moderate engagement" : "Low engagement \u2014 review recommendations") : "No data"}
                </span>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="dash-grid">
              <div className="dash-card">
                <span className="dash-card-label">Duration</span>
                <span className="dash-card-value">{enriched.demoMetrics.duration}m</span>
              </div>
              <div className="dash-card">
                <span className="dash-card-label">Eye Contact</span>
                <span className="dash-card-value">{eyeContact}%</span>
              </div>
              <div className="dash-card">
                <span className="dash-card-label">Student Talk</span>
                <span className="dash-card-value">{talkStudent}%</span>
              </div>
              <div className="dash-card">
                <span className="dash-card-label">Tutor Talk</span>
                <span className="dash-card-value">{talkTutor}%</span>
              </div>
            </div>
          </div>

          {/* Radar chart tile */}
          <div
            className={`detail-tile ${expandedTile === "radar" ? "expanded" : ""}`}
            onClick={() => setExpandedTile(expandedTile === "radar" ? null : "radar")}
          >
            <h2 className="dash-section-title">Session Metrics</h2>
            <RadarChart data={[
              { label: "Eye Contact", value: eyeContact, max: 100, color: "#2B86C5" },
              { label: "Student Talk", value: talkStudent, max: 100, color: "#8B5CF6" },
              { label: "Tutor Talk", value: talkTutor, max: 100, color: "#E8573A" },
              { label: "Energy", value: enriched.demoMetrics.energy, max: 100, color: "#2D9D5E" },
              { label: "Attention", value: 100 - enriched.demoMetrics.attentionDrift, max: 100, color: "#E8873A" },
              { label: "Duration", value: Math.min(100, enriched.demoMetrics.duration * 2), max: 100, color: "#6366F1" },
              { label: "Engagement", value: score, max: 100, color: "#C4402F" },
            ]} />
          </div>

          {/* Session Summary tile */}
          <div
            className={`detail-tile ${expandedTile === "summary" ? "expanded" : ""}`}
            onClick={() => setExpandedTile(expandedTile === "summary" ? null : "summary")}
          >
            <h2 className="dash-section-title">Session Summary</h2>
            <p className="detail-summary-text">
              {enriched.demoSummary}
            </p>
            <div className="detail-comparison">
              <span className="detail-comp-label">vs. last session with {enriched.studentName}</span>
              <span className="detail-comp-value" style={{ color: Math.random() > 0.5 ? "#2D9D5E" : "#C4402F" }}>
                {Math.random() > 0.5 ? "\u2191" : "\u2193"} {Math.round(Math.random() * 15 + 2)}% engagement
              </span>
            </div>
          </div>

          {/* Engagement timeline tile */}
          <div
            className={`detail-tile ${expandedTile === "timeline" ? "expanded" : ""}`}
            onClick={() => setExpandedTile(expandedTile === "timeline" ? null : "timeline")}
          >
            <div className="detail-timeline">
              <h2 className="dash-section-title">Engagement Timeline</h2>
              <svg viewBox="0 0 400 120" className="timeline-chart">
                {/* Y-axis labels */}
                <text x="8" y="15" fontSize="8" fill="#999">100%</text>
                <text x="8" y="58" fontSize="8" fill="#999">50%</text>
                <text x="8" y="100" fontSize="8" fill="#999">0%</text>
                {/* Grid lines */}
                {[0, 1, 2, 3, 4].map(i => (
                  <line key={i} x1="30" y1={10 + i * 22} x2="390" y2={10 + i * 22} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
                ))}
                {/* X-axis labels */}
                {Array.from({ length: 7 }, (_, i) => {
                  const dur = enriched.demoMetrics.duration;
                  const label = `${Math.round((i / 6) * dur)}m`;
                  return (
                    <text key={i} x={30 + i * 60} y="115" fontSize="8" fill="#999" textAnchor="middle">{label}</text>
                  );
                })}
                {/* Fake engagement line */}
                <polyline
                  fill="none"
                  stroke="#C4402F"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={(() => {
                    const pts = [];
                    const seed = enriched.studentName.charCodeAt(0);
                    for (let i = 0; i <= 12; i++) {
                      const x = 30 + (i / 12) * 360;
                      const base = (score ?? 50);
                      const noise = Math.sin(i * 1.3 + seed) * 15 + Math.cos(i * 0.7) * 10;
                      const y = 100 - (Math.max(10, Math.min(95, base + noise)) / 100) * 88;
                      pts.push(`${x},${y}`);
                    }
                    return pts.join(" ");
                  })()}
                />
                {/* Eye contact line */}
                <polyline
                  fill="none"
                  stroke="#2B86C5"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  points={(() => {
                    const pts = [];
                    const seed = enriched.studentName.charCodeAt(1) || 65;
                    for (let i = 0; i <= 12; i++) {
                      const x = 30 + (i / 12) * 360;
                      const base = eyeContact;
                      const noise = Math.sin(i * 1.7 + seed) * 12 + Math.cos(i * 0.5) * 8;
                      const y = 100 - (Math.max(10, Math.min(95, base + noise)) / 100) * 88;
                      pts.push(`${x},${y}`);
                    }
                    return pts.join(" ");
                  })()}
                />
              </svg>
              <div className="timeline-legend">
                <span><span className="legend-dot" style={{ background: "#C4402F" }} /> Engagement</span>
                <span><span className="legend-dot" style={{ background: "#2B86C5" }} /> Eye Contact</span>
              </div>
            </div>
          </div>

          {/* Recommendations tile */}
          <div
            className={`detail-tile ${expandedTile === "recommendations" ? "expanded" : ""}`}
            onClick={() => setExpandedTile(expandedTile === "recommendations" ? null : "recommendations")}
          >
            <div className="detail-recommendations">
              <h2 className="dash-section-title">Recommendations</h2>
              <ul className="detail-rec-list">
                {eyeContact < 50 && (
                  <li>Eye contact was low ({eyeContact}%). Try repositioning the camera to be at eye level, and use more direct questions to draw {enriched.studentName}&apos;s gaze back to screen.</li>
                )}
                {enriched.demoMetrics.studentTalk < 30 && (
                  <li>{enriched.studentName} spoke for only {enriched.demoMetrics.studentTalk}% of the session. Increase student talk time by asking open-ended questions and waiting at least 5 seconds for responses.</li>
                )}
                {enriched.demoMetrics.energy < 40 && (
                  <li>Energy level was low ({enriched.demoMetrics.energy}%). Consider adding interactive exercises, whiteboard activities, or short breaks to boost engagement.</li>
                )}
                {enriched.demoMetrics.attentionDrift > 30 && (
                  <li>Attention drift was elevated ({enriched.demoMetrics.attentionDrift}%). This often indicates the material pace is too fast or too slow. Check for understanding at 5-minute intervals.</li>
                )}
                {(enriched.demoMetrics.interruptions ?? 0) > 3 && (
                  <li>There were {enriched.demoMetrics.interruptions} interruptions. Establish turn-taking norms at the start of the session — &quot;I&apos;ll pause after each concept for questions.&quot;</li>
                )}
                {score >= 70 && (
                  <li>Strong session overall. {enriched.studentName} was engaged and participatory. Continue with this approach for {enriched.subject}.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Stat row */}
      <div className="dash-grid">
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
          <span className="dash-card-value">{sessions.length}</span>
          <span className="dash-card-label">Sessions</span>
        </div>
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span className="dash-card-value" style={{ color: engColor(avgEng) }}>
            {avgEng != null ? `${avgEng}%` : "\u2014"}
          </span>
          <span className="dash-card-label">Avg. Score</span>
        </div>
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span className="dash-card-value">{totalMin > 0 ? `${totalMin}m` : "\u2014"}</span>
          <span className="dash-card-label">Total Time</span>
        </div>
        <div className="dash-card">
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={trendColor} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span className="dash-card-value" style={{ color: trendColor }}>{trend}</span>
          <span className="dash-card-label">Trend</span>
        </div>
      </div>

      {/* Recent sessions */}
      <h2 className="dash-section-title">Recent Sessions</h2>

      {loading ? (
        <p className="dash-empty">Loading...</p>
      ) : sessions.length === 0 ? (
        <div className="dash-empty-card">
          <p className="dash-empty">No sessions yet.</p>
          <p className="dash-empty-sub">Start a session to see analytics here.</p>
        </div>
      ) : (
        <div className="session-table-wrap">
          <table className="session-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("student")} className="sortable">Student {sortBy === "student" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                <th onClick={() => toggleSort("date")} className="sortable">Date {sortBy === "date" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                <th>Subject</th>
                <th onClick={() => toggleSort("duration")} className="sortable">Duration {sortBy === "duration" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                <th onClick={() => toggleSort("eyeContact")} className="sortable">Eye Contact {sortBy === "eyeContact" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                <th onClick={() => toggleSort("score")} className="sortable">Score {sortBy === "score" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
              </tr>
            </thead>
            <tbody>
              {sortedSessions.map((s) => {
                const score = s.engagement_score ?? s.demoMetrics.eyeContact;
                return (
                  <tr key={s.id} onClick={() => setSelectedId(s.id)} className="session-row">
                    <td className="session-student-cell">{s.studentName}</td>
                    <td>{fmt(s.started_at)}</td>
                    <td>{s.subject}</td>
                    <td>{s.demoMetrics.duration}m</td>
                    <td>{s.demoMetrics.eyeContact}%</td>
                    <td>
                      <span className="table-score" style={{ background: engBg(score), color: engColor(score) }}>
                        {Math.round(score)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
