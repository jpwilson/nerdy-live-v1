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
  // New metrics
  expressions: FacialExpression[];
  attentionDrift: number; // 0-100, higher = more drifting
  interruptionCount: number;
  energyLevel: number; // 0-100
  facePosY: number; // normalized face Y position (for posture tracking)
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
  expressions: [],
  attentionDrift: 0,
  interruptionCount: 0,
  energyLevel: 50,
  facePosY: 0.5,
};

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

      // Richer coaching nudges with priority
      let coachingNudge: string | null = null;
      if (!faceDetected && lm) {
        coachingNudge = noFaceCountRef.current > 10
          ? "Student has been off-camera for a while — check if they're still there."
          : "No face detected — student may have stepped away.";
      } else if (attentionDrift > 70 && eh.length > 10) {
        coachingNudge = "High attention drift — try engaging with a direct question or activity change.";
      } else if (ecSmoothed < 25 && eh.length > 10) {
        coachingNudge = "Very low eye contact — student may be distracted. Try calling their name.";
      } else if (ecSmoothed < 40 && eh.length > 10) {
        coachingNudge = "Low eye contact — try asking what they're looking at or if they need help.";
      } else if (expressions.some(e => e.name === "Yawning")) {
        coachingNudge = "Student appears tired — consider a short break or activity change.";
      } else if (expressions.some(e => e.name === "Frowning" && e.interpretation === "Possibly confused")) {
        coachingNudge = "Student looks confused — try rephrasing or asking what's unclear.";
      } else if (spk < 10 && sh.length > 20) {
        coachingNudge = "Student hasn't spoken much — try asking an open-ended question.";
      } else if (interruptCountRef.current > 3) {
        coachingNudge = `${interruptCountRef.current} speaking overlaps detected — try pausing more before responding.`;
      } else if (fph.length > 15) {
        const recentPos = fph.slice(-10);
        const earlyPos = fph.slice(0, 10);
        const recentAvg = recentPos.reduce((a, b) => a + b, 0) / recentPos.length;
        const earlyAvg = earlyPos.reduce((a, b) => a + b, 0) / earlyPos.length;
        if (recentAvg - earlyAvg > 0.08) {
          coachingNudge = "Student appears to be slouching — posture has shifted downward.";
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

  const driftColor =
    metrics.attentionDrift <= 30
      ? "var(--success)"
      : metrics.attentionDrift <= 60
        ? "var(--warn)"
        : "var(--danger)";

  const energyColor =
    metrics.energyLevel >= 50
      ? "var(--success)"
      : metrics.energyLevel >= 25
        ? "var(--warn)"
        : "var(--danger)";

  const expressionCategoryColor = (cat: string) =>
    cat === "positive" ? "var(--success)" : cat === "concern" ? "var(--warn)" : "var(--muted)";

  return (
    <section className="sidebar-card analysis-card">
      <div className="analysis-header">
        <h3>Student Analysis</h3>
        {onOverlayModeChange && (
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

      {/* Core Engagement Metrics */}
      <div className="metrics-grid">
        <MetricBar
          label="Engagement"
          value={metrics.engagement}
          color={engColor}
        />
        <MetricBar
          label="Eye Contact"
          value={metrics.eyeContactSmoothed}
          color={ecColor}
        />
        <MetricBar
          label="Attention Drift"
          value={metrics.attentionDrift}
          color={driftColor}
          inverted
        />
        <MetricBar
          label="Energy Level"
          value={metrics.energyLevel}
          color={energyColor}
        />
        <MetricBar
          label="Speaking Time"
          value={metrics.speakingTime}
          color="var(--blue)"
        />
      </div>

      {/* Detail rows */}
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
          <span>Interruptions</span>
          <strong style={{ color: metrics.interruptionCount > 3 ? "var(--warn)" : "var(--ink)" }}>
            {metrics.interruptionCount}
          </strong>
        </div>
        <div className="metric-detail-row">
          <span>Head yaw / pitch</span>
          <strong>{metrics.headPose.yaw}° / {metrics.headPose.pitch}°</strong>
        </div>
      </div>

      {/* Facial Expressions */}
      {metrics.expressions.length > 0 && (
        <div className="expressions-section">
          <h4 className="expressions-title">Expressions</h4>
          <div className="expressions-list">
            {metrics.expressions.map((expr) => (
              <div key={expr.name} className="expression-row">
                <div className="expression-name">
                  <span
                    className="expression-dot"
                    style={{ background: expressionCategoryColor(expr.category) }}
                  />
                  <span>{expr.name}</span>
                </div>
                <span className="expression-interp">{expr.interpretation}</span>
                <div className="expression-bar-track">
                  <div
                    className="expression-bar-fill"
                    style={{
                      width: `${Math.round(expr.confidence * 100)}%`,
                      background: expressionCategoryColor(expr.category),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coaching Nudge */}
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
