"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomRole } from "@/lib/call-types";
import {
  createRoomId,
  defaultDisplayName,
  normalizeRoomId,
} from "@/lib/room-utils";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

const DEMO_STUDENTS = [
  { label: "Sarah Chen", email: "demo-student@livesesh.app" },
  { label: "Alex Rivera", email: "student-alex@livesesh.app" },
  { label: "Jordan Patel", email: "student-jordan@livesesh.app" },
  { label: "Casey Kim", email: "student-casey@livesesh.app" },
  { label: "Morgan Davis", email: "student-morgan@livesesh.app" },
] as const;

const DEMO_TUTORS = [
  { label: "Kim (Tutor)", email: "demo@livesesh.app" },
  { label: "Nick (Tutor)", email: "tutor2@livesesh.app" },
] as const;

const DEMO_ROOM = "demo-room";

type AuthState = "signed_out" | "otp_sent" | "signed_in";

export function JoinForm({ onAuthChange }: { onAuthChange?: (signedIn: boolean) => void } = {}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("livesesh_displayName") ?? "" : ""
  );
  const [roomId, setRoomId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("livesesh_roomId") ?? DEMO_ROOM : DEMO_ROOM
  );
  const [role, setRole] = useState<RoomRole>(() =>
    (typeof window !== "undefined" ? localStorage.getItem("livesesh_role") as RoomRole : null) ?? "student"
  );

  // Session setup (tutor-only)
  const [subject, setSubject] = useState("");
  const [studentLevel, setStudentLevel] = useState("High School");

  // Auth state
  const [authState, setAuthState] = useState<AuthState>("signed_out");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setSignedInEmail(session.user.email);
        // Only set role from email if no stored role exists
        const storedRole = localStorage.getItem("livesesh_role") as RoomRole | null;
        if (!storedRole) {
          const isStudent = session.user.email.toLowerCase().includes("student");
          setRole(isStudent ? "student" : "tutor_preview");
        }
        setAuthState("signed_in");
      }
    });
  }, []);

  // Persist display name, room code, and role to localStorage
  useEffect(() => {
    if (displayName) localStorage.setItem("livesesh_displayName", displayName);
  }, [displayName]);
  useEffect(() => {
    if (roomId) localStorage.setItem("livesesh_roomId", roomId);
  }, [roomId]);
  useEffect(() => {
    localStorage.setItem("livesesh_role", role);
  }, [role]);

  // Note: onAuthChange fires only on explicit sign-in/sign-out actions,
  // never on restored sessions — restoring must not yank users off the landing page.

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
      ...(role === "tutor_preview" && subject ? { subject } : {}),
      ...(role === "tutor_preview" ? { level: studentLevel } : {}),
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
      // Auto-detect role: student emails contain "student", otherwise tutor
      const isStudent = email.toLowerCase().includes("student");
      setRole(isStudent ? "student" : "tutor_preview");
      setAuthState("signed_in");
      onAuthChange?.(true);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setAuthLoading(false);
    }
  };

  const demoSignIn = async (account: { label: string; email: string }, asRole: RoomRole) => {
    if (!DEMO_PASSWORD) {
      setAuthError("Demo accounts are not configured on this deployment.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: DEMO_PASSWORD,
      });
      if (error) throw error;
      setSignedInEmail(account.email);
      setRole(asRole);
      setDisplayName(account.label);
      setRoomId(DEMO_ROOM);
      setAuthState("signed_in");
      onAuthChange?.(true);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Demo sign-in failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    localStorage.removeItem("livesesh_displayName");
    localStorage.removeItem("livesesh_roomId");
    localStorage.removeItem("livesesh_role");
    setAuthState("signed_out");
    setSignedInEmail(null);
    setEmail("");
    setOtpCode("");
    setDisplayName("");
    setRoomId(DEMO_ROOM);
    onAuthChange?.(false);
  };

  // --- Auth screen ---
  if (authState !== "signed_in") {
    return (
      <div className="form-card stack">
        <div>
          <p className="eyebrow">Get Started</p>
          <h2>Sign up or sign in to begin.</h2>
        </div>

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

        <div className="divider-label"><span>or use a demo account</span></div>

        <fieldset className="fieldset">
          <legend>Quick demo login</legend>
          <p className="field-hint">
            One click signs you in with the right role — no password needed.
          </p>
          <div className="field" style={{ gap: 6 }}>
            <label>Join as a student</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DEMO_STUDENTS.map((account) => (
                <button
                  key={account.email}
                  className="ghost-button"
                  type="button"
                  disabled={authLoading}
                  style={{ padding: "8px 14px", fontSize: "0.85rem" }}
                  onClick={() => void demoSignIn(account, "student")}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ gap: 6, marginTop: 10 }}>
            <label>Join as a tutor</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DEMO_TUTORS.map((account) => (
                <button
                  key={account.email}
                  className="ghost-button"
                  type="button"
                  disabled={authLoading}
                  style={{ padding: "8px 14px", fontSize: "0.85rem" }}
                  onClick={() => void demoSignIn(account, "tutor_preview")}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
          {authLoading && <p className="field-hint">Signing in…</p>}
        </fieldset>

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
          list="room-suggestions"
        />
        <datalist id="room-suggestions">
          <option value="demo-room" />
        </datalist>
      </div>

      {role === "tutor_preview" && (
        <fieldset className="fieldset">
          <legend>Session setup</legend>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="subject">Subject</label>
            <input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Algebra, Biology"
            />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="student-level">Student level</label>
            <select
              id="student-level"
              value={studentLevel}
              onChange={(e) => setStudentLevel(e.target.value)}
            >
              {["Elementary", "Middle School", "High School", "College", "Graduate", "Professional"].map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>
        </fieldset>
      )}

      {role !== "tutor_preview" && (
        <p className="field-hint" style={{ marginTop: 4 }}>
          Joining as <strong>Student</strong> — your camera is shared with the tutor.
        </p>
      )}

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
