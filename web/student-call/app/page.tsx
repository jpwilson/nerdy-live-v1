"use client";

import { useCallback, useState } from "react";
import { JoinForm } from "@/components/join-form";
import { TutorDashboard } from "@/components/tutor-dashboard";

export default function HomePage() {
  const [signedIn, setSignedIn] = useState(false);

  const handleAuthChange = useCallback((isSignedIn: boolean) => {
    setSignedIn(isSignedIn);
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        {signedIn ? (
          <div className="hero-copy">
            <TutorDashboard />
          </div>
        ) : (
          <div className="hero-copy">
            <p className="eyebrow">LiveSesh</p>
            <h1>Join your tutoring session.</h1>
            <p className="lede">
              Sign in and join the room to connect with your tutor. Your video
              and audio are shared over a peer-to-peer WebRTC connection while
              the tutor&apos;s app analyzes engagement in real time.
            </p>
            <div className="hero-grid">
              <article className="info-card">
                <h2>For students</h2>
                <p>
                  Camera and microphone are shared with the tutor. Engagement
                  analysis runs on the tutor side — you just have a normal call.
                </p>
              </article>
              <article className="info-card">
                <h2>For evaluators</h2>
                <p>
                  Use the <strong>Demo Student</strong> or{" "}
                  <strong>Demo Tutor</strong> buttons to instantly join the demo
                  room and test the full call flow.
                </p>
              </article>
            </div>
          </div>
        )}
        <JoinForm onAuthChange={handleAuthChange} />
      </section>
    </main>
  );
}
