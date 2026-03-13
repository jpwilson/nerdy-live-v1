"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  CallConnectionState,
  ParticipantPresence,
  RoomRole,
  SignalEnvelope,
} from "@/lib/call-types";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: "stun:stun.l.google.com:19302",
  },
];

type PresenceRecord = Partial<ParticipantPresence> & Record<string, unknown>;

function resolveIceServers(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON;

  if (!raw) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsed = JSON.parse(raw) as RTCIceServer[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "The call failed for an unknown reason.";
}

function serializeDescription(
  description: RTCSessionDescription | RTCSessionDescriptionInit
): RTCSessionDescriptionInit {
  return {
    type: description.type,
    sdp: description.sdp ?? undefined,
  };
}

function flattenPresence(channel: RealtimeChannel): ParticipantPresence[] {
  const state = channel.presenceState<PresenceRecord>();
  const entries = Object.values(state).flat();
  const deduped = new Map<string, ParticipantPresence>();

  for (const entry of entries) {
    if (
      typeof entry.peerId === "string" &&
      typeof entry.displayName === "string" &&
      typeof entry.role === "string" &&
      typeof entry.joinedAt === "string"
    ) {
      const entryRole = entry.role === "tutor_preview" ? "tutor_preview"
        : entry.role === "tutor" ? "tutor"
        : "student";
      deduped.set(entry.peerId, {
        peerId: entry.peerId,
        displayName: entry.displayName,
        role: entryRole,
        joinedAt: entry.joinedAt,
      });
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.joinedAt.localeCompare(right.joinedAt)
  );
}

export function useWebRtcRoom({
  roomId,
  displayName,
  role,
}: {
  roomId: string;
  displayName: string;
  role: RoomRole;
}) {
  const peerIdRef = useRef(
    typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const settingRemoteAnswerPendingRef = useRef(false);
  const politeRef = useRef(true);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<ParticipantPresence[]>([]);
  const [connectionState, setConnectionState] =
    useState<CallConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraPeerCount, setExtraPeerCount] = useState(0);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);

  const cleanupPeerConnection = useCallback((resetRemoteStream: boolean) => {
    const peerConnection = peerConnectionRef.current;

    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onnegotiationneeded = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      peerConnectionRef.current = null;
    }

    ignoreOfferRef.current = false;
    makingOfferRef.current = false;
    settingRemoteAnswerPendingRef.current = false;

    if (resetRemoteStream) {
      const stream = remoteStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      remoteStreamRef.current = null;
      setRemoteStream(null);
    }
  }, []);

  const sendSignal = useCallback(
    async (
      payload: Omit<SignalEnvelope, "displayName" | "from" | "role" | "sentAt">
    ) => {
      const channel = channelRef.current;
      if (!channel) {
        return;
      }

      await channel.send({
        type: "broadcast",
        event: "webrtc_signal",
        payload: {
          ...payload,
          displayName,
          from: peerIdRef.current,
          role,
          sentAt: new Date().toISOString(),
        } satisfies SignalEnvelope,
      });
    },
    [displayName, role]
  );

  const ensurePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const stream = localStreamRef.current;
    const remotePeerId = remotePeerIdRef.current;

    if (!stream || !remotePeerId) {
      return null;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: resolveIceServers(),
    });

    peerConnection.onicecandidate = ({ candidate }) => {
      if (!candidate || !remotePeerIdRef.current) {
        return;
      }

      void sendSignal({
        kind: "ice_candidate",
        to: remotePeerIdRef.current,
        candidate: candidate.toJSON(),
      });
    };

    peerConnection.ontrack = (event) => {
      const [firstStream] = event.streams;

      if (firstStream) {
        remoteStreamRef.current = firstStream;
        setRemoteStream(firstStream);
        return;
      }

      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      remoteStreamRef.current.addTrack(event.track);
      setRemoteStream(remoteStreamRef.current);
    };

    peerConnection.onconnectionstatechange = () => {
      switch (peerConnection.connectionState) {
        case "connected":
          setConnectionState("connected");
          setError(null);
          break;
        case "connecting":
          setConnectionState("connecting");
          break;
        case "disconnected":
          setConnectionState("reconnecting");
          break;
        case "failed":
          setConnectionState("error");
          setError("Peer connection failed. Check your network or refresh the room.");
          break;
        case "closed":
          setConnectionState("disconnected");
          break;
        default:
          break;
      }
    };

    peerConnection.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        setConnectionState("connecting");
        await peerConnection.setLocalDescription();

        if (peerConnection.localDescription && remotePeerIdRef.current) {
          await sendSignal({
            kind: "description",
            to: remotePeerIdRef.current,
            description: serializeDescription(peerConnection.localDescription),
          });
        }
      } catch (negotiationError) {
        setConnectionState("error");
        setError(toErrorMessage(negotiationError));
      } finally {
        makingOfferRef.current = false;
      }
    };

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [sendSignal]);

  const syncParticipants = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) {
      return;
    }

    const everyone = flattenPresence(channel);
    setParticipants(everyone);

    const remoteParticipants = everyone.filter(
      (participant) => participant.peerId !== peerIdRef.current
    );

    setExtraPeerCount(Math.max(remoteParticipants.length - 1, 0));

    const nextRemote = remoteParticipants[0] ?? null;

    if (!nextRemote) {
      remotePeerIdRef.current = null;
      cleanupPeerConnection(true);
      setConnectionState("waiting_for_peer");
      return;
    }

    if (nextRemote.peerId !== remotePeerIdRef.current) {
      remotePeerIdRef.current = nextRemote.peerId;
      politeRef.current = peerIdRef.current.localeCompare(nextRemote.peerId) > 0;
      cleanupPeerConnection(true);

      if (localStreamRef.current) {
        ensurePeerConnection();
        setConnectionState("connecting");
      }
    }
  }, [cleanupPeerConnection, ensurePeerConnection]);

  const handleSignal = useCallback(
    async (incoming: SignalEnvelope) => {
      if (incoming.from === peerIdRef.current) {
        return;
      }

      if (incoming.to && incoming.to !== peerIdRef.current) {
        return;
      }

      if (remotePeerIdRef.current && incoming.from !== remotePeerIdRef.current) {
        return;
      }

      if (!remotePeerIdRef.current) {
        remotePeerIdRef.current = incoming.from;
        politeRef.current = peerIdRef.current.localeCompare(incoming.from) > 0;
      }

      if (incoming.kind === "hangup") {
        remotePeerIdRef.current = null;
        cleanupPeerConnection(true);
        syncParticipants();
        return;
      }

      const peerConnection = ensurePeerConnection();
      if (!peerConnection) {
        return;
      }

      try {
        if (incoming.description) {
          const readyForOffer =
            !makingOfferRef.current &&
            (peerConnection.signalingState === "stable" ||
              settingRemoteAnswerPendingRef.current);
          const offerCollision =
            incoming.description.type === "offer" && !readyForOffer;

          ignoreOfferRef.current = !politeRef.current && offerCollision;
          if (ignoreOfferRef.current) {
            return;
          }

          settingRemoteAnswerPendingRef.current =
            incoming.description.type === "answer";

          await peerConnection.setRemoteDescription(incoming.description);
          settingRemoteAnswerPendingRef.current = false;

          if (incoming.description.type === "offer") {
            await peerConnection.setLocalDescription();

            if (peerConnection.localDescription && remotePeerIdRef.current) {
              await sendSignal({
                kind: "description",
                to: remotePeerIdRef.current,
                description: serializeDescription(peerConnection.localDescription),
              });
            }
          }

          return;
        }

        if (incoming.candidate) {
          try {
            await peerConnection.addIceCandidate(incoming.candidate);
          } catch (candidateError) {
            if (!ignoreOfferRef.current) {
              throw candidateError;
            }
          }
        }
      } catch (signalError) {
        setConnectionState("error");
        setError(toErrorMessage(signalError));
      }
    },
    [cleanupPeerConnection, ensurePeerConnection, sendSignal, syncParticipants]
  );

  useEffect(() => {
    let active = true;

    const initializeRoom = async () => {
      setConnectionState("acquiring_media");
      setError(null);

      try {
        // Enumerate devices to find the built-in camera and mic,
        // avoiding Continuity Camera (iPhone) devices on macOS.
        let videoConstraints: MediaTrackConstraints = {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };
        let audioConstraints: MediaTrackConstraints = {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        };

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const isExternalOrContinuity = (label: string) => {
            const lower = label.toLowerCase();
            return (
              lower.includes("iphone") ||
              lower.includes("ipad") ||
              lower.includes("continuity")
            );
          };

          const builtInCamera = devices.find(
            (d) =>
              d.kind === "videoinput" && !isExternalOrContinuity(d.label)
          );
          const builtInMic = devices.find(
            (d) =>
              d.kind === "audioinput" && !isExternalOrContinuity(d.label)
          );

          if (builtInCamera) {
            videoConstraints = {
              ...videoConstraints,
              deviceId: { exact: builtInCamera.deviceId },
            };
          }
          if (builtInMic) {
            audioConstraints = {
              ...audioConstraints,
              deviceId: { exact: builtInMic.deviceId },
            };
          }
        } catch {
          // enumerateDevices may fail or return empty labels before
          // permission grant — fall through to default constraints.
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });

        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = mediaStream;
        setLocalStream(mediaStream);
        setIsCameraEnabled(mediaStream.getVideoTracks().every((track) => track.enabled));
        setIsMicrophoneEnabled(
          mediaStream.getAudioTracks().every((track) => track.enabled)
        );
      } catch (mediaError) {
        setConnectionState("error");
        setError(
          `Camera or microphone access failed: ${toErrorMessage(mediaError)}`
        );
        return;
      }

      setConnectionState("joining_room");

      try {
        const supabase = getSupabaseBrowserClient();
        const channel = supabase.channel(`room:${roomId}:webrtc`, {
          config: {
            broadcast: { self: false, ack: true },
            presence: { key: peerIdRef.current },
          },
        });

        supabaseRef.current = supabase;
        channelRef.current = channel;

        channel
          .on("broadcast", { event: "webrtc_signal" }, ({ payload }) => {
            void handleSignal(payload as SignalEnvelope);
          })
          .on("presence", { event: "sync" }, () => {
            syncParticipants();
          })
          .on("presence", { event: "join" }, () => {
            syncParticipants();
          })
          .on("presence", { event: "leave" }, () => {
            syncParticipants();
          })
          .subscribe(async (status) => {
            if (!active) {
              return;
            }

            if (status === "SUBSCRIBED") {
              // Include auth user ID in presence so the tutor app can link sessions to students
              const { data: { user } } = await supabase.auth.getUser();
              await channel.track({
                peerId: peerIdRef.current,
                displayName,
                role,
                userId: user?.id ?? null,
                joinedAt: new Date().toISOString(),
              });
              syncParticipants();
              setConnectionState(
                remotePeerIdRef.current ? "connecting" : "waiting_for_peer"
              );
            }

            if (status === "CHANNEL_ERROR") {
              setConnectionState("error");
              setError("Supabase Realtime rejected this room subscription.");
            }

            if (status === "TIMED_OUT") {
              setConnectionState("error");
              setError("The room subscription timed out.");
            }

            if (status === "CLOSED") {
              setConnectionState("disconnected");
            }
          });
      } catch (roomError) {
        setConnectionState("error");
        setError(toErrorMessage(roomError));
      }
    };

    void initializeRoom();

    return () => {
      active = false;

      const channel = channelRef.current;
      if (channel) {
        if (remotePeerIdRef.current) {
          void sendSignal({
            kind: "hangup",
            to: remotePeerIdRef.current,
          }).catch(() => undefined);
        }

        if (supabaseRef.current) {
          void supabaseRef.current.removeChannel(channel);
        }
      }

      channelRef.current = null;
      supabaseRef.current = null;
      remotePeerIdRef.current = null;

      cleanupPeerConnection(true);

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      localStreamRef.current = null;
      setLocalStream(null);
    };
  }, [
    cleanupPeerConnection,
    displayName,
    handleSignal,
    role,
    roomId,
    sendSignal,
    syncParticipants,
  ]);

  const toggleMicrophone = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    const nextEnabled = !stream.getAudioTracks().every((track) => track.enabled);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsMicrophoneEnabled(nextEnabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    const nextEnabled = !stream.getVideoTracks().every((track) => track.enabled);
    stream.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsCameraEnabled(nextEnabled);
  }, []);

  const hangUp = useCallback(async () => {
    const remotePeerId = remotePeerIdRef.current;
    remotePeerIdRef.current = null;

    if (remotePeerId) {
      await sendSignal({
        kind: "hangup",
        to: remotePeerId,
      });
    }

    cleanupPeerConnection(true);
    syncParticipants();
  }, [cleanupPeerConnection, sendSignal, syncParticipants]);

  return {
    connectionState,
    error,
    extraPeerCount,
    hangUp,
    isCameraEnabled,
    isMicrophoneEnabled,
    localPeerId: peerIdRef.current,
    localStream,
    participants,
    remoteStream,
    roomTopic: `room:${roomId}:webrtc`,
    toggleCamera,
    toggleMicrophone,
  };
}
