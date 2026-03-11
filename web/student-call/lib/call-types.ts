export type RoomRole = "student" | "tutor_preview";

export type CallConnectionState =
  | "idle"
  | "acquiring_media"
  | "joining_room"
  | "waiting_for_peer"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type ParticipantPresence = {
  peerId: string;
  displayName: string;
  role: RoomRole;
  joinedAt: string;
};

export type SignalEnvelope = {
  from: string;
  to?: string | null;
  sentAt: string;
  role: RoomRole;
  displayName: string;
  kind: "description" | "ice_candidate" | "hangup";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
