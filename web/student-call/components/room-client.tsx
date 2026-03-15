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

function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  landmarks: Array<{ x: number; y: number; z: number }>,
  blendshapes: Record<string, number> | null,
  headPose: { yaw: number; pitch: number },
) {
  ctx.clearRect(0, 0, w, h);

  const lm = landmarks;
  const toX = (i: number) => lm[i].x * w;
  const toY = (i: number) => lm[i].y * h;

  // 1. Draw full tessellation wireframe (low opacity, thin lines)
  ctx.strokeStyle = "rgba(0, 212, 170, 0.12)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (const [a, b] of FACEMESH_TESSELATION) {
    if (a < lm.length && b < lm.length) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
  }
  ctx.stroke();

  // 2. Draw all landmark dots (small, low opacity)
  ctx.fillStyle = "rgba(0, 212, 170, 0.15)";
  for (let i = 0; i < Math.min(lm.length, 468); i++) {
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Draw feature paths on top with higher visibility
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

  drawPath(FACE_OVAL, "rgba(0, 212, 170, 0.45)", 1.2);
  drawPath(LEFT_EYE, "rgba(0, 212, 170, 0.65)", 1.3);
  drawPath(RIGHT_EYE, "rgba(0, 212, 170, 0.65)", 1.3);
  drawPath(LEFT_EYEBROW, "rgba(0, 212, 170, 0.4)", 1);
  drawPath(RIGHT_EYEBROW, "rgba(0, 212, 170, 0.4)", 1);
  drawPath(LIPS_OUTER, "rgba(0, 212, 170, 0.5)", 1.2);
  drawPath(LIPS_INNER, "rgba(0, 212, 170, 0.4)", 1);
  drawPath(NOSE_BRIDGE, "rgba(0, 212, 170, 0.35)", 0.8);

  // 4. Iris centers + gaze arrows
  if (lm.length > 473) {
    ctx.fillStyle = "rgba(0, 212, 170, 0.9)";
    for (const idx of [468, 473]) {
      ctx.beginPath();
      ctx.arc(toX(idx), toY(idx), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (blendshapes) {
      const gazeX =
        -(blendshapes.eyeLookInLeft ?? 0) +
        (blendshapes.eyeLookOutLeft ?? 0);
      const gazeY =
        -(blendshapes.eyeLookUpLeft ?? 0) +
        (blendshapes.eyeLookDownLeft ?? 0);

      const arrowLen = 25;
      ctx.strokeStyle = "rgba(0, 212, 170, 0.8)";
      ctx.lineWidth = 1.5;

      for (const irisIdx of [468, 473]) {
        const ix = toX(irisIdx);
        const iy = toY(irisIdx);
        const dx = gazeX * arrowLen;
        const dy = gazeY * arrowLen;
        const ex = ix + dx;
        const ey = iy + dy;

        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        const angle = Math.atan2(dy, dx);
        const headLen = 5;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLen * Math.cos(angle - 0.5),
          ey - headLen * Math.sin(angle - 0.5),
        );
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLen * Math.cos(angle + 0.5),
          ey - headLen * Math.sin(angle + 0.5),
        );
        ctx.stroke();
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
        <div className="video-placeholder">
          <div>
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

  const isTutor = role === "tutor_preview";

  const sharePath = useMemo(() => buildStudentShareUrl(roomId), [roomId]);

  const remoteTitle =
    role === "student" ? "Tutor feed" : "Student feed";
  const emptyTitle =
    role === "student" ? "Waiting for the tutor app" : "Waiting for the student";
  const emptyCopy =
    role === "student"
      ? "The student browser is connected and ready. Once the tutor app joins this room, video appears here."
      : "Use a second browser in Student mode, or wire the iOS app to this room topic to complete the call.";

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
    );
  }, [overlayMode, facePosition]);

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

          {!remoteStream && (
            <div className="stage-note">
              <p className="body-copy">
                {role === "student"
                  ? "The browser stays student-simple. Engagement analysis belongs on the tutor-side surface once the iPhone app consumes this WebRTC stream."
                  : "Tutor preview is a browser-only fallback so the WebRTC path can be rehearsed before the iOS tutor app is connected."}
              </p>
              <p className="body-copy">
                Room topic: <span className="mono">{roomTopic}</span>
              </p>
            </div>
          )}

          {/* Floating call controls on video stage */}
          {connectionState === "connected" && (
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
              <button
                className={`stage-btn ${isCameraEnabled ? "" : "off"}`}
                type="button"
                onClick={toggleCamera}
                title={isCameraEnabled ? "Camera off" : "Camera on"}
              >
                {isCameraEnabled ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 7l-7 5 7 5V7z"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>
              <div className="stage-btn-divider" />
              <button
                className="stage-btn hangup"
                type="button"
                onClick={() => {
                  void hangUp().then(() => window.location.href = "/");
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
              onOverlayModeChange={setOverlayMode}
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
