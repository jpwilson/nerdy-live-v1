"use client";

import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// ── Types ───────────────────────────────────────────────────────

/** Detected facial expression with interpretation */
interface FacialExpression {
  name: string;
  interpretation: string;
  confidence: number;
  category: "positive" | "neutral" | "concern";
}

interface StudentMetrics {
  faceDetected: boolean;
  eyeContact: number;
  eyeContactSmoothed: number;
  isSpeaking: boolean;
  speakingTime: number;
  engagement: number;
  headPose: { yaw: number; pitch: number };
  coachingNudge: string | null;
  expressions: FacialExpression[];
  attentionDrift: number; // 0-100, higher = more drifting
  interruptionCount: number;
  energyLevel: number; // 0-100
  facePosY: number; // normalized face Y position (for posture tracking)
  gazeDirection: string; // "center" | "left" | "right" | "up" | "down"
  localSpeaking: boolean; // tutor speaking
}

/** Structured coaching nudge */
export interface CoachingNudge {
  id: string;
  priority: "high" | "medium" | "low";
  category: "engagement" | "talk_balance" | "positive" | "technique" | "attention";
  message: string;
  timestamp: number;
}

/** All 9 tracked expression types */
const ALL_EXPRESSIONS = [
  "Smiling", "Frowning", "Surprised", "Squinting", "Yawning",
  "Lip pressing", "Mouth puckered", "Frustrated", "Focused",
] as const;

/** Pose/body data from MediaPipe PoseLandmarker */
export interface PoseData {
  /** Left shoulder (landmark 11) normalized coords */
  leftShoulder: { x: number; y: number; z: number } | null;
  /** Right shoulder (landmark 12) normalized coords */
  rightShoulder: { x: number; y: number; z: number } | null;
  /** Left hip (landmark 23) normalized coords */
  leftHip: { x: number; y: number; z: number } | null;
  /** Right hip (landmark 24) normalized coords */
  rightHip: { x: number; y: number; z: number } | null;
  /** Angle between shoulders in degrees (0 = level) */
  shoulderTilt: number;
  /** Shoulder-to-hip distance ratio (lower = more slouched) */
  slouchRatio: number;
  /** Human-readable shoulder status */
  shoulderStatus: "level" | "tilted";
  /** Human-readable posture from body landmarks */
  bodyPosture: "upright" | "slouching" | "unknown";
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
  /** Body/pose data from PoseLandmarker */
  pose: PoseData | null;
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
  expressions: [],
  attentionDrift: 0,
  interruptionCount: 0,
  energyLevel: 50,
  facePosY: 0.5,
  gazeDirection: "center",
  localSpeaking: false,
};

// EMA helper
function ema(prev: number, next: number, alpha: number): number {
  return prev + alpha * (next - prev);
}

// ── Expression Detection from Blendshapes ───────────────────────
function detectExpressions(bs: Record<string, number>): FacialExpression[] {
  const expressions: FacialExpression[] = [];

  // Smiling — positive engagement signal
  // cheekSquint indicates a Duchenne (genuine) smile vs. polite
  const smileL = bs.mouthSmileLeft ?? 0;
  const smileR = bs.mouthSmileRight ?? 0;
  const smile = (smileL + smileR) / 2;
  const cheekSquint = ((bs.cheekSquintLeft ?? 0) + (bs.cheekSquintRight ?? 0)) / 2;
  if (smile > 0.3) {
    const genuine = cheekSquint > 0.2;
    expressions.push({
      name: "Smiling",
      interpretation: genuine
        ? (smile > 0.6 ? "Genuinely engaged" : "Warm & positive")
        : (smile > 0.6 ? "Engaged & enjoying" : "Mildly positive"),
      confidence: Math.min(1, smile),
      category: "positive",
    });
  }

  // Frowning — could indicate confusion or concentration
  const browDownL = bs.browDownLeft ?? 0;
  const browDownR = bs.browDownRight ?? 0;
  const frown = (browDownL + browDownR) / 2;
  if (frown > 0.35) {
    const innerUp = bs.browInnerUp ?? 0;
    expressions.push({
      name: "Frowning",
      interpretation: innerUp > 0.3 ? "Possibly confused" : "Concentrating",
      confidence: Math.min(1, frown),
      category: innerUp > 0.3 ? "concern" : "neutral",
    });
  }

  // Surprised — raised eyebrows + wide eyes
  const browUp = bs.browInnerUp ?? 0;
  const eyeWideL = bs.eyeWideLeft ?? 0;
  const eyeWideR = bs.eyeWideRight ?? 0;
  const surprise = (browUp + (eyeWideL + eyeWideR) / 2) / 2;
  if (surprise > 0.35) {
    expressions.push({
      name: "Surprised",
      interpretation: "Alert or curious",
      confidence: Math.min(1, surprise),
      category: "positive",
    });
  }

  // Squinting — difficulty seeing or skepticism
  const squintL = bs.eyeSquintLeft ?? 0;
  const squintR = bs.eyeSquintRight ?? 0;
  const squint = (squintL + squintR) / 2;
  if (squint > 0.4 && smile < 0.3) {
    expressions.push({
      name: "Squinting",
      interpretation: "Can't see clearly or skeptical",
      confidence: Math.min(1, squint),
      category: "concern",
    });
  }

  // Yawning — jaw open wide + mouth stretch
  const jawOpen = bs.jawOpen ?? 0;
  const mouthStretch = (bs.mouthStretchLeft ?? 0) + (bs.mouthStretchRight ?? 0);
  if (jawOpen > 0.5 && mouthStretch > 0.2) {
    expressions.push({
      name: "Yawning",
      interpretation: "Tired or bored",
      confidence: Math.min(1, jawOpen),
      category: "concern",
    });
  }

  // Lip press — nervousness or holding back
  const lipPress = ((bs.mouthPressLeft ?? 0) + (bs.mouthPressRight ?? 0)) / 2;
  if (lipPress > 0.4 && smile < 0.2) {
    expressions.push({
      name: "Lip pressing",
      interpretation: "Nervous or thinking",
      confidence: Math.min(1, lipPress),
      category: "neutral",
    });
  }

  // Mouth pucker — confusion or thinking
  const pucker = bs.mouthPucker ?? 0;
  if (pucker > 0.4) {
    expressions.push({
      name: "Mouth puckered",
      interpretation: "Thinking or confused",
      confidence: Math.min(1, pucker),
      category: "neutral",
    });
  }

  // Frustrated — nose sneer + frown + jaw tension
  const noseSneer = ((bs.noseSneerLeft ?? 0) + (bs.noseSneerRight ?? 0)) / 2;
  if (noseSneer > 0.3 && frown > 0.25) {
    expressions.push({
      name: "Frustrated",
      interpretation: "Struggling or annoyed",
      confidence: Math.min(1, (noseSneer + frown) / 2),
      category: "concern",
    });
  }

  // Focused — stable gaze, moderate eye opening, low other expressions
  const eyeWideAvg = ((bs.eyeWideLeft ?? 0) + (bs.eyeWideRight ?? 0)) / 2;
  if (eyeWideAvg > 0.1 && eyeWideAvg < 0.5 && frown < 0.2 && smile < 0.2 && noseSneer < 0.15) {
    // Only show "focused" if no other stronger expressions detected
    if (expressions.length === 0) {
      expressions.push({
        name: "Focused",
        interpretation: "Attentive & concentrating",
        confidence: 0.6,
        category: "positive",
      });
    }
  }

  return expressions;
}

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

