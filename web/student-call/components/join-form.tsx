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

const DEMO_STUDENTS = [
  { label: "Sarah Chen", email: "demo-student@livesesh.app", password: "DemoPass123!" },
  { label: "Alex Rivera", email: "student-alex@livesesh.app", password: "DemoPass123!" },
  { label: "Jordan Patel", email: "student-jordan@livesesh.app", password: "DemoPass123!" },
  { label: "Casey Kim", email: "student-casey@livesesh.app", password: "DemoPass123!" },
  { label: "Morgan Davis", email: "student-morgan@livesesh.app", password: "DemoPass123!" },
] as const;

const DEMO_TUTORS = [
  { label: "Kim (Tutor)", email: "demo@livesesh.app", password: "DemoPass123!" },
  { label: "Nick (Tutor)", email: "tutor2@livesesh.app", password: "DemoPass123!" },
] as const;

const DEMO_ROOM = "demo-room";

type AuthState = "signed_out" | "otp_sent" | "signed_in";

export function JoinForm({ onAuthChange }: { onAuthChange?: (signedIn: boolean) => void } = {}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [roomId, setRoomId] = useState(createRoomId);
  const [role, setRole] = useState<RoomRole>("student");

  // Session setup (tutor-only)
  const [subject, setSubject] = useState("");
  const [studentLevel, setStudentLevel] = useState("High School");
  const [coachingSensitivity, setCoachingSensitivity] = useState("medium");

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
        const isStudent = session.user.email.toLowerCase().includes("student");
        setRole(isStudent ? "student" : "tutor_preview");
        setAuthState("signed_in");
      }
    });
  }, []);

  // Notify parent of auth changes
  useEffect(() => {
    onAuthChange?.(authState === "signed_in");
  }, [authState, onAuthChange]);

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
      ...(role === "tutor_preview" ? { level: studentLevel, sensitivity: coachingSensitivity } : {}),
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
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setAuthLoading(false);
    }
  };

  const demoSignIn = async (account: { label: string; email: string; password: string }, asRole: RoomRole) => {
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
      setRole(asRole);
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
          <legend>Quick demo login</legend>
          <p className="field-hint">
            Select a name to sign in instantly with the correct role.
          </p>
          <div className="demo-dropdowns">
            <div className="demo-select-group">
              <label htmlFor="demo-student">Student</label>
              <select
                id="demo-student"
                disabled={authLoading}
                defaultValue=""
                onChange={(e) => {
                  const account = DEMO_STUDENTS.find((a) => a.email === e.target.value);
                  if (account) void demoSignIn(account, "student");
                  e.target.value = "";
                }}
              >
                <option value="" disabled>Choose student...</option>
                {DEMO_STUDENTS.map((account) => (
                  <option key={account.email} value={account.email}>{account.label}</option>
                ))}
              </select>
            </div>
            <div className="demo-select-group">
              <label htmlFor="demo-tutor">Tutor</label>
              <select
                id="demo-tutor"
                disabled={authLoading}
                defaultValue=""
                onChange={(e) => {
                  const account = DEMO_TUTORS.find((a) => a.email === e.target.value);
                  if (account) void demoSignIn(account, "tutor_preview");
                  e.target.value = "";
                }}
              >
                <option value="" disabled>Choose tutor...</option>
                {DEMO_TUTORS.map((account) => (
                  <option key={account.email} value={account.email}>{account.label}</option>
                ))}
              </select>
            </div>
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
          <div className="field">
            <label>Coaching sensitivity</label>
            <div className="segment-row">
              {[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`segment-btn ${coachingSensitivity === opt.value ? "active" : ""}`}
                  onClick={() => setCoachingSensitivity(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
