"use client";

import { Component, type ReactNode, useEffect, useRef, useState } from "react";

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
interface CoachingNudge {
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
}: {
  remoteStream: MediaStream | null;
  localStream?: MediaStream | null;
  onFacePosition?: (data: FacePositionData) => void;
  overlayMode?: OverlayMode;
  onOverlayModeChange?: (mode: OverlayMode) => void;
}) {
  return (
    <AnalysisErrorBoundary>
      <AnalysisPanelInner
        remoteStream={remoteStream}
        localStream={localStream ?? null}
        onFacePosition={onFacePosition}
        overlayMode={overlayMode ?? "all"}
        onOverlayModeChange={onOverlayModeChange}
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
}: {
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  onFacePosition?: (data: FacePositionData) => void;
  overlayMode: OverlayMode;
  onOverlayModeChange?: (mode: OverlayMode) => void;
}) {
  const [metrics, setMetrics] = useState<StudentMetrics>(INITIAL_METRICS);
  const [status, setStatus] = useState("Initializing…");
  const [activeTab, setActiveTab] = useState<"live" | "trends">("live");
  const [collapsed, setCollapsed] = useState(false);
  const [nudges, setNudges] = useState<CoachingNudge[]>([]);
  const [toastNudge, setToastNudge] = useState<CoachingNudge | null>(null);

  // EMA-smoothed values for Trends tab (alpha=0.1 for slow smoothing)
  const emaEngagementRef = useRef(50);
  const emaEyeContactRef = useRef(50);
  const emaEnergyRef = useRef(50);
  const emaDriftRef = useRef(0);
  const emaSpeakingRef = useRef(30);
  const emaMoodRef = useRef<string>("Neutral");

  // Coaching nudge system state
  const lastNudgeTimeRef = useRef(0);
  const nudgeCountRef = useRef(0);
  const lastNudgeCategoryRef = useRef<Record<string, number>>({});
  const sessionStartRef = useRef(Date.now());

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

            // Eye contact: in video calls, looking at the screen (slightly down/forward)
            // IS engaged behavior. Only flag as disengaged when looking away from screen
            // (significantly sideways, or upward away from monitor).
            const hDev =
              ((s.eyeLookInLeft ?? 0) +
                (s.eyeLookOutLeft ?? 0) +
                (s.eyeLookInRight ?? 0) +
                (s.eyeLookOutRight ?? 0)) /
              4;
            // Looking down is normal in video calls (screen is below camera).
            // Only penalize strongly for looking UP (away from screen) or extreme down.
            const lookUp = ((s.eyeLookUpLeft ?? 0) + (s.eyeLookUpRight ?? 0)) / 2;
            const lookDown = ((s.eyeLookDownLeft ?? 0) + (s.eyeLookDownRight ?? 0)) / 2;
            // Moderate downward gaze (<0.45) is screen-looking — tolerate it
            const vDev = Math.max(lookUp, Math.max(0, lookDown - 0.45));
            // Horizontal gaze is the primary disengagement signal
            eyeContact = Math.max(
              0,
              Math.min(1, 1 - (hDev * 2.5 + vDev * 1.5)),
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

      // Improved engagement: weighted combination of all signals
      const engagement = faceDetected
        ? Math.min(100, Math.round(
            ecSmoothed * 0.35 +           // eye contact (35%)
            Math.min(spk, 30) * 0.5 +     // speaking participation (15%)
            (100 - attentionDrift) * 0.2 + // attention stability (20%)
            energyLevel * 0.3              // energy/expressiveness (30%)
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

      // Structured coaching nudge system with cooldowns
      const now = Date.now();
      const timeSinceLastNudge = now - lastNudgeTimeRef.current;
      const canNudge = timeSinceLastNudge > 120_000 && nudgeCountRef.current < 5; // 2 min cooldown, max 5
      const canHighPriority = timeSinceLastNudge > 60_000 && nudgeCountRef.current < 5; // 1 min for high priority

      let coachingNudge: string | null = null;
      let pendingNudge: CoachingNudge | null = null;

      const categoryNotRecent = (cat: string) => {
        const last = lastNudgeCategoryRef.current[cat] || 0;
        return now - last > 300_000; // 5 min suppress per category
      };

      // HIGH priority — actionable pedagogical suggestions
      if (canHighPriority) {
        if (!faceDetected && lm && noFaceCountRef.current > 10 && categoryNotRecent("engagement")) {
          pendingNudge = { id: `nudge-${now}`, priority: "high", category: "engagement",
            message: "Try: \"Hey, are you still with me? Everything okay?\"", timestamp: now };
        } else if (engagement < 20 && eh.length > 10 && categoryNotRecent("engagement")) {
          pendingNudge = { id: `nudge-${now}`, priority: "high", category: "engagement",
            message: "Try: \"Let's pause — can you explain back to me what we just covered?\"", timestamp: now };
        }
      }

      // MEDIUM priority — practical teaching suggestions
      if (!pendingNudge && canNudge) {
        if (spk < 10 && sh.length > 20 && categoryNotRecent("talk_balance")) {
          pendingNudge = { id: `nudge-${now}`, priority: "medium", category: "talk_balance",
            message: "Try: \"What do you think the next step would be?\" — let them think aloud.", timestamp: now };
        } else if (expressions.some(e => e.name === "Yawning") && categoryNotRecent("engagement")) {
          pendingNudge = { id: `nudge-${now}`, priority: "medium", category: "engagement",
            message: "Try: \"Let's take a 2-minute break — stretch, get water, then we'll pick up.\"", timestamp: now };
        } else if (expressions.some(e => e.name === "Frowning" && e.interpretation === "Possibly confused") && categoryNotRecent("technique")) {
          pendingNudge = { id: `nudge-${now}`, priority: "medium", category: "technique",
            message: "Try: \"What part is tricky? Walk me through where you got stuck.\"", timestamp: now };
        } else if (expressions.some(e => e.name === "Frustrated") && categoryNotRecent("technique")) {
          pendingNudge = { id: `nudge-${now}`, priority: "medium", category: "technique",
            message: "Try: \"This is a tough one — let's break it into smaller pieces together.\"", timestamp: now };
        } else if (ecSmoothed < 25 && eh.length > 10 && categoryNotRecent("attention")) {
          pendingNudge = { id: `nudge-${now}`, priority: "medium", category: "attention",
            message: "Try: \"What are you thinking about right now?\" — check in gently.", timestamp: now };
        }
      }

      // LOW priority — positive reinforcement (important for tutor morale)
      if (!pendingNudge && canNudge && now - sessionStartRef.current > 180_000) {
        if (engagement > 65 && categoryNotRecent("positive")) {
          pendingNudge = { id: `nudge-${now}`, priority: "low", category: "positive",
            message: "Student is engaged and following along — nice work!", timestamp: now };
        }
      }

      if (pendingNudge) {
        coachingNudge = pendingNudge.message;
        lastNudgeTimeRef.current = now;
        nudgeCountRef.current++;
        lastNudgeCategoryRef.current[pendingNudge.category] = now;
        setNudges(prev => [...prev.slice(-9), pendingNudge!]);
        setToastNudge(pendingNudge);
        setTimeout(() => setToastNudge(prev => prev?.id === pendingNudge!.id ? null : prev), 5000);
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

  // Interpretation text
  const engInterp = trendEngagement >= 65 ? "Attentive and participating well"
    : trendEngagement >= 40 ? "Moderate — could use more interaction"
    : "Low — consider changing approach";

  const attentionInterp = trendDrift <= 25 ? "Low drift" : trendDrift <= 50 ? "Some drift" : "Distracted";
  const attentionCheck = trendDrift <= 30 ? "\u2713" : trendDrift <= 50 ? "~" : "\u2717";

  const energyInterp = trendEnergy >= 50 ? "Active and expressive"
    : trendEnergy >= 25 ? "Moderate activity" : "Very quiet or still";

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

      {/* Collapsed: show engagement spectrum bar */}
      {collapsed && status === "ready" && (
        <div className="collapsed-engagement">
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

              {/* Energy */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Energy</span>
                  <span className="trend-value" style={{ color: colorForValue(trendEnergy) }}>
                    {trendEnergy}%
                  </span>
                </div>
                <div className="metric-track"><div className="metric-fill" style={{ width: `${trendEnergy}%`, background: colorForValue(trendEnergy) }} /></div>
                <span className="trend-interp">{energyInterp}</span>
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
                  <span className="trend-value">{emaMoodRef.current}</span>
                </div>
                {metrics.expressions.length > 0 && (
                  <div className="trend-sub">
                    {metrics.expressions.map(e => e.name).join(", ")} (dominant)
                  </div>
                )}
              </div>

              {/* Posture */}
              <div className="trend-block">
                <div className="trend-header">
                  <span className="trend-label">Posture</span>
                  <span className="trend-value" style={{ color: postureInterp === "Normal" ? "var(--success)" : "var(--warn)" }}>
                    {postureInterp}
                  </span>
                </div>
              </div>

              {/* Latest coaching nudge */}
              {latestNudge && (
                <div className={`trend-nudge priority-${latestNudge.priority}`}>
                  <div className="trend-nudge-header">Coaching Nudge</div>
                  <div className="trend-nudge-message">{latestNudge.message}</div>
                  <div className="trend-nudge-meta">
                    {new Date(latestNudge.timestamp).toLocaleTimeString()} &middot; {latestNudge.priority} priority
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Toast nudge — slides in from bottom */}
      {toastNudge && (
        <div className={`nudge-toast priority-${toastNudge.priority}`}>
          <span className="nudge-toast-msg">{toastNudge.message}</span>
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
