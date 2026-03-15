"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JoinForm } from "@/components/join-form";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function HomePage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setSignedIn(true);
      }
      setChecked(true);
    });
  }, []);

  const handleAuthChange = useCallback((isSignedIn: boolean) => {
    setSignedIn(isSignedIn);
    if (isSignedIn) {
      router.push("/dashboard");
    }
  }, [router]);

  if (!checked) return null;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">LiveSesh AI</p>
          <h1>Master skills with real-time clarity.</h1>
          <p className="lede">
            AI-powered engagement analysis for live tutoring sessions.
            Real-time coaching nudges, eye contact tracking, and session
            analytics — wrapped in a friendly interface.
          </p>
          <div className="hero-grid">
            <article className="info-card">
              <h2>For tutors</h2>
              <p>
                See real-time engagement metrics, receive contextual coaching
                nudges, and review session analytics to improve over time.
              </p>
            </article>
            <article className="info-card">
              <h2>For students</h2>
              <p>
                Just join the call normally. Your camera and audio are shared
                with the tutor. Engagement analysis runs on the tutor side.
              </p>
            </article>
          </div>
          {signedIn && (
            <button className="primary-button" style={{ marginTop: 16 }} onClick={() => router.push("/dashboard")}>
              Go to Dashboard →
            </button>
          )}
        </div>
        <JoinForm onAuthChange={handleAuthChange} />
      </section>
    </main>
  );
}
