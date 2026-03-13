export interface Session {
  id: string;
  tutor_id: string;
  student_id: string | null;
  student_name: string;
  subject: string | null;
  student_level: string | null;
  started_at: string;
  ended_at: string | null;
  engagement_score: number | null;
}

export interface TalkTimeRatio {
  tutor: number;
  student: number;
}

export interface EyeContactScore {
  tutor: number;
  student: number;
}

export interface KeyMoment {
  timestamp: string;
  type: string;
  description: string;
}

export interface SessionSummary {
  id: string;
  session_id: string;
  duration_minutes: number;
  talk_time_ratio: TalkTimeRatio;
  avg_eye_contact: EyeContactScore;
  total_interruptions: number;
  engagement_score: number;
  key_moments: KeyMoment[];
  recommendations: string[];
  created_at: string;
}

export interface MetricsSnapshot {
  id: string;
  session_id: string;
  timestamp: string;
  tutor_eye_contact: number;
  student_eye_contact: number;
  tutor_talk_pct: number;
  student_talk_pct: number;
  tutor_energy: number;
  student_energy: number;
  interruption_count: number;
  engagement_trend: number;
}

export interface CoachingNudge {
  id: string;
  session_id: string;
  timestamp: string;
  nudge_type: string;
  message: string;
  priority: string;
  was_dismissed: boolean;
  trigger_data: Record<string, unknown>;
}

export interface StudentAggregate {
  student_name: string;
  session_count: number;
  avg_engagement: number;
  last_session_date: string;
}
