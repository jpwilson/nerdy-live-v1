// Supabase Edge Function: Generate post-session analytics summary
// POST /functions/v1/session-summary
// Body: { session_id: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface MetricsSnapshot {
  tutor_eye_contact: number;
  student_eye_contact: number;
  tutor_talk_pct: number;
  student_talk_pct: number;
  tutor_energy: number;
  student_energy: number;
  interruption_count: number;
  engagement_trend: string;
  timestamp: string;
}

interface KeyMoment {
  timestamp: string;
  type: string;
  description: string;
}

serve(async (req: Request) => {
  try {
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch all metrics snapshots for this session
    const { data: snapshots, error } = await supabase
      .from("metrics_snapshots")
      .select("*")
      .eq("session_id", session_id)
      .order("timestamp", { ascending: true });

    if (error) throw error;
    if (!snapshots || snapshots.length === 0) {
      return new Response(JSON.stringify({ error: "No metrics found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const metrics = snapshots as MetricsSnapshot[];

    // Calculate averages
    const avgTutorEye = average(metrics.map((m) => m.tutor_eye_contact));
    const avgStudentEye = average(metrics.map((m) => m.student_eye_contact));
    const avgTutorTalk = average(metrics.map((m) => m.tutor_talk_pct));
    const avgStudentTalk = average(metrics.map((m) => m.student_talk_pct));
    const avgTutorEnergy = average(metrics.map((m) => m.tutor_energy));
    const avgStudentEnergy = average(metrics.map((m) => m.student_energy));
    const totalInterruptions =
      metrics[metrics.length - 1].interruption_count;

    // Detect key moments
    const keyMoments = detectKeyMoments(metrics);

    // Calculate engagement score
    const engagementScore = calculateEngagementScore(
      avgTutorEye,
      avgStudentEye,
      avgTutorTalk,
      avgStudentTalk,
      avgTutorEnergy,
      avgStudentEnergy,
      totalInterruptions
    );

    // Generate recommendations
    const recommendations = generateRecommendations(
      avgTutorTalk,
      avgStudentEye,
      totalInterruptions,
      avgTutorEnergy,
      avgStudentEnergy
    );

    // Fetch session for duration
    const { data: session } = await supabase
      .from("sessions")
      .select("started_at, ended_at")
      .eq("id", session_id)
      .single();

    const durationMinutes = session
      ? Math.round(
          (new Date(session.ended_at).getTime() -
            new Date(session.started_at).getTime()) /
            60000
        )
      : 0;

    // Save summary
    const summary = {
      session_id,
      duration_minutes: durationMinutes,
      talk_time_ratio: { tutor: avgTutorTalk, student: avgStudentTalk },
      avg_eye_contact: { tutor: avgTutorEye, student: avgStudentEye },
      total_interruptions: totalInterruptions,
      engagement_score: engagementScore,
      key_moments: keyMoments,
      recommendations,
    };

    const { data: saved, error: saveError } = await supabase
      .from("session_summaries")
      .upsert(summary, { onConflict: "session_id" })
      .select()
      .single();

    if (saveError) throw saveError;

    return new Response(JSON.stringify(saved), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateEngagementScore(
  tutorEye: number,
  studentEye: number,
  tutorTalk: number,
  studentTalk: number,
  tutorEnergy: number,
  studentEnergy: number,
  interruptions: number
): number {
  const eyeContactScore = ((tutorEye + studentEye) / 2) * 30;
  const energyScore = ((tutorEnergy + studentEnergy) / 2) * 30;
  const talkBalance = (1.0 - Math.abs(tutorTalk - 0.5) * 2) * 25;
  const interruptionPenalty = Math.min(interruptions * 0.5, 15);

  return Math.max(
    0,
    Math.min(100, eyeContactScore + energyScore + talkBalance - interruptionPenalty)
  );
}

function detectKeyMoments(metrics: MetricsSnapshot[]): KeyMoment[] {
  const moments: KeyMoment[] = [];
  const windowSize = 5;

  for (let i = windowSize; i < metrics.length; i++) {
    const current = metrics[i];
    const previous = metrics[i - windowSize];

    // Attention drop
    if (
      current.student_eye_contact < 0.3 &&
      previous.student_eye_contact > 0.6
    ) {
      moments.push({
        timestamp: current.timestamp,
        type: "attention_drop",
        description: "Student engagement dropped significantly",
      });
    }

    // Energy spike
    if (
      current.tutor_energy > 0.8 &&
      current.student_energy > 0.8 &&
      previous.tutor_energy < 0.5
    ) {
      moments.push({
        timestamp: current.timestamp,
        type: "energy_spike",
        description: "Both participants highly engaged",
      });
    }

    // Interruption cluster
    if (
      current.interruption_count - previous.interruption_count >= 3
    ) {
      moments.push({
        timestamp: current.timestamp,
        type: "interruption_cluster",
        description: "Multiple interruptions in short period",
      });
    }
  }

  return moments.slice(0, 10); // Limit to 10 key moments
}

function generateRecommendations(
  tutorTalk: number,
  studentEye: number,
  interruptions: number,
  tutorEnergy: number,
  studentEnergy: number
): string[] {
  const recs: string[] = [];

  if (tutorTalk > 0.7) {
    recs.push(
      "Try shorter explanation segments and ask more check-for-understanding questions"
    );
  }

  if (studentEye < 0.4) {
    recs.push(
      "Work on keeping student engaged - try more interactive activities or direct questions"
    );
  }

  if (interruptions > 5) {
    recs.push(
      "Practice giving more wait time (3-5 seconds) after asking questions"
    );
  }

  if ((tutorEnergy + studentEnergy) / 2 < 0.4) {
    recs.push(
      "Consider adding variety to session structure - breaks, different activities"
    );
  }

  if (tutorTalk < 0.3) {
    recs.push(
      "You may need to provide more guidance - check if student needs more support"
    );
  }

  if (recs.length === 0) {
    recs.push("Great session! Keep up the excellent teaching practices.");
  }

  return recs;
}
