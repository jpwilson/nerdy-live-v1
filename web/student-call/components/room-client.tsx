"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { RoomRole } from "@/lib/call-types";
import {
  buildStudentShareUrl,
  connectionLabel,
  defaultDisplayName,
  formatJoinedAt,
  parseRole,
  roleLabel,
} from "@/lib/room-utils";
import { useLiveKitRoom } from "@/lib/use-livekit-room";
import { useTranscript } from "@/lib/use-transcript";
import { StudentAnalysisCard, type CoachingNudge, type FacePositionData, type OverlayMode } from "@/components/analysis-panel";
import {
  FACEMESH_TESSELATION,
  FACE_OVAL,
  LEFT_EYE,
  RIGHT_EYE,
  LEFT_EYEBROW,
  RIGHT_EYEBROW,
  LIPS_OUTER,
  LIPS_INNER,
  NOSE_BRIDGE,
} from "@/lib/face-mesh-data";

/** Derive the dominant expression from blendshapes */
function getDominantExpression(bs: Record<string, number>): { label: string; confidence: number } | null {
  // Combine multiple blendshapes for more robust detection
  const smile = Math.max(bs.mouthSmileLeft ?? 0, bs.mouthSmileRight ?? 0);
  const frown = Math.max(
    Math.max(bs.mouthFrownLeft ?? 0, bs.mouthFrownRight ?? 0),
    Math.max(bs.browDownLeft ?? 0, bs.browDownRight ?? 0)
  );
  const surprised = Math.max(bs.browInnerUp ?? 0, (bs.jawOpen ?? 0) > 0.4 ? (bs.browInnerUp ?? 0) + 0.1 : 0);
  const squinting = Math.max(bs.eyeSquintLeft ?? 0, bs.eyeSquintRight ?? 0);

  const expressions: Array<{ label: string; value: number }> = [
    { label: "Smiling", value: smile },
    { label: "Frowning", value: frown },
    { label: "Surprised", value: surprised },
    { label: "Speaking", value: (bs.jawOpen ?? 0) > 0.3 ? bs.jawOpen ?? 0 : 0 },
    { label: "Thinking", value: bs.mouthPucker ?? 0 },
    { label: "Squinting", value: squinting },
    { label: "Focused", value: (bs.browDownLeft ?? 0) > 0.2 && squinting > 0.15
      ? ((bs.browDownLeft ?? 0) + squinting) / 2 : 0 },
  ];

  let best: { label: string; confidence: number } | null = null;
  for (const { label, value } of expressions) {
    if (value > 0.15 && (!best || value > best.confidence)) {
      best = { label, confidence: value };
    }
  }
  return best;
}

/** Draw a rounded-rect pill with text */
function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  bgColor: string,
  textColor: string,
  align: "left" | "right" = "left",
) {
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(text);
  const padX = 10;
  const padY = 6;
  const pillW = metrics.width + padX * 2;
  const pillH = fontSize + padY * 2;
  const drawX = align === "right" ? x - pillW : x;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(drawX, y, pillW, pillH, 6);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, drawX + padX, y + pillH / 2);
}

// Track blink flash state outside the function so it persists across frames
let _blinkFlashUntil = 0;

