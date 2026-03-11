"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomRole } from "@/lib/call-types";
import {
  createRoomId,
  defaultDisplayName,
  normalizeRoomId,
} from "@/lib/room-utils";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const DEMO_ACCOUNTS = [
  { label: "Demo Student", email: "demo-student@livesesh.app", password: "DemoPass123!", defaultRole: "student" as RoomRole },
  { label: "Demo Tutor", email: "demo@livesesh.app", password: "DemoPass123!", defaultRole: "tutor_preview" as RoomRole },
] as const;

const DEMO_ROOM = "demo-room";

type AuthState = "signed_out" | "otp_sent" | "signed_in";

export function JoinForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [roomId, setRoomId] = useState(createRoomId);
  const [role, setRole] = useState<RoomRole>("student");

  // Auth state
  const [authState, setAuthState] = useState<AuthState>("signed_out");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const inferredName = useMemo(() => {
    return displayName.trim() || signedInEmail?.split("@")[0] || defaultDisplayName(role);
  }, [displayName, signedInEmail, role]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authState !== "signed_in") return;

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

  const sendOtp = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setAuthState("otp_sent");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setAuthLoading(false);
    }
  };

  const verifyOtp = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: "email" });
      if (error) throw error;
      setSignedInEmail(email);
      setAuthState("signed_in");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setAuthLoading(false);
    }
  };

  const demoSignIn = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      if (error) throw error;
      setSignedInEmail(account.email);
      setRole(account.defaultRole);
      setDisplayName(account.label);
      setRoomId(DEMO_ROOM);
      setAuthState("signed_in");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Demo sign-in failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setAuthState("signed_out");
    setSignedInEmail(null);
    setEmail("");
    setOtpCode("");
    setDisplayName("");
  };

  // --- Auth screen ---
  if (authState !== "signed_in") {
    return (
      <div className="form-card stack">
        <div>
          <p className="eyebrow">Sign In</p>
          <h2>Authenticate to join a session.</h2>
        </div>

        <fieldset className="fieldset">
          <legend>Quick demo</legend>
          <p className="field-hint">
            Jump in instantly with a pre-configured demo account.
          </p>
          <div className="demo-grid">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.label}
                className="demo-button"
                type="button"
                disabled={authLoading}
                onClick={() => void demoSignIn(account)}
              >
                {account.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="divider-label">or sign in with email</div>

        {authState === "signed_out" ? (
          <div className="field">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={authLoading}
            />
            <button
              className="primary-button"
              type="button"
              disabled={authLoading || !email.includes("@")}
              onClick={() => void sendOtp()}
            >
              {authLoading ? "Sending..." : "Send sign-in code"}
            </button>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="auth-otp">Enter the code sent to {email}</label>
            <input
              id="auth-otp"
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="123456"
              disabled={authLoading}
            />
            <div className="actions">
              <button
                className="primary-button"
                type="button"
                disabled={authLoading || otpCode.length < 6}
                onClick={() => void verifyOtp()}
              >
                {authLoading ? "Verifying..." : "Verify code"}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => { setAuthState("signed_out"); setOtpCode(""); }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {authError && <div className="message error">{authError}</div>}
      </div>
    );
  }

  // --- Authenticated join form ---
  return (
    <form className="form-card stack" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Join A Room</p>
        <h2>Signed in as {signedInEmail}</h2>
        <button className="ghost-button" type="button" onClick={() => void signOut()} style={{ marginTop: 8, padding: "8px 14px", fontSize: "0.85rem" }}>
          Sign out
        </button>
      </div>

      <div className="field">
        <label htmlFor="display-name">Display name</label>
        <input
          id="display-name"
          name="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={inferredName}
          autoComplete="name"
        />
        <p className="field-hint">Shown in the room presence list.</p>
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
              The browser acts as the student-side webcam and mic.
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
              Browser fallback for rehearsing the call before the iOS app joins.
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
