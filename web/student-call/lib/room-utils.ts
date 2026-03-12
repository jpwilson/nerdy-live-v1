import type { CallConnectionState, RoomRole } from "@/lib/call-types";

export function normalizeRoomId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createRoomId(): string {
  return `session-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultDisplayName(role: RoomRole): string {
  return role === "student" ? "Student Guest" : "Tutor Preview";
}

export function parseRole(input: string | null | undefined): RoomRole {
  return input === "tutor_preview" ? "tutor_preview" : "student";
}

export function roleLabel(role: RoomRole): string {
  if (role === "tutor") return "Tutor (iOS)";
  if (role === "tutor_preview") return "Tutor preview";
  return "Student";
}

export function connectionLabel(state: CallConnectionState): string {
  switch (state) {
    case "acquiring_media":
      return "Checking camera and mic";
    case "joining_room":
      return "Joining room";
    case "waiting_for_peer":
      return "Waiting for the tutor app";
    case "connecting":
      return "Negotiating WebRTC";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Needs attention";
    default:
      return "Idle";
  }
}

export function buildStudentShareUrl(roomId: string): string {
  return `/room/${encodeURIComponent(roomId)}?role=student`;
}

export function formatJoinedAt(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "now";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