function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  landmarks: Array<{ x: number; y: number; z: number }>,
  blendshapes: Record<string, number> | null,
  headPose: { yaw: number; pitch: number },
  overlayMode: OverlayMode,
  engagementLevel: "high" | "medium" | "low" | null,
) {
  ctx.clearRect(0, 0, w, h);
  if (overlayMode === "none") return;

  const lm = landmarks;
  const toX = (i: number) => lm[i].x * w;
  const toY = (i: number) => lm[i].y * h;
  const showMesh = overlayMode === "all";
  const showExpressions = overlayMode === "all" || overlayMode === "expressions";
  const showEngagement = overlayMode === "all" || overlayMode === "engagement";

  // ── Face mesh wireframe + dots (only in "all" mode) ──
  if (showMesh) {
    ctx.strokeStyle = "rgba(0, 212, 170, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a, b] of FACEMESH_TESSELATION) {
      if (a < lm.length && b < lm.length) {
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
      }
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 212, 170, 0.35)";
    for (let i = 0; i < Math.min(lm.length, 468); i++) {
      ctx.beginPath();
      ctx.arc(lm[i].x * w, lm[i].y * h, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawPath = (indices: number[], color: string, lineWidth: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(toX(indices[0]), toY(indices[0]));
      for (let i = 1; i < indices.length; i++) {
        ctx.lineTo(toX(indices[i]), toY(indices[i]));
      }
      ctx.stroke();
    };

    drawPath(FACE_OVAL, "rgba(0, 212, 170, 0.6)", 1.7);
    drawPath(LEFT_EYE, "rgba(0, 212, 170, 0.8)", 1.8);
    drawPath(RIGHT_EYE, "rgba(0, 212, 170, 0.8)", 1.8);
    drawPath(LEFT_EYEBROW, "rgba(0, 212, 170, 0.55)", 1.5);
    drawPath(RIGHT_EYEBROW, "rgba(0, 212, 170, 0.55)", 1.5);
    drawPath(LIPS_OUTER, "rgba(0, 212, 170, 0.65)", 1.7);
    drawPath(LIPS_INNER, "rgba(0, 212, 170, 0.55)", 1.5);
    drawPath(NOSE_BRIDGE, "rgba(0, 212, 170, 0.5)", 1.3);
  }

  // ── Iris centers + gaze arrows (all + engagement) ──
  if ((showMesh || showEngagement) && lm.length > 473) {
    ctx.fillStyle = "rgba(0, 212, 170, 1)";
    for (const idx of [468, 473]) {
      ctx.beginPath();
      ctx.arc(toX(idx), toY(idx), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (blendshapes) {
      const gazeX = -(blendshapes.eyeLookInLeft ?? 0) + (blendshapes.eyeLookOutLeft ?? 0);
      const gazeY = -(blendshapes.eyeLookUpLeft ?? 0) + (blendshapes.eyeLookDownLeft ?? 0);
      const arrowLen = 30;
      ctx.strokeStyle = "rgba(0, 212, 170, 0.95)";
      ctx.lineWidth = 2;
      for (const irisIdx of [468, 473]) {
        const ix = toX(irisIdx), iy = toY(irisIdx);
        const dx = gazeX * arrowLen, dy = gazeY * arrowLen;
        const ex = ix + dx, ey = iy + dy;
        ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ex, ey); ctx.stroke();
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(ex, ey); ctx.lineTo(ex - 7 * Math.cos(angle - 0.5), ey - 7 * Math.sin(angle - 0.5));
        ctx.moveTo(ex, ey); ctx.lineTo(ex - 7 * Math.cos(angle + 0.5), ey - 7 * Math.sin(angle + 0.5));
        ctx.stroke();
      }
    }
  }

  // ── Engagement labels (all + engagement modes) ──
  if (showEngagement) {
    // Top-right: engagement level
    if (engagementLevel) {
      const cfg = { high: { color: "#22c55e", label: "High" }, medium: { color: "#eab308", label: "Medium" }, low: { color: "#ef4444", label: "Low" } } as const;
      const c = cfg[engagementLevel];
      drawPill(ctx, w - 12, 12, `${c.label} \u25CF`, 13, "rgba(0,0,0,0.6)", c.color, "right");
    }

    // Head yaw/pitch — above forehead
    if (lm.length > 10) {
      const foreheadX = toX(10), foreheadY = toY(10) - 24;
      const yawDeg = Math.round(headPose.yaw), pitchDeg = Math.round(headPose.pitch);
      const tiltLabel = Math.abs(yawDeg) > 15 ? " (tilted)" : "";
      const poseText = `Yaw: ${yawDeg}\u00B0  Pitch: ${pitchDeg}\u00B0${tiltLabel}`;
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const tw = ctx.measureText(poseText).width;
      const px = Math.max(4, Math.min(w - tw - 12, foreheadX - tw / 2));
      const py = Math.max(40, foreheadY);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath(); ctx.roundRect(px - 6, py - 10, tw + 12, 18, 4); ctx.fill();
      ctx.fillStyle = "rgba(0, 212, 170, 0.9)";
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillText(poseText, px, py - 1);
    }

    // Posture indicator — bottom-left
    if (lm.length > 152) {
      const chinY = lm[152].y, foreheadY = lm[10].y;
      const isSlouching = chinY > 0.75 || foreheadY > 0.35;
      const posture = isSlouching ? "Slouching \u2193" : "Upright \u2191";
      const postureColor = isSlouching ? "#ef4444" : "#22c55e";
      drawPill(ctx, 12, h - 30, `Posture: ${posture}`, 11, "rgba(0,0,0,0.5)", postureColor, "left");
    }

    // Blink indicator — between eyes
    if (blendshapes && lm.length > 159) {
      const blinkL = blendshapes.eyeBlinkLeft ?? 0, blinkR = blendshapes.eyeBlinkRight ?? 0;
      const now = Date.now();
      if (blinkL > 0.5 || blinkR > 0.5) _blinkFlashUntil = now + 400;
      if (now < _blinkFlashUntil) {
        const midX = (toX(159) + toX(386)) / 2, midY = (toY(159) + toY(386)) / 2;
        drawPill(ctx, midX - 22, midY - 10, "BLINK", 11, "rgba(200,40,40,0.75)", "#fff", "left");
      }
    }
  }

  // ── Expression labels (all + expressions modes) ──
  if (showExpressions) {
    // Dominant expression — below chin
    if (blendshapes && lm.length > 152) {
      const expr = getDominantExpression(blendshapes);
      if (expr) {
        const pct = Math.round(expr.confidence * 100);
        const chinX = toX(152), chinY = toY(152) + 16;
        const text = `${expr.label} ${pct}%`;
        ctx.font = "600 13px -apple-system, BlinkMacSystemFont, sans-serif";
        const tw = ctx.measureText(text).width;
        const px = Math.max(4, Math.min(w - tw - 16, chinX - tw / 2));
        const py = Math.min(h - 24, chinY);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath(); ctx.roundRect(px - 8, py - 10, tw + 16, 22, 6); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.fillText(text, px, py);
      }
    }

  }
}

function VideoSurface({
  title,
  stream,
  emptyTitle,
  emptyCopy,
  muted = false,
  mirrored = false,
  videoStyle,
  videoRef: externalVideoRef,
  showLabel = false,
}: {
  title: string;
  stream: MediaStream | null;
  emptyTitle: string;
  emptyCopy: string;
  muted?: boolean;
  mirrored?: boolean;
  videoStyle?: React.CSSProperties;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  showLabel?: boolean;
}) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = externalVideoRef || internalRef;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  return (
    <>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted={muted}
          playsInline
          className={mirrored ? "mirrored" : undefined}
          style={videoStyle}
        />
      ) : (
        <div className="video-placeholder waiting-screen">
          <div className="waiting-brands">
            <img src="/nerdy-logo.png" alt="Nerdy" className="waiting-logo waiting-logo-nerdy pulse-slow" />
            <span className="waiting-x">×</span>
            <img src="/liveai-logo.png" alt="Live+AI" className="waiting-logo waiting-logo-liveai pulse-slow pulse-delay" />
          </div>
          <div className="waiting-text">
            <h3>{emptyTitle}</h3>
            <p>{emptyCopy}</p>
          </div>
        </div>
      )}
      {showLabel && <div className="video-label">{title}</div>}
    </>
  );
}

