import { JoinForm } from "@/components/join-form";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">LiveSesh Student Surface</p>
          <h1>Join the tutoring room from a browser.</h1>
          <p className="lede">
            This app is the student-side video client. The call stays simple for
            the student while the tutor-facing iPhone app can analyze the
            incoming stream and surface coaching.
          </p>
          <div className="hero-grid">
            <article className="info-card">
              <h2>What this handles</h2>
              <p>
                Camera, microphone, room join, remote tutor video, and WebRTC
                signaling over Supabase Realtime.
              </p>
            </article>
            <article className="info-card">
              <h2>Why there is a browser fallback</h2>
              <p>
                Until the iOS app is wired to the same signaling protocol, a
                second browser can join in <strong>Tutor preview</strong> mode
                to rehearse the full call loop.
              </p>
            </article>
          </div>
        </div>
        <JoinForm />
      </section>
    </main>
  );
}
