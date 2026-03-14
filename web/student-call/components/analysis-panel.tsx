"use client";

import type { StudentMetrics } from "@/lib/use-student-analysis";

function MetricBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="metric-row">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <span className="metric-value" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="metric-track">
        <div
          className="metric-fill"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function AnalysisPanel({
  metrics,
  modelLoading,
  modelReady,
  modelError,
}: {
  metrics: StudentMetrics;
  modelLoading: boolean;
  modelReady: boolean;
  modelError: string | null;
}) {
  if (modelError) {
    return (
      <section className="sidebar-card analysis-card">
        <h3>Student Analysis</h3>
        <p className="analysis-loading" style={{ color: "var(--danger)" }}>
          Analysis failed: {modelError}
        </p>
      </section>
    );
  }

  if (modelLoading) {
    return (
      <section className="sidebar-card analysis-card">
        <h3>Student Analysis</h3>
        <p className="analysis-loading">Loading face analysis model…</p>
      </section>
    );
  }

  if (!modelReady) {
    return (
      <section className="sidebar-card analysis-card">
        <h3>Student Analysis</h3>
        <p className="analysis-loading">Initializing…</p>
      </section>
    );
  }

  const ecColor =
    metrics.eyeContactSmoothed >= 60
      ? "var(--success)"
      : metrics.eyeContactSmoothed >= 30
        ? "var(--warn)"
        : "var(--danger)";

  const engColor =
    metrics.engagement >= 60
      ? "var(--success)"
      : metrics.engagement >= 30
        ? "var(--warn)"
        : "var(--danger)";

  return (
    <section className="sidebar-card analysis-card">
      <h3>Student Analysis</h3>

      <div className="analysis-status">
        <span
          className={`analysis-dot ${metrics.faceDetected ? "detected" : "missing"}`}
        />
        <span>
          {metrics.faceDetected ? "Face detected" : "No face detected"}
        </span>
      </div>

      <div className="metrics-grid">
        <MetricBar
          label="Eye Contact"
          value={metrics.eyeContactSmoothed}
          color={ecColor}
        />
        <MetricBar
          label="Speaking Time"
          value={metrics.speakingTime}
          color="var(--blue)"
        />
        <MetricBar
          label="Engagement"
          value={metrics.engagement}
          color={engColor}
        />
      </div>

      <div className="metric-details">
        <div className="metric-detail-row">
          <span>Speaking now</span>
          <strong style={{ color: metrics.isSpeaking ? "var(--success)" : "var(--muted)" }}>
            {metrics.isSpeaking ? "Yes" : "No"}
          </strong>
        </div>
        <div className="metric-detail-row">
          <span>Head yaw</span>
          <strong>{metrics.headPose.yaw}°</strong>
        </div>
        <div className="metric-detail-row">
          <span>Head pitch</span>
          <strong>{metrics.headPose.pitch}°</strong>
        </div>
      </div>

      {metrics.coachingNudge && (
        <div className="coaching-nudge">
          <span className="nudge-icon">💡</span>
          <span>{metrics.coachingNudge}</span>
        </div>
      )}
    </section>
  );
}