export function RoomClientPage({ roomId }: { roomId: string }) {
  const searchParams = useSearchParams();
  const role = parseRole(searchParams.get("role"));
  const displayName =
    searchParams.get("name")?.trim() || defaultDisplayName(role);

  return <RoomClient roomId={roomId} role={role} displayName={displayName} />;
}

function RoomClient({
  roomId,
  role,
  displayName,
}: {
  roomId: string;
  role: RoomRole;
  displayName: string;
}) {
  const router = useRouter();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("all");
  const [facePosition, setFacePosition] = useState<FacePositionData | null>(null);
  const [activeNudge, setActiveNudge] = useState<CoachingNudge | null>(null);
  const [nudgePos, setNudgePos] = useState<{ x: number; y: number } | null>(null);
  const nudgeDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const {
    connectionState,
    error,
    extraPeerCount,
    hangUp,
    isCameraEnabled,
    isMicrophoneEnabled,
    localPeerId,
    localStream,
    participants,
    remoteStream,
    roomTopic,
    toggleCamera,
    toggleMicrophone,
  } = useLiveKitRoom({
    roomId,
    displayName,
    role,
  });

  const { transcript, isListening, detectedSubject, startListening, stopListening, getSessionData } = useTranscript();

  const isTutor = role === "tutor_preview";
  const [isVideoRecording, setIsVideoRecording] = useState(true);

  const sharePath = useMemo(() => buildStudentShareUrl(roomId), [roomId]);

  const remoteTitle =
    role === "student" ? "Tutor feed" : "Student feed";
  const emptyTitle =
    role === "student" ? "Waiting for the tutor" : "Waiting for the student";
  const emptyCopy =
    role === "student"
      ? "Connected and ready. Once the tutor joins this room, video appears here."
      : "Use a second browser in Student mode, or the iOS app to join this room.";

  const copyShareLink = async () => {
    try {
      const url = new URL(window.location.origin);
      url.pathname = sharePath;
      await navigator.clipboard.writeText(url.toString());
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  // Track session start time
  useEffect(() => {
    if (connectionState === "connected" || connectionState === "waiting_for_peer") {
      if (!localStorage.getItem("livesesh_sessionStartedAt")) {
        localStorage.setItem("livesesh_sessionStartedAt", String(Date.now()));
      }
      startListening();
    }
    return () => { stopListening(); };
  }, [connectionState, startListening, stopListening]);

  // Track whether a student/remote peer ever joined
  useEffect(() => {
    if (remoteStream) {
      localStorage.setItem("livesesh_studentJoined", "true");
    }
  }, [remoteStream]);

  // Face position callback (stable ref via useCallback)
  const handleFacePosition = useCallback((data: FacePositionData) => {
    setFacePosition(data);
  }, []);

  // Dynamic face centering via object-position
  // Maps the face bounding box center to object-position so the face stays centered.
  // Uses gentle smoothing to avoid jitter.
  const smoothedFacePos = useRef({ x: 50, y: 30 });
  const videoTransformStyle = useMemo((): React.CSSProperties => {
    if (!isTutor || !facePosition?.faceDetected || !facePosition.boundingBox) {
      return { objectPosition: `${smoothedFacePos.current.x}% ${smoothedFacePos.current.y}%` };
    }

    const bb = facePosition.boundingBox;
    // Face center in normalized coords [0..1]
    const faceCX = bb.x + bb.width / 2;
    const faceCY = bb.y + bb.height / 2;

    // Convert to percentage for object-position
    // object-position maps: 0% = face at left edge, 100% = face at right edge
    const targetX = faceCX * 100;
    const targetY = faceCY * 100;

    // Smooth towards target (exponential moving average)
    const alpha = 0.15;
    smoothedFacePos.current.x += (targetX - smoothedFacePos.current.x) * alpha;
    smoothedFacePos.current.y += (targetY - smoothedFacePos.current.y) * alpha;

    // Clamp to reasonable range to avoid extreme positions
    const x = Math.max(20, Math.min(80, smoothedFacePos.current.x));
    const y = Math.max(15, Math.min(65, smoothedFacePos.current.y));

    return { objectPosition: `${x}% ${y}%` };
  }, [isTutor, facePosition]);

  // Determine engagement level for overlay
  const engagementLevel = useMemo(() => {
    if (!isTutor || !remoteStream || !facePosition?.faceDetected) return null;
    // We don't have direct access to engagement score here, so derive from face data
    if (!facePosition.blendshapes) return null;
    const bs = facePosition.blendshapes;
    const hDev = ((bs.eyeLookInLeft ?? 0) + (bs.eyeLookOutLeft ?? 0) + (bs.eyeLookInRight ?? 0) + (bs.eyeLookOutRight ?? 0)) / 4;
    const ec = Math.max(0, Math.min(1, 1 - Math.max(hDev) * 3)) * 100;
    if (ec >= 60) return "high";
    if (ec >= 30) return "medium";
    return "low";
  }, [isTutor, remoteStream, facePosition]);

  // Draw face mesh overlay on canvas, mapping landmarks from the hidden
  // analysis video's coordinate space to the displayed video's object-fit:cover space.
  useEffect(() => {
    const canvas = canvasRef.current;
    const videoFrame = videoFrameRef.current;
    const remoteVideo = remoteVideoRef.current;
    if (!canvas || !videoFrame) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const showMesh = overlayMode === "all" || overlayMode === "expressions";
    if (
      !showMesh ||
      !facePosition?.faceDetected ||
      !facePosition.landmarks
    ) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Match canvas size to the video frame element
    const rect = videoFrame.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // Compute object-fit:cover mapping.
    // Landmarks are in normalized [0,1] coords relative to the video's intrinsic dimensions
    // (the hidden analysis video uses default object-fit:fill, so [0,1] maps to the full
    // intrinsic content). The displayed video uses object-fit:cover with object-position:center 30%.
    const videoW = remoteVideo?.videoWidth || 1;
    const videoH = remoteVideo?.videoHeight || 1;
    const containerW = rect.width;
    const containerH = rect.height;
    const videoAR = videoW / videoH;
    const containerAR = containerW / containerH;

    let scaledW: number, scaledH: number, offsetX: number, offsetY: number;

    // Get the current object-position percentages for coordinate mapping
    const objPosX = smoothedFacePos.current.x / 100;
    const objPosY = smoothedFacePos.current.y / 100;

    if (videoAR > containerAR) {
      // Video is wider than container — cropped horizontally
      scaledH = containerH;
      scaledW = containerH * videoAR;
      offsetX = (scaledW - containerW) * objPosX;
      offsetY = (scaledH - containerH) * objPosY;
    } else {
      // Video is taller than container — cropped vertically
      scaledW = containerW;
      scaledH = containerW / videoAR;
      offsetX = (scaledW - containerW) * objPosX;
      offsetY = (scaledH - containerH) * objPosY;
    }

    // Transform landmarks from normalized [0,1] to canvas pixel coords
    const transformedLandmarks = facePosition.landmarks.map((lm) => ({
      x: (lm.x * scaledW - offsetX) / containerW,
      y: (lm.y * scaledH - offsetY) / containerH,
      z: lm.z,
    }));

    drawFaceMesh(
      ctx,
      canvas.width,
      canvas.height,
      transformedLandmarks,
      facePosition.blendshapes,
      facePosition.headPose,
      overlayMode,
      engagementLevel,
    );
  }, [overlayMode, facePosition, engagementLevel]);

  // Resize canvas when window resizes
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const videoFrame = videoFrameRef.current;
      if (!canvas || !videoFrame) return;
      const rect = videoFrame.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Determine face warning badge
  const faceBadge = useMemo(() => {
    if (!isTutor || !remoteStream) return null;
    if (!facePosition || !facePosition.faceDetected) {
      return { text: "Student out of frame", level: "danger" as const };
    }
    if (facePosition.partiallyOutOfFrame) {
      return { text: "Student partially out of frame", level: "warn" as const };
    }
    return null;
  }, [isTutor, remoteStream, facePosition]);

  return (
    <main className="shell room-layout">
      <header className="toolbar">
        <div className="toolbar-group">
          <Link className="toolbar-button" href="/">
            Back
          </Link>
          <div className="toolbar-title">
            <p className="eyebrow">Live Room</p>
            <h1>{roomId}</h1>
          </div>
        </div>

        <div className="toolbar-group">
          {detectedSubject !== "General" && (
            <span className="detected-subject">{detectedSubject}</span>
          )}
          {isListening && (
            <button
              className={`recording-indicator ${isVideoRecording ? "" : "recording-off"}`}
              type="button"
              onClick={() => setIsVideoRecording(v => !v)}
              title={isVideoRecording ? "Click to stop video recording (metrics still collected)" : "Click to start video recording"}
            >
              <span className="recording-dot" />
              {isVideoRecording ? "Recording" : "Metrics only"}
            </button>
          )}
          <span className={`status-chip ${connectionState}`}>
            {connectionLabel(connectionState)}
          </span>
          <span className="role-chip">{roleLabel(role)}</span>
          <button className="toolbar-button" type="button" onClick={copyShareLink}>
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy student link"}
          </button>
        </div>
      </header>

      <section className="content-grid">
        <article className="stage">
          <div
            className={`video-frame${
              isTutor && (overlayMode === "engagement" || overlayMode === "all") && engagementLevel
                ? ` engagement-${engagementLevel}`
                : ""
            }`}
            ref={videoFrameRef}
          >
            <VideoSurface
              title={remoteTitle}
              stream={remoteStream}
              emptyTitle={emptyTitle}
              emptyCopy={emptyCopy}
              videoRef={remoteVideoRef}
              videoStyle={isTutor ? videoTransformStyle : undefined}
            />

            {isTutor && connectionState === "connected" && (
              <select
                className="video-overlay-select"
                value={overlayMode}
                onChange={(e) => setOverlayMode(e.target.value as OverlayMode)}
              >
                <option value="all">All overlays</option>
                <option value="expressions">Expressions</option>
                <option value="engagement">Engagement</option>
                <option value="none">No overlay</option>
              </select>
            )}

            {/* Face mesh overlay canvas */}
            {isTutor && (
              <canvas
                ref={canvasRef}
                className="face-mesh-canvas"
              />
            )}

            {/* Face warning badge */}
            {faceBadge && (
              <div className={`face-badge face-badge--${faceBadge.level}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>{faceBadge.text}</span>
              </div>
            )}

            <div className="local-preview">
              <VideoSurface
                title="Your camera"
                stream={localStream}
                emptyTitle="Camera off"
                emptyCopy="Allow camera access to send video into the room."
                muted
                mirrored
                showLabel
              />
            </div>
          </div>


          {/* Floating call controls on video stage */}
          {connectionState !== "idle" && connectionState !== "disconnected" && (
            <div className="stage-controls">
              <button
                className={`stage-btn ${isMicrophoneEnabled ? "" : "off"}`}
                type="button"
                onClick={toggleMicrophone}
                title={isMicrophoneEnabled ? "Mute" : "Unmute"}
              >
                {isMicrophoneEnabled ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                )}
              </button>
              <div className="stage-btn-divider" />
              <button
                className="stage-btn hangup"
                type="button"
                onClick={() => {
                  void (async () => {
                    const sessionData = getSessionData(50); // TODO: get actual engagement score
                    const sessionStartedAt = parseInt(localStorage.getItem("livesesh_sessionStartedAt") || "0", 10);
                    // Update localStorage metrics with detected subject before navigating
                    try {
                      const savedMetricsRaw = localStorage.getItem("livesesh_sessionMetrics");
                      if (savedMetricsRaw) {
                        const savedMetrics = JSON.parse(savedMetricsRaw);
                        savedMetrics.subject = sessionData.subject || detectedSubject || "General";
                        localStorage.setItem("livesesh_sessionMetrics", JSON.stringify(savedMetrics));
                      }
                    } catch { /* ignore */ }
                    // Store in localStorage for the summary page to pick up
                    try {
                      localStorage.setItem("livesesh_lastSession", JSON.stringify({
                        subject: sessionData.subject || detectedSubject || "General",
                        summary: sessionData.summary,
                        transcript: sessionData.transcriptText.slice(0, 2000),
                        timestamp: sessionStartedAt || Date.now(),
                      }));
                    } catch { /* localStorage full */ }
                    localStorage.removeItem("livesesh_sessionStartedAt");
                    await hangUp();
                    window.location.href = "/session-summary";
                  })();
                }}
                title="End call"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.33-5.33A19.79 19.79 0 0 1 2.79 5.18 2 2 0 0 1 4.79 3h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.77 10.91a16 16 0 0 0 1.91 2.4z" transform="rotate(135 12 12)"/>
                </svg>
              </button>
            </div>
          )}

          {/* Floating coaching nudge on video stage */}
          {activeNudge && (
            <div
              className={`stage-nudge priority-${activeNudge.priority}`}
              style={nudgePos ? { top: nudgePos.y, left: nudgePos.x, right: "auto", bottom: "auto" } : undefined}
              onPointerDown={(e) => {
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                nudgeDragRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: rect.left,
                  origY: rect.top,
                };
                el.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!nudgeDragRef.current) return;
                const d = nudgeDragRef.current;
                setNudgePos({
                  x: d.origX + (e.clientX - d.startX),
                  y: d.origY + (e.clientY - d.startY),
                });
              }}
              onPointerUp={() => { nudgeDragRef.current = null; }}
            >
              <span className="stage-nudge-label">COACHING NUDGE</span>
              <span className="stage-nudge-msg">{activeNudge.message}</span>
            </div>
          )}
        </article>

        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
        >
          {sidebarCollapsed ? "Show panel" : "Hide panel"}
        </button>
        <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          {isTutor && (
            <StudentAnalysisCard
              remoteStream={remoteStream}
              localStream={localStream}
              onFacePosition={handleFacePosition}
              overlayMode={overlayMode}
              onNudge={setActiveNudge}
            />
          )}

          <details className="sidebar-card details-card">
            <summary className="details-summary">Room info</summary>
            <ul className="detail-list">
              <li>
                <span>Status</span>
                <strong>{connectionLabel(connectionState)}</strong>
              </li>
              <li>
                <span>Participants</span>
                <strong>{participants.length}</strong>
              </li>
              <li>
                <span>Role</span>
                <strong>{roleLabel(role)}</strong>
              </li>
            </ul>
            {participants.length > 0 && (
              <ul className="participant-list" style={{ marginTop: 8 }}>
                {participants.map((participant) => (
                  <li key={participant.peerId}>
                    <div>
                      <strong>{participant.displayName}</strong>
                    </div>
                    <div className="participant-meta">
                      <span>{roleLabel(participant.role)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {extraPeerCount > 0 ? (
            <section className="message warning">
              Demo rooms are one-to-one. {extraPeerCount} additional peer
              {extraPeerCount > 1 ? "s are" : " is"} currently ignored.
            </section>
          ) : null}

          {error ? (
            <section className="message error">{error}</section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
