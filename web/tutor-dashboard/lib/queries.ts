import { getSupabaseBrowserClient } from "./supabase";
import type {
  Session,
  SessionSummary,
  MetricsSnapshot,
  CoachingNudge,
  StudentAggregate,
} from "./types";

const sb = () => getSupabaseBrowserClient();

export async function fetchSessions(): Promise<Session[]> {
  const { data, error } = await sb()
    .from("sessions")
    .select("*")
    .order("started_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Session[];
}

export async function fetchSessionById(
  sessionId: string
): Promise<Session | null> {
  const { data, error } = await sb()
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return data as Session | null;
}

export async function fetchSessionSummary(
  sessionId: string
): Promise<SessionSummary | null> {
  const { data, error } = await sb()
    .from("session_summaries")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return data as SessionSummary | null;
}

export async function fetchSessionWithSummary(sessionId: string) {
  const [session, summary] = await Promise.all([
    fetchSessionById(sessionId),
    fetchSessionSummary(sessionId),
  ]);
  return { session, summary };
}

export async function fetchMetricsSnapshots(
  sessionId: string
): Promise<MetricsSnapshot[]> {
  const { data, error } = await sb()
    .from("metrics_snapshots")
    .select("*")
    .eq("session_id", sessionId)
    .order("timestamp", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MetricsSnapshot[];
}

export async function fetchNudges(sessionId: string): Promise<CoachingNudge[]> {
  const { data, error } = await sb()
    .from("coaching_nudges")
    .select("*")
    .eq("session_id", sessionId)
    .order("timestamp", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CoachingNudge[];
}

export async function fetchStudents(): Promise<StudentAggregate[]> {
  const sessions = await fetchSessions();
  const map = new Map<
    string,
    { count: number; totalEngagement: number; lastDate: string }
  >();

  for (const s of sessions) {
    const name = s.student_name || "Unknown";
    const existing = map.get(name);
    const engagement = s.engagement_score ?? 0;
    const date = s.started_at;

    if (existing) {
      existing.count += 1;
      existing.totalEngagement += engagement;
      if (date > existing.lastDate) existing.lastDate = date;
    } else {
      map.set(name, { count: 1, totalEngagement: engagement, lastDate: date });
    }
  }

  const result: StudentAggregate[] = [];
  map.forEach((val, name) => {
    result.push({
      student_name: name,
      session_count: val.count,
      avg_engagement: Math.round(val.totalEngagement / val.count),
      last_session_date: val.lastDate,
    });
  });

  result.sort((a, b) => b.last_session_date.localeCompare(a.last_session_date));
  return result;
}

export async function fetchSessionsForStudent(
  studentName: string
): Promise<Session[]> {
  const { data, error } = await sb()
    .from("sessions")
    .select("*")
    .eq("student_name", studentName)
    .order("started_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Session[];
}
