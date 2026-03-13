"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const DEMO_ACCOUNTS = [
  { label: "Kim", email: "demo@livesesh.app", password: "DemoPass123!" },
  { label: "Nick", email: "tutor2@livesesh.app", password: "DemoPass123!" },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/dashboard");
      } else {
        setCheckingSession(false);
      }
    });
  }, [router, supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      router.replace("/dashboard");
    }
  }

  async function handleDemoLogin(account: (typeof DEMO_ACCOUNTS)[number]) {
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });

    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      router.replace("/dashboard");
    }
  }

  if (checkingSession) {
    return (
      <div className="auth-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>LiveSesh</h1>
        <p className="subtitle">Tutor Analytics Dashboard</p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="tutor@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ marginTop: 4 }}>
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </form>

        <div className="divider-label">Quick Demo</div>

        <div className="demo-grid">
          {DEMO_ACCOUNTS.map((acct) => (
            <button
              key={acct.email}
              className="demo-btn"
              disabled={loading}
              onClick={() => handleDemoLogin(acct)}
            >
              {acct.label}
            </button>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  );
}