/** Overlay display mode */
export type OverlayMode = "all" | "expressions" | "engagement" | "none";

// ── Public API: self-contained analysis panel ───────────────────
export function StudentAnalysisCard({
  remoteStream,
  localStream,
  onFacePosition,
  overlayMode,
  onOverlayModeChange,
  onNudge,
}: {
  remoteStream: MediaStream | null;
  localStream?: MediaStream | null;
  onFacePosition?: (data: FacePositionData) => void;
  overlayMode?: OverlayMode;
  onOverlayModeChange?: (mode: OverlayMode) => void;
  onNudge?: (nudge: CoachingNudge | null) => void;
}) {
  return (
    <AnalysisErrorBoundary>
      <AnalysisPanelInner
        remoteStream={remoteStream}
        localStream={localStream ?? null}
        onFacePosition={onFacePosition}
        overlayMode={overlayMode ?? "all"}
        onOverlayModeChange={onOverlayModeChange}
        onNudge={onNudge}
      />
    </AnalysisErrorBoundary>
  );
}

// ── Inner panel with all analysis logic ─────────────────────────
function AnalysisPanelInner({
  remoteStream,
  localStream,
  onFacePosition,
  overlayMode,
  onOverlayModeChange,
  onNudge,
}: {
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  onFacePosition?: (data: FacePositionData) => void;
  overlayMode: OverlayMode;
  onOverlayModeChange?: (mode: OverlayMode) => void;
  onNudge?: (nudge: CoachingNudge | null) => void;
}) {
  const [metrics, setMetrics] = useState<StudentMetrics>(INITIAL_METRICS);
  const [status, setStatus] = useState("Initializing…");
  const [activeTab, setActiveTab] = useState<"live" | "trends">("live");
  const [collapsed, setCollapsed] = useState(false);
  const [nudges, setNudges] = useState<CoachingNudge[]>([]);
  const [toastNudge, setToastNudge] = useState<CoachingNudge | null>(null);

  const lastPersistRef = useRef(0);
  const lastLocalPersistRef = useRef(0);
  const snapshotCountRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  // EMA-smoothed values for Trends tab (alpha=0.1 for slow smoothing)
  const emaEngagementRef = useRef(50);
  const emaEyeContactRef = useRef(50);
  const emaEnergyRef = useRef(50);
  const emaDriftRef = useRef(0);
  const emaSpeakingRef = useRef(30);
  const emaMoodRef = useRef<string>("Neutral");

  // New metric tracking refs
  const blinkTimestampsRef = useRef<number[]>([]); // timestamps of detected blinks
  const lastBlinkStateRef = useRef(false); // was blinking in previous frame
  const blinkRateRef = useRef(0); // blinks per minute
  const headStabilityRef = useRef(0); // 0-100, inverse of yaw variance
  const exprChangeTimestampsRef = useRef<number[]>([]); // timestamps of expression changes
  const lastExprSetRef = useRef<string>(""); // serialized last expression set for change detection
  const facialResponsivenessRef = useRef(0); // expression changes per minute

  // Coaching nudge system state
  const lastNudgeTimeRef = useRef(0);
  const nudgeCountRef = useRef(0);
  const lastNudgeCategoryRef = useRef<Record<string, number>>({});
  const sessionStartRef = useRef(Date.now());

  // Window-based nudge assessment
  const studentLastSeenRef = useRef(0);
  const baselineRef = useRef<{ engagement: number; eyeContact: number; speaking: number } | null>(null);
  const windowSamplesRef = useRef<{ engagement: number; eyeContact: number; speaking: number; ts: number }[]>([]);
  const lastWindowAssessRef = useRef(0);
  const nudgeLevelRef = useRef(0); // 0=none, 1=gentle, 2=stronger, 3=urgent
  const postNudgeEngRef = useRef<number | null>(null); // engagement when last nudge was sent

  const landmarkerRef = useRef<any>(null);
  const poseLandmarkerRef = useRef<any>(null);
  const poseFrameCountRef = useRef(0);
  const poseDataRef = useRef<PoseData | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const eyeHistRef = useRef<number[]>([]);
  const speakHistRef = useRef<boolean[]>([]);

  // Eye contact auto-calibration: learn where the student naturally looks
  // during the first 60s, then use that as the "engaged" baseline.
  const gazeCalibrationRef = useRef<{
    samples: { hDev: number; lookUp: number; lookDown: number }[];
    baselineH: number;
    baselineLookUp: number;
    baselineLookDown: number;
    calibrated: boolean;
    startTime: number;
  }>({
    samples: [],
    baselineH: 0,
    baselineLookUp: 0,
    baselineLookDown: 0,
    calibrated: false,
    startTime: Date.now(),
  });

  // Load MediaPipe FaceLandmarker + PoseLandmarker
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus("Loading face model…");
        const { FaceLandmarker, PoseLandmarker, FilesetResolver } = await import(
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

        // Load PoseLandmarker (lite model, non-blocking)
        try {
          const pl = await PoseLandmarker.createFromOptions(resolver, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            outputSegmentationMasks: false,
          });
          if (!cancelled) {
            poseLandmarkerRef.current = pl;
          }
        } catch (poseErr) {
          console.warn("[analysis] PoseLandmarker init failed (non-critical):", poseErr);
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
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
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

  // Rolling histories for attention drift
  const headYawHistRef = useRef<number[]>([]);
  const headPitchHistRef = useRef<number[]>([]);
  const facePosHistRef = useRef<number[]>([]);
  const interruptCountRef = useRef(0);
  const lastSpeakingRef = useRef(false);
  const localSpeakingRef = useRef(false);
  const energyHistRef = useRef<number[]>([]);
  const blinkHistRef = useRef<number[]>([]);
  const noFaceCountRef = useRef(0);

  // Local audio analyser for interruption detection
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localAudioCtxRef = useRef<AudioContext | null>(null);

  // Set up local audio analysis for interruption detection
  useEffect(() => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      localAudioCtxRef.current = ctx;
      localAnalyserRef.current = analyser;
    } catch {
      /* no local audio analysis */
    }

    return () => {
      localAudioCtxRef.current?.close();
      localAudioCtxRef.current = null;
      localAnalyserRef.current = null;
    };
  }, [localStream]);

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
      let expressions: FacialExpression[] = [];
      let faceCenterY = 0.5;

      // Face analysis (if model loaded and video ready)
      if (lm && video && video.readyState >= 2) {
        try {
          const result = lm.detectForVideo(video, performance.now());

          if (result.faceBlendshapes?.length > 0) {
            faceDetected = true;
            noFaceCountRef.current = 0;
            const cats = result.faceBlendshapes[0].categories;
            const s: Record<string, number> = {};
            for (const c of cats) s[c.categoryName] = c.score;
            blendshapeScores = s;

            // Detect facial expressions
            expressions = detectExpressions(s);

            // Track blink rate for attention drift
            const blinkAvg = ((s.eyeBlinkLeft ?? 0) + (s.eyeBlinkRight ?? 0)) / 2;
            const bh = blinkHistRef.current;
            bh.push(blinkAvg > 0.5 ? 1 : 0);
            if (bh.length > 60) bh.shift();

            // Eye contact with auto-calibration:
            // During first 60s, learn where the student naturally looks (their "engaged" position).
            // After calibration, measure deviation FROM that baseline, not from a fixed center.
            const hDev =
              ((s.eyeLookInLeft ?? 0) +
                (s.eyeLookOutLeft ?? 0) +
                (s.eyeLookInRight ?? 0) +
                (s.eyeLookOutRight ?? 0)) /
              4;
            const lookUp = ((s.eyeLookUpLeft ?? 0) + (s.eyeLookUpRight ?? 0)) / 2;
            const lookDown = ((s.eyeLookDownLeft ?? 0) + (s.eyeLookDownRight ?? 0)) / 2;

            const cal = gazeCalibrationRef.current;
            const elapsed = Date.now() - cal.startTime;

            if (!cal.calibrated && elapsed < 60_000) {
              // Calibration phase: collect where student naturally looks
              cal.samples.push({ hDev, lookUp, lookDown });
              // During calibration, assume engaged if face is present
              eyeContact = 0.9;
            } else {
              // Finalize calibration if not done yet
              if (!cal.calibrated && cal.samples.length > 10) {
                const n = cal.samples.length;
                cal.baselineH = cal.samples.reduce((a, s2) => a + s2.hDev, 0) / n;
                cal.baselineLookUp = cal.samples.reduce((a, s2) => a + s2.lookUp, 0) / n;
                cal.baselineLookDown = cal.samples.reduce((a, s2) => a + s2.lookDown, 0) / n;
                cal.calibrated = true;
              }

              // Wide dead zones: normal screen-looking variance should score ~100%
              // Only penalize when gaze deviates significantly from their baseline
              const hDeadZone = 0.12; // horizontal tolerance
              const vDeadZone = 0.20; // vertical tolerance (looking up/down at notes is fine)
              const hDevFromBaseline = Math.max(0, Math.abs(hDev - cal.baselineH) - hDeadZone);
              const upDevFromBaseline = Math.max(0, lookUp - cal.baselineLookUp - vDeadZone);
              const downDevFromBaseline = Math.max(0, lookDown - cal.baselineLookDown - vDeadZone);
              const vDevFromBaseline = Math.max(upDevFromBaseline, downDevFromBaseline);

              // Gentle penalty curve: only really drops when looking far away
              eyeContact = Math.max(
                0,
                Math.min(1, 1 - (hDevFromBaseline * 2.0 + vDevFromBaseline * 1.0)),
              );
            }

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

              // Track face center Y for posture
              faceCenterY = nose.y;

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
          } else {
            noFaceCountRef.current++;
          }
        } catch {
          /* frame timing errors */
        }
      }

      // Pose detection — every 3rd frame for performance
      poseFrameCountRef.current++;
      const pl = poseLandmarkerRef.current;
      if (pl && video && video.readyState >= 2 && poseFrameCountRef.current % 3 === 0) {
        try {
          const poseResult = pl.detectForVideo(video, performance.now());
          if (poseResult.landmarks?.length > 0) {
            const poseLm = poseResult.landmarks[0];
            // Landmark indices: 11=left shoulder, 12=right shoulder, 23=left hip, 24=right hip
            const ls = poseLm[11] ? { x: poseLm[11].x, y: poseLm[11].y, z: poseLm[11].z } : null;
            const rs = poseLm[12] ? { x: poseLm[12].x, y: poseLm[12].y, z: poseLm[12].z } : null;
            const lh = poseLm[23] ? { x: poseLm[23].x, y: poseLm[23].y, z: poseLm[23].z } : null;
            const rh = poseLm[24] ? { x: poseLm[24].x, y: poseLm[24].y, z: poseLm[24].z } : null;

            // Calculate shoulder tilt (degrees)
            let shoulderTilt = 0;
            if (ls && rs) {
              const dy = rs.y - ls.y;
              const dx = rs.x - ls.x;
              shoulderTilt = Math.atan2(dy, dx) * (180 / Math.PI);
            }

            // Calculate slouch ratio: avg shoulder-to-hip vertical distance
            // Higher = more upright, lower = more slouched
            let slouchRatio = 1;
            if (ls && rs && lh && rh) {
              const leftDist = Math.abs(lh.y - ls.y);
              const rightDist = Math.abs(rh.y - rs.y);
              const shoulderWidth = Math.abs(rs.x - ls.x);
              // Ratio of torso height to shoulder width; upright ~1.2-1.5, slouched <0.8
              slouchRatio = shoulderWidth > 0.01 ? ((leftDist + rightDist) / 2) / shoulderWidth : 1;
            }

            const shoulderStatus: "level" | "tilted" = Math.abs(shoulderTilt) > 8 ? "tilted" : "level";
            const bodyPosture: "upright" | "slouching" | "unknown" =
              (ls && rs && lh && rh) ? (slouchRatio < 0.7 ? "slouching" : "upright") : "unknown";

            poseDataRef.current = {
              leftShoulder: ls,
              rightShoulder: rs,
              leftHip: lh,
              rightHip: rh,
              shoulderTilt,
              slouchRatio,
              shoulderStatus,
              bodyPosture,
            };
          }
        } catch {
          /* pose frame timing errors */
        }
      }

      // Speaking detection — remote (student)
      let isSpeaking = false;
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        isSpeaking = avg > 18;
      }

      // Speaking detection — local (tutor) for interruption detection
      let localSpeaking = false;
      if (localAnalyserRef.current) {
        const buf = new Uint8Array(localAnalyserRef.current.frequencyBinCount);
        localAnalyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        localSpeaking = avg > 18;
      }

      // Interruption detection: both speaking at same time
      if (isSpeaking && localSpeaking && !lastSpeakingRef.current) {
        interruptCountRef.current++;
      }
      lastSpeakingRef.current = isSpeaking && localSpeaking;
      localSpeakingRef.current = localSpeaking;

      // Rolling histories
      const eh = eyeHistRef.current;
      eh.push(eyeContact * 100);
      if (eh.length > 30) eh.shift();

      const sh = speakHistRef.current;
      sh.push(isSpeaking);
      if (sh.length > 60) sh.shift();

      // Head movement history for attention drift
      const yawH = headYawHistRef.current;
      yawH.push(Math.abs(yaw));
      if (yawH.length > 20) yawH.shift();

      const pitchH = headPitchHistRef.current;
      pitchH.push(Math.abs(pitch));
      if (pitchH.length > 20) pitchH.shift();

      // Face position history for posture tracking
      const fph = facePosHistRef.current;
      if (faceDetected) {
        fph.push(faceCenterY);
        if (fph.length > 30) fph.shift();
      }

      const ecSmoothed =
        eh.length > 0 ? eh.reduce((a, b) => a + b, 0) / eh.length : 0;
      const spk =
        sh.length > 0
          ? (sh.filter(Boolean).length / sh.length) * 100
          : 0;

      // Attention drift: combination of head movement variance, low eye contact, and face absence
      const yawVariance = yawH.length > 5
        ? Math.sqrt(yawH.reduce((sum, v) => sum + (v - yawH.reduce((a, b) => a + b, 0) / yawH.length) ** 2, 0) / yawH.length)
        : 0;
      const headMovementDrift = Math.min(100, yawVariance * 5);
      const eyeContactDrift = Math.max(0, 100 - ecSmoothed);
      const faceMissingDrift = noFaceCountRef.current > 5 ? 80 : 0;
      const attentionDrift = Math.min(100, Math.round(
        headMovementDrift * 0.3 + eyeContactDrift * 0.5 + faceMissingDrift * 0.2
      ));

      // Energy level: combination of speaking activity, facial movement, expression variety
      const expressionEnergy = expressions.length > 0
        ? Math.min(40, expressions.reduce((sum, e) => sum + e.confidence * 20, 0))
        : 0;
      const speakingEnergy = Math.min(30, spk * 0.3);
      const movementEnergy = Math.min(30, yawVariance * 3);
      const rawEnergy = expressionEnergy + speakingEnergy + movementEnergy;
      const enH = energyHistRef.current;
      enH.push(rawEnergy);
      if (enH.length > 20) enH.shift();
      const energyLevel = Math.round(
        enH.reduce((a, b) => a + b, 0) / enH.length
      );

      // Engagement: face present + looking at screen + participating = engaged
      // Each component is 0-100, then weighted to sum to 100
      const facePresenceScore = faceDetected ? 100 : 0;
      const speakingScore = Math.min(100, spk * 3); // 33%+ speaking → 100
      const stabilityScore = 100 - attentionDrift;
      const engagement = faceDetected
        ? Math.min(100, Math.round(
            facePresenceScore * 0.15 +     // face visible (15%)
            ecSmoothed * 0.35 +            // eye contact (35%)
            speakingScore * 0.20 +         // speaking participation (20%)
            stabilityScore * 0.15 +        // attention stability (15%)
            energyLevel * 0.15             // energy/expressiveness (15%)
          ))
        : 0;

      // Gaze direction from head pose
      let gazeDirection = "center";
      if (Math.abs(yaw) > 15) gazeDirection = yaw > 0 ? "right" : "left";
      else if (Math.abs(pitch) > 12) gazeDirection = pitch > 0 ? "down" : "up";

      // Update EMA-smoothed values for trends (alpha=0.1)
      emaEngagementRef.current = ema(emaEngagementRef.current, engagement, 0.1);
      emaEyeContactRef.current = ema(emaEyeContactRef.current, ecSmoothed, 0.1);
      emaEnergyRef.current = ema(emaEnergyRef.current, energyLevel, 0.1);
      emaDriftRef.current = ema(emaDriftRef.current, attentionDrift, 0.1);
      emaSpeakingRef.current = ema(emaSpeakingRef.current, spk, 0.1);

      // Determine mood from dominant expression
      if (expressions.length > 0) {
        const dominant = expressions.reduce((a, b) => a.confidence > b.confidence ? a : b);
        const moodMap: Record<string, string> = {
          "Smiling": "Positive", "Focused": "Attentive", "Surprised": "Curious",
          "Frowning": "Concentrating", "Frustrated": "Struggling", "Yawning": "Tired",
          "Squinting": "Uncertain", "Lip pressing": "Thoughtful", "Mouth puckered": "Thinking",
        };
        emaMoodRef.current = moodMap[dominant.name] || "Neutral";
      } else if (!faceDetected) {
        emaMoodRef.current = "Unknown";
      }

      // ── New metric: Blink Rate ──────────────────────────────────
      const now2 = Date.now();
      const bh2 = blinkHistRef.current;
      const currentBlinkAvg = bh2.length > 0 ? bh2[bh2.length - 1] : 0;
      const isBlinking = currentBlinkAvg > 0.5;
      // Detect blink onset (transition from not-blinking to blinking)
      if (isBlinking && !lastBlinkStateRef.current) {
        blinkTimestampsRef.current.push(now2);
      }
      lastBlinkStateRef.current = isBlinking;
      // Keep only blinks from last 60 seconds
      blinkTimestampsRef.current = blinkTimestampsRef.current.filter(t => now2 - t < 60_000);
      blinkRateRef.current = blinkTimestampsRef.current.length; // blinks in last 60s = blinks/min

      // ── New metric: Head Stability ──────────────────────────────
      // Inverse of yaw variance, mapped to 0-100
      // yawVariance is already computed above
      const stabilityRaw = Math.max(0, 100 - yawVariance * 10);
      headStabilityRef.current = Math.round(Math.min(100, stabilityRaw));

      // ── New metric: Facial Responsiveness ───────────────────────
      // Track expression changes per minute
      const currentExprSet = expressions.map(e => e.name).sort().join(",");
      if (currentExprSet !== lastExprSetRef.current && currentExprSet !== "") {
        exprChangeTimestampsRef.current.push(now2);
        lastExprSetRef.current = currentExprSet;
      } else if (currentExprSet === "" && lastExprSetRef.current !== "") {
        exprChangeTimestampsRef.current.push(now2);
        lastExprSetRef.current = currentExprSet;
      }
      // Keep only changes from last 60 seconds
      exprChangeTimestampsRef.current = exprChangeTimestampsRef.current.filter(t => now2 - t < 60_000);
      facialResponsivenessRef.current = exprChangeTimestampsRef.current.length;

      // ── Window-based coaching assessment ──────────────────────
      const now = Date.now();
      // Read timing from localStorage (set by Settings page / demo mode toggle)
      const graceSec = parseInt(localStorage.getItem("livesesh_grace_period") || "300", 10);
      const windowSec = parseInt(localStorage.getItem("livesesh_assessment_window") || "180", 10);
      const GRACE_PERIOD = graceSec * 1000;
      const WINDOW_LENGTH = windowSec * 1000;
      const elapsed = now - sessionStartRef.current;

      let coachingNudge: string | null = null;

      // Track when we last saw a student face
      if (faceDetected) studentLastSeenRef.current = now;

      // Gate: no nudges without a student present
      const studentPresent = now - studentLastSeenRef.current < 30_000;

      // Collect window samples
      if (studentPresent) {
        windowSamplesRef.current.push({ engagement, eyeContact: ecSmoothed, speaking: spk, ts: now });
        // Keep only samples within the window
        windowSamplesRef.current = windowSamplesRef.current.filter(s => now - s.ts < Math.max(GRACE_PERIOD, WINDOW_LENGTH));
      }

      if (elapsed < GRACE_PERIOD) {
        // Grace period: observation only, building baseline
        // No nudges during this phase
      } else {
        // Finalize baseline at end of grace period
        if (!baselineRef.current) {
          const samples = windowSamplesRef.current.filter(s => s.ts < sessionStartRef.current + GRACE_PERIOD);
          if (samples.length > 10) {
            baselineRef.current = {
              engagement: samples.reduce((a, s2) => a + s2.engagement, 0) / samples.length,
              eyeContact: samples.reduce((a, s2) => a + s2.eyeContact, 0) / samples.length,
              speaking: samples.reduce((a, s2) => a + s2.speaking, 0) / samples.length,
            };
          } else {
            // Not enough data, use defaults
            baselineRef.current = { engagement: 70, eyeContact: 60, speaking: 20 };
          }
          windowSamplesRef.current = [];
          lastWindowAssessRef.current = now;
        }

        // Assess every window
        if (studentPresent && baselineRef.current && now - lastWindowAssessRef.current > WINDOW_LENGTH) {
          lastWindowAssessRef.current = now;
          const recentSamples = windowSamplesRef.current.filter(s => now - s.ts < WINDOW_LENGTH);

          if (recentSamples.length > 5) {
            const windowAvg = {
              engagement: recentSamples.reduce((a, s2) => a + s2.engagement, 0) / recentSamples.length,
              eyeContact: recentSamples.reduce((a, s2) => a + s2.eyeContact, 0) / recentSamples.length,
              speaking: recentSamples.reduce((a, s2) => a + s2.speaking, 0) / recentSamples.length,
            };

            const baseline = baselineRef.current;
            const engDelta = windowAvg.engagement - baseline.engagement;

            // Check if engagement improved after last nudge (de-escalation)
            if (postNudgeEngRef.current !== null && windowAvg.engagement > postNudgeEngRef.current + 5) {
              nudgeLevelRef.current = Math.max(0, nudgeLevelRef.current - 1);
              postNudgeEngRef.current = null;
              // Positive reinforcement
              const positiveNudge: CoachingNudge = {
                id: `nudge-${now}`, priority: "low" as const, category: "positive",
                message: "Student engagement is recovering — nice work!", timestamp: now
              };
              coachingNudge = positiveNudge.message;
              setNudges(prev => [...prev.slice(-9), positiveNudge]);
              setToastNudge(positiveNudge);
              onNudge?.(positiveNudge);
              setTimeout(() => {
                setToastNudge(prev => prev?.id === positiveNudge.id ? null : prev);
                onNudge?.(null);
              }, 8000);
              lastNudgeTimeRef.current = now;
            }
            // Engagement significantly below baseline → escalate
            else if (engDelta < -15 && now - lastNudgeTimeRef.current > WINDOW_LENGTH) {
              nudgeLevelRef.current = Math.min(3, nudgeLevelRef.current + 1);
              const level = nudgeLevelRef.current;

              const messages: Record<number, { msg: string; priority: "low" | "medium" | "high" }> = {
                1: { msg: "You might try asking an open-ended question to re-engage.", priority: "low" },
                2: { msg: "Consider pausing to check understanding — engagement has dropped.", priority: "medium" },
                3: { msg: "Engagement is significantly below baseline. Try changing the activity or taking a break.", priority: "high" },
              };

              const { msg, priority } = messages[level] || messages[1];
              const pendingNudge: CoachingNudge = { id: `nudge-${now}`, priority, category: "engagement", message: msg, timestamp: now };

              coachingNudge = pendingNudge.message;
              setNudges(prev => [...prev.slice(-9), pendingNudge]);
              setToastNudge(pendingNudge);
              onNudge?.(pendingNudge);
              setTimeout(() => {
                setToastNudge(prev => prev?.id === pendingNudge.id ? null : prev);
                onNudge?.(null);
              }, 8000);
              lastNudgeTimeRef.current = now;
              nudgeCountRef.current++;
              postNudgeEngRef.current = windowAvg.engagement;
            }
          }
        }
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
        expressions,
        attentionDrift,
        interruptionCount: interruptCountRef.current,
        energyLevel,
        facePosY: faceCenterY,
        gazeDirection,
        localSpeaking,
      });

      // Persist metrics to localStorage every 10s for summary page fallback
      const localPersistNow = Date.now();
      if (localPersistNow - lastLocalPersistRef.current > 10_000 && faceDetected) {
        lastLocalPersistRef.current = localPersistNow;
        snapshotCountRef.current++;
        const sessionStartedAt = parseInt(localStorage.getItem("livesesh_sessionStartedAt") || "0", 10);
        const durationMin = sessionStartedAt > 0 ? Math.max(1, Math.round((localPersistNow - sessionStartedAt) / 60000)) : 1;
        try {
          localStorage.setItem("livesesh_sessionMetrics", JSON.stringify({
            engagement: Math.round(engagement),
            eyeContact: Math.round(ecSmoothed),
            studentTalk: Math.round(spk),
            tutorTalk: Math.round(100 - spk),
            responsiveness: energyLevel,
            attentionDrift,
            interruptions: interruptCountRef.current,
            duration: durationMin,
            snapshotCount: snapshotCountRef.current,
            subject: "General",
          }));
        } catch { /* localStorage full */ }
      }

      // Persist metrics snapshot every 30s
      const persistNow = Date.now();
      if (persistNow - lastPersistRef.current > 30_000 && faceDetected) {
        lastPersistRef.current = persistNow;
        const sb = getSupabaseBrowserClient();

        const doSave = async () => {
          try {
            if (!sessionIdRef.current) {
              const { data: { user } } = await sb.auth.getUser();
              if (!user) return;
              const { data } = await sb.from("sessions").insert({
                tutor_id: user.id,
                subject: "General",
                student_level: "High School",
              }).select("id").single();
              if (data) {
                sessionIdRef.current = data.id;
                localStorage.setItem("livesesh_currentSessionId", data.id);
              }
            }
            if (sessionIdRef.current) {
              await sb.from("metrics_snapshots").insert({
                session_id: sessionIdRef.current,
                tutor_eye_contact: eyeContact,
                student_eye_contact: eyeContact,
                tutor_talk_pct: (100 - spk) / 100,
                student_talk_pct: spk / 100,
                tutor_energy: energyLevel / 100,
                student_energy: energyLevel / 100,
                interruption_count: 0,
                engagement_trend: engagement > 60 ? "rising" : engagement > 30 ? "stable" : "declining",
              });
            }
          } catch (err) {
            console.warn("[metrics] persist failed:", err);
          }
        };
        void doSave();
      }

      // Pass face position data to parent
      onFacePositionRef.current?.({
        faceDetected,
        boundingBox: faceBoundingBox,
        partiallyOutOfFrame,
        landmarks: rawLandmarks,
        blendshapes: blendshapeScores,
        headPose: { yaw, pitch },
        pose: poseDataRef.current,
      });
    }, 350);

    return () => clearInterval(interval);
  }, []);

  // ── Render ──────────────────────────────────────────────────

  // Build the fixed expression list — all 9 always visible
  const activeExprMap = new Map(metrics.expressions.map(e => [e.name, e]));

  const colorForValue = (v: number, invert = false) => {
    const good = invert ? v <= 30 : v >= 60;
    const ok = invert ? v <= 60 : v >= 30;
    return good ? "var(--success)" : ok ? "var(--warn)" : "var(--danger)";
  };

  const expressionCategoryColor = (cat: string) =>
    cat === "positive" ? "var(--success)" : cat === "concern" ? "var(--warn)" : "var(--muted)";

  // EMA rounded values for trends
  const trendEngagement = Math.round(emaEngagementRef.current);
  const trendEyeContact = Math.round(emaEyeContactRef.current);
  const trendEnergy = Math.round(emaEnergyRef.current);
  const trendDrift = Math.round(emaDriftRef.current);
  const trendSpeaking = Math.round(emaSpeakingRef.current);

  // New metric values
  const blinkRate = blinkRateRef.current;
  const headStability = headStabilityRef.current;
  const facialResponsiveness = facialResponsivenessRef.current;

  const blinkInterp = blinkRate >= 20 ? "High" : blinkRate >= 15 ? "Normal" : blinkRate > 0 ? "Low" : "--";
  const blinkColor = blinkRate === 0 ? "var(--text-muted)" : (blinkRate >= 15 && blinkRate <= 20) ? "var(--success)" : blinkRate > 20 ? "var(--warn)" : "var(--warn)";
  const headStabInterp = headStability >= 70 ? "Attentive" : headStability >= 40 ? "Moderate" : headStability > 0 ? "Restless" : "--";
  const headStabColor = headStability === 0 && !metrics.faceDetected ? "var(--text-muted)" : headStability >= 70 ? "var(--success)" : headStability >= 40 ? "var(--warn)" : "var(--danger)";
  const facialRespInterp = facialResponsiveness >= 10 ? "High" : facialResponsiveness >= 4 ? "Normal" : facialResponsiveness > 0 ? "Low" : "--";
  const facialRespColor = facialResponsiveness === 0 ? "var(--text-muted)" : facialResponsiveness >= 4 ? "var(--success)" : "var(--warn)";

  // Interpretation text
  const engInterp = trendEngagement >= 65 ? "Attentive and participating well"
    : trendEngagement >= 40 ? "Moderate — could use more interaction"
    : "Low — consider changing approach";

  const attentionInterp = trendDrift <= 25 ? "Low drift" : trendDrift <= 50 ? "Some drift" : "Distracted";
  const attentionCheck = trendDrift <= 30 ? "\u2713" : trendDrift <= 50 ? "~" : "\u2717";

  const energyInterp = trendEnergy >= 50 ? "Highly responsive"
    : trendEnergy >= 25 ? "Moderately responsive" : "Low responsiveness";

  const talkTutor = 100 - trendSpeaking;
  const talkInterp = talkTutor > 70 ? "Tutor talking too much"
    : talkTutor > 55 ? "Tutor slightly dominant" : "Good balance";

  const postureOk = metrics.facePosY < 0.6;

  // Posture check
  const postureFph = facePosHistRef.current;
  let postureInterp = "Normal";
  if (postureFph.length > 15) {
    const recentPos = postureFph.slice(-10);
    const earlyPos = postureFph.slice(0, 10);
    const recentAvg = recentPos.reduce((a: number, b: number) => a + b, 0) / recentPos.length;
    const earlyAvg = earlyPos.reduce((a: number, b: number) => a + b, 0) / earlyPos.length;
    if (recentAvg - earlyAvg > 0.08) postureInterp = "Slouching detected";
  }

  // Latest nudge for trends
  const latestNudge = nudges.length > 0 ? nudges[nudges.length - 1] : null;

  return (
    <section className={`sidebar-card analysis-card ${collapsed ? "analysis-collapsed" : ""}`}>
      {/* Header with collapse toggle */}
      <div className="analysis-header">
        <button className="analysis-collapse-btn" onClick={() => setCollapsed(c => !c)}>
          <span className={`collapse-chevron ${collapsed ? "collapsed" : ""}`}>&#9660;</span>
          <h3>Student Analysis</h3>
        </button>
        {onOverlayModeChange && !collapsed && (
          <select
            className="overlay-mode-select"
            value={overlayMode}
            onChange={(e) => onOverlayModeChange(e.target.value as OverlayMode)}
          >
            <option value="all">All overlays</option>
            <option value="expressions">Expressions</option>
            <option value="engagement">Engagement</option>
            <option value="none">No overlay</option>
          </select>
        )}
      </div>

      {/* Collapsed: show engagement summary */}
      {collapsed && status === "ready" && (
        <div className="collapsed-engagement">
          <span className="collapsed-eng-title">Engagement</span>
          <div className="collapsed-eng-bar">
            <div
              className="collapsed-eng-fill"
              style={{
                width: `${metrics.engagement}%`,
                background: colorForValue(metrics.engagement),
              }}
            />
          </div>
          <span className="collapsed-eng-label" style={{ color: colorForValue(metrics.engagement) }}>
            {metrics.engagement}%
          </span>
        </div>
      )}

      {!collapsed && (
        <>
          {status !== "ready" && (
            <p className="analysis-loading">{status}</p>
          )}

          {/* Face status */}
          <div className="analysis-status">
            <span className={`analysis-dot ${metrics.faceDetected ? "detected" : "missing"}`} />
            <span>{metrics.faceDetected ? "Face detected" : "No face detected"}</span>
          </div>

          {/* Tab switcher */}
          <div className="analysis-tabs">
            <button
              className={`analysis-tab ${activeTab === "live" ? "active" : ""}`}
              onClick={() => setActiveTab("live")}
            >
              Live
            </button>
            <button
              className={`analysis-tab ${activeTab === "trends" ? "active" : ""}`}
              onClick={() => setActiveTab("trends")}
            >
              Trends
            </button>
          </div>

          {/* ═══ LIVE TAB ═══ */}
          {activeTab === "live" && (
            <div className="tab-content">
              {/* Expressions — all 9 always visible */}
              <div className="live-section">
                <h4 className="live-section-title">Expressions</h4>
                <div className="expressions-grid">
                  {ALL_EXPRESSIONS.map(name => {
                    const active = activeExprMap.get(name);
                    return (
                      <div key={name} className={`expr-item ${active ? "expr-active" : "expr-inactive"}`}>
                        <span
                          className="expression-dot"
                          style={{ background: active ? expressionCategoryColor(active.category) : "var(--text-muted)" }}
                        />
                        <span className="expr-label">{name}</span>
                        <div className="expr-bar-track">
                          <div
                            className="expr-bar-fill"
                            style={{
                              width: active ? `${Math.round(active.confidence * 100)}%` : "0%",
                              background: active ? expressionCategoryColor(active.category) : "transparent",
                            }}
                          />
                        </div>
                        <span className="expr-value">
                          {active ? `${Math.round(active.confidence * 100)}%` : "\u2014"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gaze & Attention */}
              <div className="live-section">
                <h4 className="live-section-title">Gaze & Attention</h4>
                <div className="live-metrics">
                  <div className="live-metric-row">
                    <span>Eye contact</span>
                    <span className="live-metric-val" style={{ color: colorForValue(metrics.eyeContactSmoothed) }}>
                      {metrics.eyeContactSmoothed}%
                    </span>
                  </div>
                  <div className="live-metric-row">
                    <span>Gaze direction</span>
                    <span className="live-metric-val">{metrics.gazeDirection}</span>
                  </div>
                  <div className="live-metric-row">
                    <span>Head yaw / pitch</span>
                    <span className="live-metric-val">{metrics.headPose.yaw}&deg; / {metrics.headPose.pitch}&deg;</span>
                  </div>
                </div>
              </div>

              {/* Voice */}
              <div className="live-section">
                <h4 className="live-section-title">Voice</h4>
                <div className="live-metrics">
                  <div className="live-metric-row">
                    <span>Speaking now</span>
                    <span className="live-metric-val" style={{ color: metrics.isSpeaking ? "var(--success)" : "var(--muted)" }}>
                      {metrics.isSpeaking ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="live-metric-row">
                    <span>Talk ratio (student)</span>
                    <span className="live-metric-val">{metrics.speakingTime}%</span>
                  </div>
                  <div className="live-metric-row">
                    <span>Interruptions</span>
                    <span className="live-metric-val" style={{ color: metrics.interruptionCount > 3 ? "var(--warn)" : "var(--ink)" }}>
                      {metrics.interruptionCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Posture */}
              <div className="live-section">
                <h4 className="live-section-title">Posture</h4>
                <div className="live-metrics">
                  <div className="live-metric-row">
                    <span>Face position</span>
                    <span className="live-metric-val">{postureOk ? "\u2195 normal" : "\u2193 low"}</span>
                  </div>
                  {poseDataRef.current && (
                    <>
                      <div className="live-metric-row">
                        <span>Shoulders</span>
                        <span className="live-metric-val" style={{ color: poseDataRef.current.shoulderStatus === "level" ? "var(--success)" : "var(--warn)" }}>
                          {poseDataRef.current.shoulderStatus === "level" ? "\u2194 level" : "\u2921 tilted"}{" "}
                          ({Math.abs(Math.round(poseDataRef.current.shoulderTilt))}&deg;)
                        </span>
                      </div>
                      <div className="live-metric-row">
                        <span>Body posture</span>
                        <span className="live-metric-val" style={{ color: poseDataRef.current.bodyPosture === "upright" ? "var(--success)" : poseDataRef.current.bodyPosture === "slouching" ? "var(--warn)" : "var(--muted)" }}>
                          {poseDataRef.current.bodyPosture === "upright" ? "\u2191 upright" : poseDataRef.current.bodyPosture === "slouching" ? "\u2193 slouching" : "unknown"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ TRENDS TAB ═══ */}
          {activeTab === "trends" && (
            <div className="tab-content">
              {/* Engagement */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Engagement</span>
                  <span className="trend-value" style={{ color: colorForValue(trendEngagement) }}>
                    {trendEngagement}%
                  </span>
                </div>
                <div className="metric-track"><div className="metric-fill" style={{ width: `${trendEngagement}%`, background: colorForValue(trendEngagement) }} /></div>
                <span className="trend-interp">{engInterp}</span>
              </div>

              {/* Attention */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Attention</span>
                  <span className="trend-value" style={{ color: colorForValue(trendDrift, true) }}>
                    {attentionInterp} {attentionCheck}
                  </span>
                </div>
                <div className="trend-sub">Eye contact: {trendEyeContact}% (30s avg)</div>
                <div className="trend-sub">Head stability: {trendDrift <= 30 ? "Good" : trendDrift <= 50 ? "Fair" : "Poor"}</div>
                <div className="trend-sub">Face presence: {metrics.faceDetected ? "100%" : "0%"}</div>
              </div>

              {/* Responsiveness */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Responsiveness</span>
                  <span className="trend-value" style={{ color: colorForValue(trendEnergy) }}>
                    {trendEnergy}%
                  </span>
                </div>
                <div className="metric-track"><div className="metric-fill" style={{ width: `${trendEnergy}%`, background: colorForValue(trendEnergy) }} /></div>
                <span className="trend-interp">{energyInterp}</span>
              </div>

              {/* Blink Rate */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Blink Rate</span>
                  <span className="trend-value" style={{ color: blinkRate === 0 ? "var(--text-muted)" : blinkColor }}>
                    {blinkRate > 0 ? `${blinkRate} blinks/min` : "--"}
                  </span>
                </div>
                <span className="trend-interp" style={{ color: blinkRate === 0 ? "var(--text-muted)" : undefined }}>
                  {blinkInterp}{blinkRate > 0 ? " (normal: 15-20/min)" : ""}
                </span>
              </div>

              {/* Head Stability */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Head Stability</span>
                  <span className="trend-value" style={{ color: !metrics.faceDetected && headStability === 0 ? "var(--text-muted)" : headStabColor }}>
                    {metrics.faceDetected || headStability > 0 ? `${headStability}%` : "--"}
                  </span>
                </div>
                <div className="metric-track"><div className="metric-fill" style={{ width: metrics.faceDetected || headStability > 0 ? `${headStability}%` : "0%", background: headStabColor }} /></div>
                <span className="trend-interp" style={{ color: !metrics.faceDetected && headStability === 0 ? "var(--text-muted)" : undefined }}>
                  {metrics.faceDetected || headStability > 0 ? headStabInterp : "--"}
                </span>
              </div>

              {/* Facial Responsiveness */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Facial Responsiveness</span>
                  <span className="trend-value" style={{ color: facialResponsiveness === 0 ? "var(--text-muted)" : facialRespColor }}>
                    {facialResponsiveness > 0 ? `${facialResponsiveness} changes/min` : "--"}
                  </span>
                </div>
                <span className="trend-interp" style={{ color: facialResponsiveness === 0 ? "var(--text-muted)" : undefined }}>
                  {facialRespInterp}{facialResponsiveness > 0 ? " — more changes = more engaged" : ""}
                </span>
              </div>

              {/* Talk Balance */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Talk Balance</span>
                  <span className="trend-value">
                    {trendSpeaking}% / {talkTutor}%
                  </span>
                </div>
                <div className="talk-balance-bar">
                  <div className="talk-student" style={{ width: `${trendSpeaking}%` }} />
                  <div className="talk-tutor" style={{ width: `${talkTutor}%` }} />
                </div>
                <div className="talk-balance-labels">
                  <span>Student</span>
                  <span>Tutor</span>
                </div>
                <span className="trend-interp" style={{ color: talkTutor > 70 ? "var(--warn)" : "var(--muted)" }}>
                  {talkInterp}
                </span>
              </div>

              {/* Mood */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Mood</span>
                  <span className="trend-value" style={emaMoodRef.current === "Unknown" || emaMoodRef.current === "Neutral" ? { color: "var(--text-muted)" } : undefined}>
                    {emaMoodRef.current}
                  </span>
                </div>
                <div className="trend-sub" style={metrics.expressions.length === 0 ? { color: "var(--text-muted)" } : undefined}>
                  {metrics.expressions.length > 0
                    ? `${metrics.expressions.map(e => e.name).join(", ")} (dominant)`
                    : "--"}
                </div>
              </div>

              {/* Posture */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Posture</span>
                  <span className="trend-value" style={{ color: postureInterp === "Normal" ? "var(--success)" : "var(--warn)" }}>
                    {postureInterp}
                  </span>
                </div>
                {poseDataRef.current && (
                  <>
                    <div className="trend-sub">
                      Shoulders: {poseDataRef.current.shoulderStatus} ({Math.abs(Math.round(poseDataRef.current.shoulderTilt))}&deg; tilt)
                    </div>
                    <div className="trend-sub">
                      Body: {poseDataRef.current.bodyPosture} (slouch ratio: {poseDataRef.current.slouchRatio.toFixed(2)})
                    </div>
                  </>
                )}
              </div>

              {/* Latest coaching nudge — always visible */}
              <div className={`trend-nudge ${latestNudge ? `priority-${latestNudge.priority}` : "priority-none"}`} style={!latestNudge ? { opacity: 0.45 } : undefined}>
                <div className="trend-nudge-header">Coaching Nudge</div>
                <div className="trend-nudge-message" style={!latestNudge ? { color: "var(--text-muted)" } : undefined}>
                  {latestNudge ? latestNudge.message : "--"}
                </div>
                {latestNudge && (
                  <div className="trend-nudge-meta">
                    {new Date(latestNudge.timestamp).toLocaleTimeString()} &middot; {latestNudge.priority} priority
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Toast nudge rendered on video stage via onNudge callback */}
    </section>
  );
}

// ── Helpers ─────────────────────────────────────────────────────
function MetricBar({
  label,
  value,
  color,
  inverted,
}: {
  label: string;
  value: number;
  color: string;
  inverted?: boolean;
}) {
  return (
    <div className="metric-row">
      <div className="metric-header">
        <span className="metric-label">
          {label}
          {inverted && <span className="metric-hint"> (lower is better)</span>}
        </span>
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
