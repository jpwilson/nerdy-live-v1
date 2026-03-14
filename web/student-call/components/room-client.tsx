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
import { StudentAnalysisCard, type FacePositionData } from "@/components/analysis-panel";

// ── MediaPipe face mesh connectivity (Tesselation subset for wireframe) ──
// These are the standard MediaPipe FACEMESH_TESSELATION connections
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const LEFT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_EYEBROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];
const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78];
const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1, 19];
// Left iris center = 468, Right iris center = 473

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

  // Draw wireframe connections
  const drawPath = (indices: number[], color: string, lineWidth: number, close = false) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(toX(indices[0]), toY(indices[0]));
    for (let i = 1; i < indices.length; i++) {
      ctx.lineTo(toX(indices[i]), toY(indices[i]));
    }
    if (close) ctx.closePath();
    ctx.stroke();
  };

  // Face oval
  drawPath(FACE_OVAL, "rgba(0, 212, 170, 0.5)", 1.5);
  // Eyes
  drawPath(LEFT_EYE, "rgba(0, 212, 170, 0.7)", 1.5);
  drawPath(RIGHT_EYE, "rgba(0, 212, 170, 0.7)", 1.5);
  // Eyebrows
  drawPath(LEFT_EYEBROW, "rgba(0, 212, 170, 0.4)", 1);
  drawPath(RIGHT_EYEBROW, "rgba(0, 212, 170, 0.4)", 1);
  // Lips
  drawPath(LIPS_OUTER, "rgba(0, 212, 170, 0.5)", 1.2);
  drawPath(LIPS_INNER, "rgba(0, 212, 170, 0.4)", 1);
  // Nose
  drawPath(NOSE_BRIDGE, "rgba(0, 212, 170, 0.4)", 1);

  // Draw landmark dots (sparse — every 5th point for performance)
  ctx.fillStyle = "rgba(0, 212, 170, 0.3)";
  for (let i = 0; i < lm.length; i += 5) {
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw iris centers with bigger dots
  if (lm.length > 473) {
    ctx.fillStyle = "rgba(0, 212, 170, 0.9)";
    for (const idx of [468, 473]) {
      ctx.beginPath();
      ctx.arc(toX(idx), toY(idx), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gaze direction arrows from iris centers
    // Use eye look blendshapes to determine gaze direction
    if (blendshapes) {
      const gazeX =
        -(blendshapes.eyeLookInLeft ?? 0) +
        (blendshapes.eyeLookOutLeft ?? 0);
      const gazeY =
        -(blendshapes.eyeLookUpLeft ?? 0) +
        (blendshapes.eyeLookDownLeft ?? 0);

      const arrowLen = 30;
      ctx.strokeStyle = "rgba(0, 212, 170, 0.85)";
      ctx.lineWidth = 2;

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

        // Arrowhead
        const angle = Math.atan2(dy, dx);
        const headLen = 6;
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

  // Expression labels from blendshapes
  if (blendshapes) {
    const expressions: Array<{ name: string; label: string }> = [
      { name: "mouthSmileLeft", label: "Smiling" },
      { name: "browInnerUp", label: "Surprised" },
      { name: "browDownLeft", label: "Frowning" },
      { name: "mouthOpen", label: "Mouth open" },
      { name: "eyeSquintLeft", label: "Squinting" },
    ];

    const active = expressions.filter(
      (e) => (blendshapes[e.name] ?? 0) > 0.4,
    );

    if (active.length > 0) {
      ctx.font = "bold 13px 'Avenir Next', sans-serif";
      ctx.textAlign = "left";
      const labelX = Math.min(toX(234), w - 120);
      const labelY = Math.max(toY(152) + 20, 30);

      active.forEach((expr, i) => {
        const y = labelY + i * 20;
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        const textW = ctx.measureText(expr.label).width;
        ctx.fillRect(labelX - 4, y - 12, textW + 8, 18);
        ctx.fillStyle = "rgba(0, 212, 170, 0.95)";
        ctx.fillText(expr.label, labelX, y);
      });
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
}: {
  title: string;
  stream: MediaStream | null;
  emptyTitle: string;
  emptyCopy: string;
  muted?: boolean;
  mirrored?: boolean;
  videoStyle?: React.CSSProperties;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
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
      <div className="video-label">{title}</div>
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
  const [showMeshOverlay, setShowMeshOverlay] = useState(false);
  const [facePosition, setFacePosition] = useState<FacePositionData | null>(null);
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

  // Face centering via CSS transform disabled — was causing mesh misalignment
  // and pushing the face out of frame. Using static object-position instead.
  const videoTransformStyle = useMemo((): React.CSSProperties => {
    return {};
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

    if (
      !showMeshOverlay ||
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

    if (videoAR > containerAR) {
      // Video is wider than container — cropped horizontally
      scaledH = containerH;
      scaledW = containerH * videoAR;
      offsetX = (scaledW - containerW) / 2; // center horizontally
      // object-position: center 30% — vertical position is 30%
      offsetY = (scaledH - containerH) * 0.3;
    } else {
      // Video is taller than container — cropped vertically
      scaledW = containerW;
      scaledH = containerW / videoAR;
      offsetX = (scaledW - containerW) / 2;
      // object-position: center 30%
      offsetY = (scaledH - containerH) * 0.3;
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
  }, [showMeshOverlay, facePosition]);

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
          <div className="video-frame" ref={videoFrameRef}>
            <VideoSurface
              title={remoteTitle}
              stream={remoteStream}
              emptyTitle={emptyTitle}
              emptyCopy={emptyCopy}
              videoRef={remoteVideoRef}
              videoStyle={isTutor ? videoTransformStyle : undefined}
            />

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

            {/* Face mesh toggle button */}
            {isTutor && remoteStream && (
              <button
                className={`mesh-toggle-btn ${showMeshOverlay ? "active" : ""}`}
                type="button"
                onClick={() => setShowMeshOverlay((v) => !v)}
                title={showMeshOverlay ? "Hide face mesh" : "Show face mesh"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showMeshOverlay ? (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </>
                  ) : (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </>
                  )}
                </svg>
              </button>
            )}

            <div className="local-preview">
              <VideoSurface
                title="Your camera"
                stream={localStream}
                emptyTitle="Camera off"
                emptyCopy="Allow camera access to send video into the room."
                muted
                mirrored
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

          {/* Floating hangup button on video stage */}
          {connectionState === "connected" && (
            <div className="stage-hangup">
              <button
                className="hangup-fab"
                type="button"
                onClick={() => {
                  void hangUp().then(() => router.push("/"));
                }}
                title="End call"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.33-5.33A19.79 19.79 0 0 1 2.79 5.18 2 2 0 0 1 4.79 3h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.77 10.91a16 16 0 0 0 1.91 2.4z" transform="rotate(135 12 12)"/>
                </svg>
              </button>
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
          <section className="sidebar-card">
            <h3>Call controls</h3>
            <div className="call-controls">
              <button
                className={`control-button ${
                  isMicrophoneEnabled ? "active" : "inactive"
                }`}
                type="button"
                onClick={toggleMicrophone}
              >
                {isMicrophoneEnabled ? "Mic on" : "Mic off"}
              </button>
              <button
                className={`control-button ${
                  isCameraEnabled ? "active" : "inactive"
                }`}
                type="button"
                onClick={toggleCamera}
              >
                {isCameraEnabled ? "Camera on" : "Camera off"}
              </button>
              <button
                className="control-button leave"
                type="button"
                onClick={() => {
                  void hangUp().then(() => router.push("/"));
                }}
              >
                Leave call
              </button>
            </div>
          </section>

          {isTutor && (
            <StudentAnalysisCard
              remoteStream={remoteStream}
              onFacePosition={handleFacePosition}
            />
          )}

          <section className="sidebar-card">
            <h3>Room state</h3>
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
                <span>Current role</span>
                <strong>{roleLabel(role)}</strong>
              </li>
              <li>
                <span>Peer id</span>
                <strong className="mono">{localPeerId.slice(0, 8)}</strong>
              </li>
            </ul>
          </section>

          <section className="sidebar-card">
            <h3>Presence</h3>
            <ul className="participant-list">
              {participants.length === 0 ? (
                <li>
                  <span>No one is in the room yet.</span>
                </li>
              ) : (
                participants.map((participant) => (
                  <li key={participant.peerId}>
                    <div>
                      <strong>{participant.displayName}</strong>
                    </div>
                    <div className="participant-meta">
                      <span>{roleLabel(participant.role)}</span>
                      <span>{formatJoinedAt(participant.joinedAt)}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

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
