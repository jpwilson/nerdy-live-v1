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
      x: cx + Math.cos(angle) * 140,
      y: cy + Math.sin(angle) * 140,
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
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill={d.color || "#5A5A5A"} fontWeight="600">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

// Demo data: each student shows clear improvement over time (earlier = weaker, recent = stronger)
const RICH_DEMO_DATA = [
  // Sarah Chen: Algebra journey (Mar 5 -> Mar 15)
  {
    student: "Sarah Chen", subject: "Algebra", duration: 28, engagement: 52, eyeContact: 48,
    studentTalk: 22, tutorTalk: 78, energy: 35, attentionDrift: 35, interruptions: 5,
    summary: "First session. Introduced quadratic equations. Sarah was quiet and hesitant to participate. Eye contact was intermittent; looked away frequently when unsure. Mostly listened. Need to build confidence.",
    date: "2026-03-05T16:00:00Z"
  },
  {
    student: "Sarah Chen", subject: "Algebra", duration: 32, engagement: 64, eyeContact: 62,
    studentTalk: 30, tutorTalk: 70, energy: 48, attentionDrift: 24, interruptions: 3,
    summary: "Reviewed quadratics. Sarah spoke up more when prompted directly. Eye contact improved during worked examples. Starting to ask clarifying questions. Progress noted.",
    date: "2026-03-08T16:00:00Z"
  },
  {
    student: "Sarah Chen", subject: "Algebra", duration: 35, engagement: 75, eyeContact: 72,
    studentTalk: 38, tutorTalk: 62, energy: 58, attentionDrift: 18, interruptions: 2,
    summary: "Covered completing the square. Sarah attempted problems on her own before asking for help. Big improvement in confidence. Eye contact strong throughout. Energy dipped around 25 minutes.",
    date: "2026-03-11T16:00:00Z"
  },
  {
    student: "Sarah Chen", subject: "Algebra", duration: 35, engagement: 85, eyeContact: 82,
    studentTalk: 45, tutorTalk: 55, energy: 72, attentionDrift: 10, interruptions: 1,
    summary: "Excellent session on the quadratic formula. Sarah solved 4 problems independently, explained her reasoning aloud, and caught her own errors. Eye contact consistently strong. Engagement at its highest yet.",
    date: "2026-03-15T16:45:00Z"
  },

  // Alex Rivera: Physics journey (Mar 6 -> Mar 14)
  {
    student: "Alex Rivera", subject: "Physics", duration: 40, engagement: 58, eyeContact: 55,
    studentTalk: 28, tutorTalk: 72, energy: 42, attentionDrift: 30, interruptions: 4,
    summary: "Introduced Newton's first law. Alex has good intuition but struggled with formal definitions. Low verbal participation. Attention wandered during derivations. Try more real-world examples next time.",
    date: "2026-03-06T19:00:00Z"
  },
  {
    student: "Alex Rivera", subject: "Physics", duration: 45, engagement: 72, eyeContact: 70,
    studentTalk: 38, tutorTalk: 62, energy: 62, attentionDrift: 18, interruptions: 2,
    summary: "Newton's second law (F=ma). Used car/rocket examples which Alex responded to well. Started asking 'what if' questions. Eye contact much improved. Participation increasing. Good momentum.",
    date: "2026-03-09T19:00:00Z"
  },
  {
    student: "Alex Rivera", subject: "Physics", duration: 50, engagement: 84, eyeContact: 82,
    studentTalk: 44, tutorTalk: 56, energy: 75, attentionDrift: 12, interruptions: 1,
    summary: "Covered friction forces and free body diagrams. Alex drew diagrams independently and explained force components. Strong participation. Grasped inclined plane problems faster than expected.",
    date: "2026-03-11T19:00:00Z"
  },
  {
    student: "Alex Rivera", subject: "Physics", duration: 45, engagement: 92, eyeContact: 90,
    studentTalk: 50, tutorTalk: 50, energy: 85, attentionDrift: 6, interruptions: 0,
    summary: "Outstanding session on Newton's third law and momentum. Alex led the problem-solving, asked deep questions about real-world applications, and made connections across all three laws. Near-perfect engagement.",
    date: "2026-03-14T19:00:00Z"
  },

  // Jordan Patel: Chemistry journey (Mar 7 -> Mar 15) - slower improvement
  {
    student: "Jordan Patel", subject: "Chemistry", duration: 30, engagement: 32, eyeContact: 28,
    studentTalk: 12, tutorTalk: 88, energy: 20, attentionDrift: 52, interruptions: 8,
    summary: "Difficult session. Attempted atomic structure basics. Jordan was largely disengaged. Phone distraction, minimal eye contact, almost no verbal participation. Ended early. Need a completely different approach.",
    date: "2026-03-07T17:00:00Z"
  },
  {
    student: "Jordan Patel", subject: "Chemistry", duration: 35, engagement: 48, eyeContact: 42,
    studentTalk: 20, tutorTalk: 80, energy: 35, attentionDrift: 38, interruptions: 5,
    summary: "Tried visual/interactive approach with molecular model kit. Jordan engaged more with hands-on activity. Eye contact improved when manipulating models vs. lecture. Still low verbal participation. Build on what works.",
    date: "2026-03-10T17:00:00Z"
  },
  {
    student: "Jordan Patel", subject: "Chemistry", duration: 40, engagement: 58, eyeContact: 52,
    studentTalk: 28, tutorTalk: 72, energy: 45, attentionDrift: 28, interruptions: 3,
    summary: "Periodic table trends with color-coded visual charts. Jordan responded well to the competitive quiz format. Attention improved noticeably. Asked two questions voluntarily. Progress is slow but real.",
    date: "2026-03-12T17:00:00Z"
  },
  {
    student: "Jordan Patel", subject: "Chemistry", duration: 45, engagement: 66, eyeContact: 60,
    studentTalk: 32, tutorTalk: 68, energy: 52, attentionDrift: 22, interruptions: 2,
    summary: "Chemical bonding with 3D molecule visualizations. Best session yet. Jordan explained ionic vs. covalent bonding back in own words. Eye contact above 50% for the first time. The visual/interactive format is working.",
    date: "2026-03-15T17:00:00Z"
  },

  // Casey Kim: Biology (Mar 8 -> Mar 14)
  {
    student: "Casey Kim", subject: "Biology", duration: 40, engagement: 60, eyeContact: 58,
    studentTalk: 30, tutorTalk: 70, energy: 45, attentionDrift: 25, interruptions: 3,
    summary: "Introduction to cell biology. Casey listened attentively but rarely spoke up. Understood diagrams well. Eye contact moderate. Seemed interested but passive. Try more open-ended questions.",
    date: "2026-03-08T15:00:00Z"
  },
  {
    student: "Casey Kim", subject: "Biology", duration: 50, engagement: 74, eyeContact: 72,
    studentTalk: 40, tutorTalk: 60, energy: 62, attentionDrift: 18, interruptions: 2,
    summary: "Cell division and mitosis phases. Casey followed the visual walkthrough well. Asked good questions about cancer and uncontrolled division. Participation up from last session. Terminology still needs flashcard practice.",
    date: "2026-03-11T15:00:00Z"
  },
  {
    student: "Casey Kim", subject: "Biology", duration: 55, engagement: 88, eyeContact: 85,
    studentTalk: 52, tutorTalk: 48, energy: 78, attentionDrift: 8, interruptions: 1,
    summary: "Genetics and Punnett squares. Casey was highly engaged. Solved problems independently, explained heredity concepts clearly, and even taught back dominant/recessive traits. Student-led session. Remarkable improvement.",
    date: "2026-03-14T15:00:00Z"
  },

  // Morgan Davis: History (Mar 7 -> Mar 15) - hardest student, gradual gains
  {
    student: "Morgan Davis", subject: "History", duration: 25, engagement: 28, eyeContact: 22,
    studentTalk: 10, tutorTalk: 90, energy: 18, attentionDrift: 55, interruptions: 9,
    summary: "Very challenging session. American Revolution causes. Morgan showed no interest in lecture format. Constant fidgeting, looking away, one-word answers. Ended 5 minutes early. Must find Morgan's interest hook.",
    date: "2026-03-07T14:00:00Z"
  },
  {
    student: "Morgan Davis", subject: "History", duration: 30, engagement: 45, eyeContact: 40,
    studentTalk: 22, tutorTalk: 78, energy: 35, attentionDrift: 35, interruptions: 5,
    summary: "Tried debate format: 'Was the Boston Tea Party justified?' Morgan engaged when given an opinion to defend. Eye contact improved during the debate portion. Still disengaged during factual review. Lean into discussion-based format.",
    date: "2026-03-10T14:00:00Z"
  },
  {
    student: "Morgan Davis", subject: "History", duration: 35, engagement: 58, eyeContact: 55,
    studentTalk: 30, tutorTalk: 70, energy: 48, attentionDrift: 25, interruptions: 3,
    summary: "Constitutional Convention as a role-play exercise. Morgan chose to represent Virginia. Participated actively during the role-play, less so during debrief. Eye contact strong during interactive portions.",
    date: "2026-03-12T14:00:00Z"
  },
  {
    student: "Morgan Davis", subject: "History", duration: 40, engagement: 68, eyeContact: 64,
    studentTalk: 38, tutorTalk: 62, energy: 58, attentionDrift: 18, interruptions: 2,
    summary: "Civil War causes using primary source documents. Asked Morgan to 'be the detective.' Best session yet. Morgan voluntarily shared opinions and made connections to current events. Interactive/role-play format is key for this student.",
    date: "2026-03-15T14:00:00Z"
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
  const [totalSessionCount, setTotalSessionCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "student" | "score" | "duration" | "eyeContact">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedTile, setExpandedTile] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteSession = async (sessionId: string) => {
    setDeleting(sessionId);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
      if (error) {
        console.error("[dashboard] delete failed:", error);
        alert("Failed to delete session: " + error.message);
        return;
      }
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setEnrichedSessions(prev => prev.filter(s => s.id !== sessionId));
      setSummaries(prev => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (selectedId === sessionId) setSelectedId(null);
    } finally {
      setDeleting(null);
    }
  };

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
      // Get total session count (no limit)
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true });
      setTotalSessionCount(count ?? 0);

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id, subject, student_level, started_at, ended_at, engagement_score")
        .order("started_at", { ascending: false })
        .limit(50);

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
  const [expandedStat, setExpandedStat] = useState<string | null>(null);

  // Per-student trend breakdown
  const studentNames = [...new Set(enrichedSessions.map(s => s.studentName))];
  const studentTrends = studentNames.map(name => {
    const sSessions = enrichedSessions.filter(s => s.studentName === name);
    const scores = sSessions.map(s => s.engagement_score ?? s.demoMetrics.eyeContact);
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const first = scores[scores.length - 1] ?? 0;
    const last = scores[0] ?? 0;
    const delta = last - first;
    return { name, count: sSessions.length, avg, delta };
  });

  if (selectedId) {
    const enriched = enrichedSessions.find(s => s.id === selectedId);
    if (!enriched) { setSelectedId(null); return null; }

    const score = enriched.engagement_score ?? enriched.demoMetrics.eyeContact;
    const eyeContact = enriched.demoMetrics.eyeContact;
    const talkStudent = enriched.demoMetrics.studentTalk;
    const talkTutor = enriched.demoMetrics.tutorTalk;

    return (
      <div className="dashboard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="detail-back" onClick={() => setSelectedId(null)}>&#8592; Back to sessions</button>
          <button
            className="ghost-button"
            style={{ color: "var(--danger)", fontSize: "0.82rem", padding: "6px 14px" }}
            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(enriched.id); }}
            disabled={deleting === enriched.id}
          >
            {deleting === enriched.id ? "Deleting..." : "Delete Session"}
          </button>
        </div>
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
              { label: "Responsiveness", value: enriched.demoMetrics.energy, max: 100, color: "#2D9D5E" },
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
            {(() => {
              const studentSessions = enrichedSessions
                .filter(s => s.studentName === enriched.studentName && s.id !== enriched.id)
                .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
              const prevSession = studentSessions.find(s => new Date(s.started_at).getTime() < new Date(enriched.started_at).getTime());
              if (!prevSession) return (
                <div className="detail-comparison">
                  <span className="detail-comp-label">vs. last session with {enriched.studentName}</span>
                  <span className="detail-comp-value" style={{ color: "var(--muted)" }}>No previous session</span>
                </div>
              );
              const currentScore = score;
              const prevScore = prevSession.engagement_score ?? prevSession.demoMetrics.eyeContact;
              const diff = Math.round(currentScore - prevScore);
              const isUp = diff >= 0;
              return (
                <div className="detail-comparison">
                  <span className="detail-comp-label">vs. last session with {enriched.studentName}</span>
                  <span className="detail-comp-value" style={{ color: isUp ? "#2D9D5E" : "#C4402F" }}>
                    {isUp ? "\u2191" : "\u2193"} {Math.abs(diff)}% engagement
                  </span>
                </div>
              );
            })()}
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
                  <li>Responsiveness was low ({enriched.demoMetrics.energy}%). Consider adding interactive exercises, whiteboard activities, or short breaks to boost engagement.</li>
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
                {eyeContact >= 50 && (
                  <li>Eye contact was solid at {eyeContact}%. Continue encouraging screen presence.</li>
                )}
                {talkStudent >= 30 && talkStudent < 50 && (
                  <li>Student talk at {talkStudent}% is reasonable. Push toward 50%+ by using the Socratic method.</li>
                )}
                {talkStudent >= 50 && (
                  <li>Excellent student talk at {talkStudent}%. This student-led approach is working well.</li>
                )}
                {enriched.demoMetrics.duration >= 30 && (
                  <li>Session length of {enriched.demoMetrics.duration}m is appropriate for sustained focus. Consider a brief mid-session break for sessions over 40m.</li>
                )}
                {enriched.demoMetrics.duration < 30 && (
                  <li>At {enriched.demoMetrics.duration}m, this was a shorter session. For complex topics, aim for 35-45 minutes.</li>
                )}
                <li>Next session: build on {enriched.subject} with progressive difficulty. Review any areas where {enriched.studentName} hesitated.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Delete confirmation dialog */}
      {confirmDeleteId && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.4)", display: "flex",
          alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }} onClick={() => setConfirmDeleteId(null)}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: "28px 32px",
            maxWidth: 400, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            textAlign: "center",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>Delete this session?</h3>
            <p style={{ margin: "0 0 20px", fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
              This will permanently remove the session and all associated metrics, coaching nudges, and summaries.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                style={{
                  padding: "10px 24px", borderRadius: 10, border: "1px solid #ddd",
                  background: "#fff", fontSize: "0.85rem", fontWeight: 600,
                  cursor: "pointer", color: "var(--ink)",
                }}
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: "10px 24px", borderRadius: 10, border: "none",
                  background: "var(--danger)", color: "#fff", fontSize: "0.85rem",
                  fontWeight: 600, cursor: "pointer",
                }}
                onClick={() => {
                  void deleteSession(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stat row */}
      <div className="dash-grid">
        <div className="dash-card" onClick={() => setExpandedStat(expandedStat === "sessions" ? null : "sessions")} style={{ cursor: "pointer" }}>
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
          <span className="dash-card-value">{totalSessionCount ?? enrichedSessions.length}</span>
          <span className="dash-card-label">Sessions</span>
        </div>
        <div className="dash-card" onClick={() => setExpandedStat(expandedStat === "score" ? null : "score")} style={{ cursor: "pointer" }}>
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span className="dash-card-value" style={{ color: engColor(avgEng) }}>
            {avgEng != null ? `${avgEng}%` : "\u2014"}
          </span>
          <span className="dash-card-label">Avg. Score</span>
        </div>
        <div className="dash-card" onClick={() => setExpandedStat(expandedStat === "time" ? null : "time")} style={{ cursor: "pointer" }}>
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span className="dash-card-value">{totalMin > 0 ? `${totalMin}m` : "\u2014"}</span>
          <span className="dash-card-label">Total Time</span>
        </div>
        <div className="dash-card" onClick={() => setExpandedStat(expandedStat === "trend" ? null : "trend")} style={{ cursor: "pointer" }}>
          <svg className="dash-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={trendColor} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span className="dash-card-value" style={{ color: trendColor }}>{trend}</span>
          <span className="dash-card-label">Trend</span>
        </div>
      </div>

      {/* Expanded stat description */}
      {expandedStat && (
        <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: "0.82rem", lineHeight: 1.6 }}>
          {expandedStat === "sessions" && (
            <div>
              <strong>Total sessions</strong> across all students.
              {studentTrends.map(st => (
                <div key={st.name} style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>{st.name}:</span> {st.count} session{st.count !== 1 ? "s" : ""}
                </div>
              ))}
            </div>
          )}
          {expandedStat === "score" && (
            <div>
              <strong>Average engagement score</strong> across all sessions (eye contact, participation, responsiveness).
              {studentTrends.map(st => (
                <div key={st.name} style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>{st.name}:</span>{" "}
                  <span style={{ color: engColor(st.avg) }}>{st.avg}% avg</span>
                </div>
              ))}
            </div>
          )}
          {expandedStat === "time" && (
            <div>
              <strong>Total tutoring time</strong> across all sessions ({Math.round(totalMin / 60 * 10) / 10} hours).
              {studentTrends.map(st => {
                const mins = enrichedSessions.filter(s => s.studentName === st.name).reduce((sum, s) => sum + s.demoMetrics.duration, 0);
                return (
                  <div key={st.name} style={{ marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>{st.name}:</span> {mins}m ({st.count} sessions)
                  </div>
                );
              })}
            </div>
          )}
          {expandedStat === "trend" && (
            <div>
              <strong>Overall trend</strong> — compares recent sessions vs. earlier sessions across all students.
              {studentTrends.map(st => (
                <div key={st.name} style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>{st.name}:</span>{" "}
                  <span style={{ color: st.delta > 3 ? "var(--success)" : st.delta < -3 ? "var(--danger)" : "var(--muted)" }}>
                    {st.delta > 0 ? "+" : ""}{st.delta}%
                    {st.delta > 3 ? " improving" : st.delta < -3 ? " declining" : " stable"}
                  </span>
                  {" "}(first: {enrichedSessions.filter(s => s.studentName === st.name).at(-1)?.engagement_score ?? "—"}% → latest: {enrichedSessions.filter(s => s.studentName === st.name).at(0)?.engagement_score ?? "—"}%)
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                <th style={{ width: 50 }}></th>
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
                    <td>
                      <button
                        className="ghost-button"
                        style={{ color: "var(--danger)", fontSize: "0.75rem", padding: "4px 8px", minWidth: "auto" }}
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                        disabled={deleting === s.id}
                        title="Delete session"
                      >
                        {deleting === s.id ? "..." : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        )}
                      </button>
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
