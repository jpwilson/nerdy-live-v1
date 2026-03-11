"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomRole } from "@/lib/call-types";
import {
  createRoomId,
  defaultDisplayName,
  normalizeRoomId,
} from "@/lib/room-utils";

export function JoinForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [roomId, setRoomId] = useState(createRoomId);
  const [role, setRole] = useState<RoomRole>("student");

  const inferredName = useMemo(() => {
    return displayName.trim() || defaultDisplayName(role);
  }, [displayName, role]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedRoomId = normalizeRoomId(roomId) || createRoomId();
    const params = new URLSearchParams({
      name: inferredName,
      role,
    });

    router.push(`/room/${encodeURIComponent(normalizedRoomId)}?${params.toString()}`);
  };

  const regenerateRoom = () => {
    setRoomId(createRoomId());
  };

  return (
    <form className="form-card stack" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Join A Room</p>
        <h2>Student by default, tutor-preview when rehearsing.</h2>
      </div>

      <div className="field">
        <label htmlFor="display-name">Display name</label>
        <input
          id="display-name"
          name="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={defaultDisplayName(role)}
          autoComplete="name"
        />
        <p className="field-hint">This is only used inside the room presence list.</p>
      </div>

      <div className="field">
        <label htmlFor="room-id">Room code</label>
        <input
          id="room-id"
          name="roomId"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
          placeholder="session-abc123"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      <fieldset className="fieldset">
        <legend>Join mode</legend>
        <div className="choice-grid">
          <label className="choice-card" htmlFor="mode-student">
            <input
              id="mode-student"
              type="radio"
              name="role"
              value="student"
              checked={role === "student"}
              onChange={() => setRole("student")}
            />
            <strong>Student</strong>
            <span>
              Product path. The browser acts as the student-side webcam and mic.
            </span>
          </label>

          <label className="choice-card" htmlFor="mode-tutor-preview">
            <input
              id="mode-tutor-preview"
              type="radio"
              name="role"
              value="tutor_preview"
              checked={role === "tutor_preview"}
              onChange={() => setRole("tutor_preview")}
            />
            <strong>Tutor preview</strong>
            <span>
              Browser fallback for rehearsing the full call before the iOS app joins.
            </span>
          </label>
        </div>
      </fieldset>

      <div className="actions">
        <button className="primary-button" type="submit">
          Join room
        </button>
        <button className="ghost-button" type="button" onClick={regenerateRoom}>
          Generate room code
        </button>
      </div>
    </form>
  );
}
