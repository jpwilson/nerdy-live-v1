"use client";

import { Component, type ReactNode, useEffect, useRef, useState } from "react";

// ── Types ───────────────────────────────────────────────────────
interface StudentMetrics {
  faceDetected: boolean;
  eyeContact: number;
  eyeContactSmoothed: number;
  isSpeaking: boolean;
  speakingTime: number;
  engagement: number;
  headPose: { yaw: number; pitch: number };
  coachingNudge: string | null;
}

/** Face position data exposed to parent for centering + overlay */
export interface FacePositionData {
  /** Is a face currently detected? */
  faceDetected: boolean;
  /** Normalized bounding box [0..1] of the face in the video frame */
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  /** Whether the face is partially out of frame */
  partiallyOutOfFrame: boolean;
  /** Raw 478 face landmarks (normalized 0..1) */
  landmarks: Array<{ x: number; y: number; z: number }> | null;
  /** Blendshape scores keyed by name */
  blendshapes: Record<string, number> | null;
  /** Head pose */
  headPose: { yaw: number; pitch: number };
}

const INITIAL_METRICS: StudentMetrics = {
  faceDetected: false,
  eyeContact: 0,
  eyeContactSmoothed: 0,
  isSpeaking: false,
  speakingTime: 0,
  engagement: 0,
  headPose: { yaw: 0, pitch: 0 },
  coachingNudge: null,
};

// ── Error boundary so analysis can never crash the room ─────────
class AnalysisErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <section className="sidebar-card analysis-card">
          <h3>Student Analysis</h3>
          <p className="analysis-loading" style={{ color: "var(--warn)" }}>
            Analysis unavailable: {this.state.error}
          </p>
        </section>
      );
    }
    return this.props.children;
  }
}

// ── Public API: self-contained analysis panel ───────────────────
export function StudentAnalysisCard({
  remoteStream,
  onFacePosition,
}: {
  remoteStream: MediaStream | null;
  onFacePosition?: (data: FacePositionData) => void;
}) {
  return (
    <AnalysisErrorBoundary>
      <AnalysisPanelInner remoteStream={remoteStream} onFacePosition={onFacePosition} />
    </AnalysisErrorBoundary>
  );
}

