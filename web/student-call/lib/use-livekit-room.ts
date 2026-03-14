"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrackPublication,
  RemoteParticipant,
  LocalParticipant,
  ConnectionState,
  VideoPresets,
} from "livekit-client";
import type {
  CallConnectionState,
  ParticipantPresence,
  RoomRole,
} from "@/lib/call-types";

function mapConnectionState(state: ConnectionState): CallConnectionState {
  switch (state) {
    case ConnectionState.Disconnected:
      return "disconnected";
    case ConnectionState.Connecting:
      return "connecting";
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Reconnecting:
      return "reconnecting";
    default:
      return "idle";
  }
}

export function useLiveKitRoom({
  roomId,
  displayName,
  role,
}: {
  roomId: string;
  displayName: string;
  role: RoomRole;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<ParticipantPresence[]>([]);
  const [connectionState, setConnectionState] =
    useState<CallConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraPeerCount, setExtraPeerCount] = useState(0);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);

  const roomRef = useRef<Room | null>(null);
  const localPeerIdRef = useRef(
    typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const buildParticipantList = useCallback(
    (room: Room): ParticipantPresence[] => {
      const list: ParticipantPresence[] = [];

      // Local participant
      const local = room.localParticipant;
      list.push({
        peerId: local.identity || localPeerIdRef.current,
        displayName: local.name || displayName,
        role,
        joinedAt: new Date().toISOString(),
      });

      // Remote participants
      for (const [, remote] of room.remoteParticipants) {
        list.push({
          peerId: remote.identity,
          displayName: remote.name || remote.identity,
          role: remote.identity.includes("tutor") ? "tutor" : "student",
          joinedAt: new Date(
            Number(remote.joinedAt ?? Date.now()),
          ).toISOString(),
        });
      }

      return list;
    },
    [displayName, role],
  );

  const rebuildRemoteStream = useCallback((room: Room) => {
    const stream = new MediaStream();
    let hasTrack = false;

    for (const [, remote] of room.remoteParticipants) {
      for (const [, pub] of remote.trackPublications) {
        if (pub.track?.mediaStreamTrack) {
          stream.addTrack(pub.track.mediaStreamTrack);
          hasTrack = true;
        }
      }
    }

    if (hasTrack) {
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    } else {
      remoteStreamRef.current = null;
      setRemoteStream(null);
    }
  }, []);

  const syncState = useCallback(
    (room: Room) => {
      const list = buildParticipantList(room);
      setParticipants(list);
      const remoteCount = room.remoteParticipants.size;
      setExtraPeerCount(Math.max(remoteCount - 1, 0));

      if (remoteCount === 0) {
        setConnectionState(
          room.state === ConnectionState.Connected
            ? "waiting_for_peer"
            : mapConnectionState(room.state),
        );
      }
    },
    [buildParticipantList],
  );

  useEffect(() => {
    let active = true;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });
    roomRef.current = room;

    const init = async () => {
      setConnectionState("acquiring_media");
      setError(null);

      try {
        // Get token from our API
        const res = await fetch("/api/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName: roomId,
            participantName: displayName,
            participantIdentity: `${role}-${localPeerIdRef.current}`,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error || `Token request failed (${res.status})`,
          );
        }

        const { token } = await res.json();
        const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

        if (!livekitUrl) {
          throw new Error(
            "NEXT_PUBLIC_LIVEKIT_URL is not set. Add it to .env.local",
          );
        }

        if (!active) return;

        setConnectionState("joining_room");

        // Set up event handlers before connecting
        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (!active) return;
          if (state === ConnectionState.Connected) {
            setConnectionState(
              room.remoteParticipants.size > 0
                ? "connected"
                : "waiting_for_peer",
            );
            setError(null);
          } else {
            setConnectionState(mapConnectionState(state));
          }
        });

        room.on(RoomEvent.TrackSubscribed, (_track, _pub, _participant) => {
          if (!active) return;
          rebuildRemoteStream(room);
          syncState(room);
          setConnectionState("connected");
        });

        room.on(
          RoomEvent.TrackUnsubscribed,
          (_track, _pub, _participant) => {
            if (!active) return;
            rebuildRemoteStream(room);
            syncState(room);
          },
        );

        room.on(RoomEvent.ParticipantConnected, () => {
          if (!active) return;
          syncState(room);
          setConnectionState("connected");
        });

        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (!active) return;
          rebuildRemoteStream(room);
          syncState(room);
        });

        room.on(RoomEvent.Disconnected, () => {
          if (!active) return;
          setConnectionState("disconnected");
          remoteStreamRef.current = null;
          setRemoteStream(null);
        });

        room.on(
          RoomEvent.MediaDevicesError,
          (err: Error) => {
            if (!active) return;
            setError(`Media device error: ${err.message}`);
          },
        );

        // Connect to room
        await room.connect(livekitUrl, token);

        if (!active) {
          room.disconnect();
          return;
        }

        // Enable camera and microphone
        await room.localParticipant.enableCameraAndMicrophone();

        // Build local stream from local tracks
        const localMediaStream = new MediaStream();
        for (const [, pub] of room.localParticipant.trackPublications) {
          if (pub.track?.mediaStreamTrack) {
            localMediaStream.addTrack(pub.track.mediaStreamTrack);
          }
        }
        setLocalStream(localMediaStream);

        // Check for existing remote tracks
        rebuildRemoteStream(room);
        syncState(room);
      } catch (err) {
        if (!active) return;
        setConnectionState("error");
        setError(
          err instanceof Error ? err.message : "Failed to join room",
        );
      }
    };

    void init();

    return () => {
      active = false;
      room.disconnect();
      roomRef.current = null;
      remoteStreamRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
    };
  }, [roomId, displayName, role, rebuildRemoteStream, syncState]);

  const toggleMicrophone = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !isMicrophoneEnabled;
    room.localParticipant.setMicrophoneEnabled(next);
    setIsMicrophoneEnabled(next);
  }, [isMicrophoneEnabled]);

  const toggleCamera = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !isCameraEnabled;
    room.localParticipant.setCameraEnabled(next);
    setIsCameraEnabled(next);
  }, [isCameraEnabled]);

  const hangUp = useCallback(async () => {
    const room = roomRef.current;
    if (room) {
      room.disconnect();
    }
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setConnectionState("disconnected");
  }, []);

  return {
    connectionState,
    error,
    extraPeerCount,
    hangUp,
    isCameraEnabled,
    isMicrophoneEnabled,
    localPeerId: localPeerIdRef.current,
    localStream,
    participants,
    remoteStream,
    roomTopic: `room:${roomId}:livekit`,
    toggleCamera,
    toggleMicrophone,
  };
}
