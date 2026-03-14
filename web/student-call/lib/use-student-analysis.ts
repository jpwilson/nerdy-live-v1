"use client";

import { useEffect, useRef, useState } from "react";

export interface StudentMetrics {
  faceDetected: boolean;
  eyeContact: number;          // 0–100 instant
  eyeContactSmoothed: number;  // 0–100 rolling avg
  isSpeaking: boolean;
  speakingTime: number;        // 0–100 rolling %
  engagement: number;          // 0–100 composite
  headPose: { yaw: number; pitch: number };
  coachingNudge: string | null;
}

const INITIAL: StudentMetrics = {
  faceDetected: false,
  eyeContact: 0,
  eyeContactSmoothed: 0,
  isSpeaking: false,
  speakingTime: 0,
  engagement: 0,
  headPose: { yaw: 0, pitch: 0 },
  coachingNudge: null,
};

const ANALYSIS_INTERVAL_MS = 350; // ~3 FPS

/**
 * Runs MediaPipe face analysis + Web Audio speaking detection
 * on the remote student video/audio stream.
 * Only active when `enabled` is true (tutor role).
 */
export function useStudentAnalysis(
  remoteStream: MediaStream | null,
  enabled: boolean,
) {
  const [metrics, setMetrics] = useState<StudentMetrics>(INITIAL);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Refs for long-lived objects
  const landmarkerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eyeHistRef = useRef<number[]>([]);
  const speakHistRef = useRef<boolean[]>([]);

  // ── 1. Load MediaPipe FaceLandmarker ──────────────────────────
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setModelLoading(true);
      try {
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
          setModelReady(true);
        }
      } catch (err) {
        console.error("[analysis] FaceLandmarker init failed:", err);
        if (!cancelled) setModelError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setModelLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setModelReady(false);
    };
  }, [enabled]);

  // ── 2. Create hidden <video> + AudioContext for remote stream ─
  useEffect(() => {
    if (!enabled || !remoteStream) return;

    // Hidden video element for MediaPipe to read frames from
    const video = document.createElement("video");
    Object.assign(video.style, {
      position: "fixed",
      opacity: "0",
      pointerEvents: "none",
      width: "320px",
      height: "240px",
      top: "-9999px",
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
  }, [enabled, remoteStream]);

  // ── 3. Analysis loop ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !modelReady) return;

    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) return;

      try {
        const result = lm.detectForVideo(video, performance.now());

        let faceDetected = false;
        let eyeContact = 0;
        let yaw = 0;
        let pitch = 0;

        if (result.faceBlendshapes?.length > 0) {
          faceDetected = true;
          const cats = result.faceBlendshapes[0].categories;
          const s = Object.fromEntries(
            cats.map((c: any) => [c.categoryName, c.score]),
          );

          // Eye gaze deviation → eye contact
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
          eyeContact = Math.max(0, Math.min(1, 1 - Math.max(hDev, vDev) * 3));

          // Head pose from landmarks
          if (result.faceLandmarks?.length > 0) {
            const lmks = result.faceLandmarks[0];
            const nose = lmks[1];
            const lc = lmks[234];
            const rc = lmks[454];
            yaw = (nose.x - (lc.x + rc.x) / 2) * 180;
            const le = lmks[33];
            const re = lmks[263];
            pitch = (nose.y - (le.y + re.y) / 2) * 180;
          }
        }

        // Speaking detection
        let isSpeaking = false;
        if (analyserRef.current) {
          const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(buf);
          const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
          isSpeaking = avg > 18;
        }

        // Rolling histories (keep ~10 s at 3 FPS)
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
          ? Math.min(
              100,
              ecSmoothed * 0.5 + 30 + Math.min(spk, 20),
            )
          : 0;

        let coachingNudge: string | null = null;
        if (!faceDetected) {
          coachingNudge = "No face detected — student may have stepped away.";
        } else if (ecSmoothed < 30) {
          coachingNudge = "Low eye contact — student may be distracted.";
        } else if (spk < 10 && sh.length > 20) {
          coachingNudge =
            "Student hasn't spoken much — try asking a question.";
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
      } catch {
        /* frame timing errors are expected */
      }
    }, ANALYSIS_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, modelReady]);

  return { metrics, modelLoading, modelReady, modelError };
}
