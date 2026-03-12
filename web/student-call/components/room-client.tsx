"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useWebRtcRoom } from "@/lib/use-webrtc-room";

function VideoSurface({
  title,
  stream,
  emptyTitle,
  emptyCopy,
  muted = false,
  mirrored = false,
}: {
  title: string;
  stream: MediaStream | null;
  emptyTitle: string;
  emptyCopy: string;
  muted?: boolean;
  mirrored?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted={muted}
          playsInline
          className={mirrored ? "mirrored" : undefined}
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
  } = useWebRtcRoom({
    roomId,
    displayName,
    role,
  });

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
          <div className="video-frame">
            <VideoSurface
              title={remoteTitle}
              stream={remoteStream}
              emptyTitle={emptyTitle}
              emptyCopy={emptyCopy}
            />

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