// ── Inner panel with all analysis logic ─────────────────────────
function AnalysisPanelInner({
  remoteStream,
  onFacePosition,
}: {
  remoteStream: MediaStream | null;
  onFacePosition?: (data: FacePositionData) => void;
}) {
  const [metrics, setMetrics] = useState<StudentMetrics>(INITIAL_METRICS);
  const [status, setStatus] = useState("Initializing…");

  const landmarkerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const eyeHistRef = useRef<number[]>([]);
  const speakHistRef = useRef<boolean[]>([]);

  // Load MediaPipe FaceLandmarker
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus("Loading face model…");
        const { FaceLandmarker, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );
        const resolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
        );
        const lm = await FaceLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
        if (!cancelled) {
          landmarkerRef.current = lm;
          setStatus("ready");
        }
      } catch (err) {
        console.error("[analysis] FaceLandmarker init failed:", err);
        if (!cancelled)
          setStatus(
            `Face model failed: ${err instanceof Error ? err.message : String(err)}`,
          );
      }
    })();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  // Create hidden video + audio analyser for remote stream
  useEffect(() => {
    if (!remoteStream) return;

    const video = document.createElement("video");
    Object.assign(video.style, {
      position: "fixed",
      width: "320px",
      height: "240px",
      top: "-9999px",
      left: "-9999px",
      pointerEvents: "none",
    });
    video.srcObject = remoteStream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    document.body.appendChild(video);
    video.play().catch(() => {});
    videoRef.current = video;

    // Audio analyser
    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length > 0) {
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(remoteStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        /* no audio analysis */
      }
    }

    return () => {
      video.srcObject = null;
      video.remove();
      videoRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [remoteStream]);

  // Stable ref for onFacePosition to avoid re-creating the interval
  const onFacePositionRef = useRef(onFacePosition);
  onFacePositionRef.current = onFacePosition;

  // Analysis loop
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const lm = landmarkerRef.current;

      let faceDetected = false;
      let eyeContact = 0;
      let yaw = 0;
      let pitch = 0;
      let faceBoundingBox: FacePositionData["boundingBox"] = null;
      let partiallyOutOfFrame = false;
      let rawLandmarks: FacePositionData["landmarks"] = null;
      let blendshapeScores: Record<string, number> | null = null;

      // Face analysis (if model loaded and video ready)
      if (lm && video && video.readyState >= 2) {
        try {
          const result = lm.detectForVideo(video, performance.now());

          if (result.faceBlendshapes?.length > 0) {
            faceDetected = true;
            const cats = result.faceBlendshapes[0].categories;
            const s: Record<string, number> = {};
            for (const c of cats) s[c.categoryName] = c.score;
            blendshapeScores = s;

            const hDev =
              ((s.eyeLookInLeft ?? 0) +
                (s.eyeLookOutLeft ?? 0) +
                (s.eyeLookInRight ?? 0) +
                (s.eyeLookOutRight ?? 0)) /
              4;
            const vDev =
              ((s.eyeLookUpLeft ?? 0) +
                (s.eyeLookUpRight ?? 0) +
                (s.eyeLookDownLeft ?? 0) +
                (s.eyeLookDownRight ?? 0)) /
              4;
            eyeContact = Math.max(
              0,
              Math.min(1, 1 - Math.max(hDev, vDev) * 3),
            );

            if (result.faceLandmarks?.length > 0) {
              const lmks = result.faceLandmarks[0];
              rawLandmarks = lmks.map((l: { x: number; y: number; z: number }) => ({
                x: l.x,
                y: l.y,
                z: l.z,
              }));

              const nose = lmks[1];
              const lc = lmks[234];
              const rc = lmks[454];
              yaw = (nose.x - (lc.x + rc.x) / 2) * 180;
              const le = lmks[33];
              const re = lmks[263];
              pitch = (nose.y - (le.y + re.y) / 2) * 180;

              // Compute bounding box from all landmarks
              let minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const pt of lmks) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }
              // Add some padding (15% of face size)
              const padX = (maxX - minX) * 0.15;
              const padY = (maxY - minY) * 0.15;
              minX = Math.max(0, minX - padX);
              maxX = Math.min(1, maxX + padX);
              minY = Math.max(0, minY - padY);
              maxY = Math.min(1, maxY + padY);

              faceBoundingBox = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
              };

              // Check if face is partially out of frame
              const EDGE_THRESH = 0.03;
              if (
                minX < EDGE_THRESH ||
                maxX > 1 - EDGE_THRESH ||
                minY < EDGE_THRESH ||
                maxY > 1 - EDGE_THRESH
              ) {
                partiallyOutOfFrame = true;
              }
            }
          }
        } catch {
          /* frame timing errors */
        }
      }

      // Speaking detection (always works if audio available)
      let isSpeaking = false;
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        isSpeaking = avg > 18;
      }

      // Rolling histories
      const eh = eyeHistRef.current;
      eh.push(eyeContact * 100);
      if (eh.length > 30) eh.shift();

      const sh = speakHistRef.current;
      sh.push(isSpeaking);
      if (sh.length > 60) sh.shift();

      const ecSmoothed =
        eh.length > 0 ? eh.reduce((a, b) => a + b, 0) / eh.length : 0;
      const spk =
        sh.length > 0
          ? (sh.filter(Boolean).length / sh.length) * 100
          : 0;

      const engagement = faceDetected
        ? Math.min(100, ecSmoothed * 0.5 + 30 + Math.min(spk, 20))
        : 0;

      let coachingNudge: string | null = null;
      if (!faceDetected && lm) {
        coachingNudge = "No face detected — student may have stepped away.";
      } else if (ecSmoothed < 30 && eh.length > 10) {
        coachingNudge = "Low eye contact — student may be distracted.";
      } else if (spk < 10 && sh.length > 20) {
        coachingNudge = "Student hasn't spoken much — try asking a question.";
      }

      setMetrics({
        faceDetected,
        eyeContact: Math.round(eyeContact * 100),
        eyeContactSmoothed: Math.round(ecSmoothed),
        isSpeaking,
        speakingTime: Math.round(spk),
        engagement: Math.round(engagement),
        headPose: { yaw: Math.round(yaw), pitch: Math.round(pitch) },
        coachingNudge,
      });

      // Pass face position data to parent
      onFacePositionRef.current?.({
        faceDetected,
        boundingBox: faceBoundingBox,
        partiallyOutOfFrame,
        landmarks: rawLandmarks,
        blendshapes: blendshapeScores,
        headPose: { yaw, pitch },
      });
    }, 350);

    return () => clearInterval(interval);
  }, []);

  // ── Render ──────────────────────────────────────────────────
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

      {status !== "ready" && (
        <p className="analysis-loading">{status}</p>
      )}

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
          <strong
            style={{
              color: metrics.isSpeaking ? "var(--success)" : "var(--muted)",
            }}
          >
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

// ── Helpers ─────────────────────────────────────────────────────
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
