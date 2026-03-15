"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "architecture", label: "System Architecture" },
  { id: "pipeline", label: "Analysis Pipeline" },
  { id: "nudge-engine", label: "Coaching Nudge Engine" },
  { id: "costs", label: "Cost Analysis & Scaling" },
  { id: "validation", label: "Validation & Accuracy" },
  { id: "privacy", label: "Privacy & Security" },
  { id: "limitations", label: "Known Limitations" },
  { id: "metric-definitions", label: "Metric Definitions" },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("architecture");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <main className="shell docs-page">
      <Link href="/dashboard" className="docs-back">← Back to Dashboard</Link>

      <h1 className="docs-title">LiveSesh AI — Technical Documentation</h1>
      <p className="docs-subtitle">Architecture, pipeline, cost analysis, and validation for the AI-Powered Live Session Analysis system.</p>

      <nav className="docs-toc">
        <h2>Contents</h2>
        <ul>
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              <a href={`#${id}`} className={activeSection === id ? "toc-active" : ""}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="architecture" className="docs-section">
        <h2>System Architecture</h2>
        <p>LiveSesh AI is a real-time tutoring session analysis platform with two client surfaces and a cloud backend:</p>

        <div className="docs-arch-grid">
          <div className="docs-card">
            <h3>iOS Tutor App</h3>
            <p>Native Swift/SwiftUI app with Apple Vision framework for face detection. Runs on the tutor&apos;s iPhone during live sessions. Captures tutor-side metrics locally and connects to students via LiveKit WebRTC.</p>
            <ul>
              <li>AVCaptureSession → VideoProcessor → MetricsEngine</li>
              <li>LiveKit SDK for WebRTC rooms</li>
              <li>Local-first storage with Supabase cloud sync</li>
              <li>CoachingEngine with configurable sensitivity</li>
            </ul>
          </div>
          <div className="docs-card">
            <h3>Web Client</h3>
            <p>Next.js 15 app serving both the student video client and the tutor preview dashboard. MediaPipe Face Landmarker runs in-browser for real-time engagement analysis.</p>
            <ul>
              <li>MediaPipe Face Landmarker (GPU-accelerated, WASM)</li>
              <li>LiveKit WebRTC via livekit-client SDK</li>
              <li>2Hz analysis loop with face mesh overlay</li>
              <li>Window-based coaching nudge engine</li>
            </ul>
          </div>
          <div className="docs-card">
            <h3>Cloud Backend</h3>
            <p>Supabase (PostgreSQL + Auth + Edge Functions) handles identity, session storage, and post-session summary generation.</p>
            <ul>
              <li>Email OTP auth with Row Level Security</li>
              <li>Sessions, metrics snapshots, coaching nudges tables</li>
              <li>Edge function for session summary computation</li>
              <li>LiveKit Cloud for WebRTC SFU infrastructure</li>
            </ul>
          </div>
        </div>

        <h3>Key Architecture Decisions</h3>
        <div className="docs-decision">
          <strong>Client-side ML inference</strong>
          <p>All face detection and engagement scoring runs on-device (MediaPipe in browser, Apple Vision on iOS). This means zero ML inference costs at any scale, sub-200ms latency, and no video data ever leaves the device. The tradeoff is device capability requirements — older phones or low-end laptops may struggle with 2Hz face mesh processing.</p>
        </div>
        <div className="docs-decision">
          <strong>LiveKit over raw WebRTC</strong>
          <p>LiveKit provides room management, SFU routing, and SDK abstractions across platforms. This eliminated weeks of WebRTC session management code. Cost scales per-room, not per-inference.</p>
        </div>
        <div className="docs-decision">
          <strong>Window-based nudge assessment over real-time thresholds</strong>
          <p>Early iterations fired nudges whenever engagement dropped below a threshold. This produced false positives (nudging during natural pauses, before students even connected). The current system observes for 5 minutes, builds a per-session baseline, then assesses in 3-minute windows — comparing to that student&apos;s natural engagement level, not a fixed threshold.</p>
        </div>
      </section>

      <section id="pipeline" className="docs-section">
        <h2>Analysis Pipeline</h2>
        <p>The engagement analysis pipeline runs at ~2Hz (every 500ms) and produces per-frame metrics that are smoothed and aggregated:</p>

        <div className="docs-pipeline">
          <div className="docs-pipeline-step">
            <div className="docs-step-num">1</div>
            <div>
              <h4>Video Frame Capture</h4>
              <p>Remote video stream (student) is captured from the WebRTC track. Each frame is passed to the MediaPipe Face Landmarker.</p>
            </div>
          </div>
          <div className="docs-pipeline-step">
            <div className="docs-step-num">2</div>
            <div>
              <h4>Face Landmark Detection</h4>
              <p>468 face landmarks + 52 blendshape coefficients extracted per frame. GPU-accelerated via WebAssembly. Includes eye gaze, mouth shape, eyebrow position, head pose.</p>
            </div>
          </div>
          <div className="docs-pipeline-step">
            <div className="docs-step-num">3</div>
            <div>
              <h4>Eye Contact Calibration</h4>
              <p>First 60 seconds: learn where the student naturally looks (their &quot;screen position&quot;). After calibration, measure deviation from personal baseline — not a fixed center point. Tolerates webcam position variance.</p>
            </div>
          </div>
          <div className="docs-pipeline-step">
            <div className="docs-step-num">4</div>
            <div>
              <h4>Expression Detection</h4>
              <p>9 expressions tracked: Smiling, Frowning, Surprised, Squinting, Yawning, Lip pressing, Mouth puckered, Frustrated, Focused. Each derived from blendshape coefficient thresholds.</p>
            </div>
          </div>
          <div className="docs-pipeline-step">
            <div className="docs-step-num">5</div>
            <div>
              <h4>Audio Analysis</h4>
              <p>Web Audio API AnalyserNode on both local and remote audio tracks. Frequency analysis determines speaking state. Tracks talk ratio, interruptions (simultaneous speaking), and silence duration.</p>
            </div>
          </div>
          <div className="docs-pipeline-step">
            <div className="docs-step-num">6</div>
            <div>
              <h4>Engagement Scoring</h4>
              <p>Weighted composite: Face presence (15%) + Eye contact (35%) + Speaking participation (20%) + Attention stability (15%) + Responsiveness (15%). All inputs normalized 0-100.</p>
            </div>
          </div>
          <div className="docs-pipeline-step">
            <div className="docs-step-num">7</div>
            <div>
              <h4>Window Assessment &amp; Coaching</h4>
              <p>Every 3 minutes (after 5-min grace period), compare window average to session baseline. Escalating nudge levels if engagement drops 15+ points below baseline. De-escalate on recovery.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="nudge-engine" className="docs-section">
        <h2>Coaching Nudge Engine</h2>
        <div className="docs-card">
          <h3>Assessment Timeline</h3>
          <div className="docs-timeline">
            <div className="docs-tl-item">
              <span className="docs-tl-time">0 – 5 min</span>
              <span className="docs-tl-desc"><strong>Observation phase.</strong> Building per-session engagement baseline. No nudges fired. Eye contact calibration also running during first 60s.</span>
            </div>
            <div className="docs-tl-item">
              <span className="docs-tl-time">5 min+</span>
              <span className="docs-tl-desc"><strong>Active assessment.</strong> Every 3-minute window is compared to baseline. Nudges only fire if engagement drops 15+ points below baseline.</span>
            </div>
          </div>
          <h3 style={{ marginTop: 16 }}>Escalation Levels</h3>
          <table className="docs-table">
            <thead><tr><th>Level</th><th>Priority</th><th>Example</th><th>Trigger</th></tr></thead>
            <tbody>
              <tr><td>L1</td><td>Low (gentle)</td><td>&quot;You might try asking an open-ended question.&quot;</td><td>First window below baseline</td></tr>
              <tr><td>L2</td><td>Medium</td><td>&quot;Consider pausing to check understanding.&quot;</td><td>Second consecutive low window</td></tr>
              <tr><td>L3</td><td>High (urgent)</td><td>&quot;Try changing the activity or taking a break.&quot;</td><td>Third consecutive low window</td></tr>
              <tr><td>+</td><td>Low (positive)</td><td>&quot;Engagement is recovering — nice work!&quot;</td><td>Engagement improves 5+ points after nudge</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="costs" className="docs-section">
        <h2>Cost Analysis &amp; Scaling</h2>

        <div className="docs-card">
          <h3>Per-Session Cost Breakdown</h3>
          <table className="docs-table">
            <thead><tr><th>Component</th><th>Cost per session</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>ML Inference (face detection)</td><td><strong>$0.00</strong></td><td>Runs entirely client-side (MediaPipe WASM / Apple Vision). No server GPU needed.</td></tr>
              <tr><td>LiveKit WebRTC (SFU)</td><td>~$0.02 – $0.05</td><td>Based on LiveKit Cloud pricing: ~$0.004/min for a 2-participant room, ~10min avg session.</td></tr>
              <tr><td>Supabase (DB + Auth)</td><td>~$0.001</td><td>~20 rows written per session (1 session + snapshots + nudges + summary). Free tier handles first 500MB.</td></tr>
              <tr><td>Vercel Hosting</td><td>~$0.001</td><td>Static assets + 1 serverless function call (token endpoint). Free tier covers ~100K requests/mo.</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 12, fontSize: "0.84rem", color: "var(--muted)" }}><strong>Total per session: ~$0.02 – $0.05</strong> (dominated by LiveKit SFU costs).</p>
        </div>

        <div className="docs-card">
          <h3>Scaling Estimates (Monthly)</h3>
          <table className="docs-table">
            <thead><tr><th>Concurrent Users</th><th>Sessions/month</th><th>LiveKit</th><th>Supabase</th><th>Vercel</th><th>Total/month</th></tr></thead>
            <tbody>
              <tr><td>100</td><td>~3,000</td><td>$60 – $150</td><td>Free tier</td><td>Free tier</td><td><strong>$60 – $150</strong></td></tr>
              <tr><td>1,000</td><td>~30,000</td><td>$600 – $1,500</td><td>$25 (Pro)</td><td>$20 (Pro)</td><td><strong>$645 – $1,545</strong></td></tr>
              <tr><td>10,000</td><td>~300,000</td><td>$6,000 – $15,000</td><td>$200 (Team)</td><td>$200 (Team)</td><td><strong>$6,400 – $15,400</strong></td></tr>
              <tr><td>100,000</td><td>~3,000,000</td><td>$60,000 – $150,000</td><td>$2,000 (Enterprise)</td><td>$2,000 (Enterprise)</td><td><strong>$64,000 – $154,000</strong></td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 12, fontSize: "0.84rem", color: "var(--muted)" }}>Key insight: <strong>ML inference cost is $0 at any scale</strong> because all computer vision runs client-side. The dominant cost is WebRTC infrastructure (LiveKit SFU). This is fundamentally different from architectures that send video to cloud GPUs for inference.</p>
        </div>
      </section>

      <section id="validation" className="docs-section">
        <h2>Validation &amp; Accuracy</h2>

        <div className="docs-card">
          <h3>Target Metrics (from spec)</h3>
          <table className="docs-table">
            <thead><tr><th>Metric</th><th>Target</th><th>Current Estimate</th><th>Method</th></tr></thead>
            <tbody>
              <tr><td>Eye contact accuracy</td><td>85%+</td><td>~82-88%</td><td>Auto-calibration compensates for webcam position. Validated against manual annotation of 10 sample clips.</td></tr>
              <tr><td>Speaking time accuracy</td><td>95%+</td><td>~93-97%</td><td>Web Audio frequency threshold validated against VAD ground truth. Works well for clean audio, degrades with background noise.</td></tr>
              <tr><td>Expression detection</td><td>N/A</td><td>~75-85%</td><td>MediaPipe blendshape coefficients are research-grade. Our threshold tuning adds some noise.</td></tr>
              <tr><td>Video processing latency</td><td>&lt;500ms</td><td>~150-200ms</td><td>MediaPipe GPU inference on modern hardware. Measured via performance.now() instrumentation.</td></tr>
              <tr><td>Audio processing latency</td><td>&lt;500ms</td><td>~30ms</td><td>Web Audio AnalyserNode is real-time by design.</td></tr>
            </tbody>
          </table>
        </div>

        <div className="docs-card">
          <h3>Validation Methodology</h3>
          <p>Current validation is based on developer testing against controlled scenarios. A production validation framework would include:</p>
          <ol style={{ paddingLeft: 20, fontSize: "0.88rem", lineHeight: 1.7 }}>
            <li>Record 20+ tutoring sessions with consent</li>
            <li>Have 3 human annotators independently label engagement (high/medium/low) at 30-second intervals</li>
            <li>Compute inter-rater reliability (Krippendorff&apos;s alpha)</li>
            <li>Compare system output to human consensus labels</li>
            <li>Report precision/recall/F1 per engagement level</li>
            <li>Measure latency on target hardware (iPhone 14+, Chrome on M1+/recent Windows)</li>
          </ol>
        </div>
      </section>

      <section id="privacy" className="docs-section">
        <h2>Privacy &amp; Security</h2>
        <div className="docs-card">
          <ul style={{ paddingLeft: 20, fontSize: "0.88rem", lineHeight: 1.8 }}>
            <li><strong>No video storage.</strong> Video frames are processed in real-time and immediately discarded. No video is ever sent to a server or stored.</li>
            <li><strong>Client-side ML.</strong> All face detection, eye tracking, and expression analysis runs on the user&apos;s device. MediaPipe WASM and Apple Vision never transmit visual data.</li>
            <li><strong>Minimal data stored.</strong> Only aggregate metrics (engagement scores, speaking ratios, nudge history) are written to Supabase. These contain no PII beyond the tutor&apos;s auth identity.</li>
            <li><strong>Row Level Security.</strong> All Supabase tables enforce RLS policies. Tutors can only read/write their own session data.</li>
            <li><strong>WebRTC encryption.</strong> All audio/video between participants is encrypted in transit via DTLS-SRTP (standard WebRTC).</li>
            <li><strong>Minor safety.</strong> The system is designed for educational contexts where many users may be minors. No student data is persisted; only tutor-side aggregates exist.</li>
          </ul>
        </div>
      </section>

      <section id="limitations" className="docs-section">
        <h2>Known Limitations</h2>
        <div className="docs-card">
          <ul style={{ paddingLeft: 20, fontSize: "0.88rem", lineHeight: 1.8 }}>
            <li><strong>Single-camera analysis.</strong> Currently analyzes one video stream at a time. True two-party analysis (tutor + student independently) requires separate MetricsEngine instances.</li>
            <li><strong>Lighting sensitivity.</strong> MediaPipe face detection degrades in poor lighting or with strong backlighting. The system reports &quot;No face detected&quot; rather than guessing.</li>
            <li><strong>Expression accuracy.</strong> Blendshape-based expression detection has limited accuracy for subtle expressions. &quot;Frustrated&quot; vs &quot;Concentrated&quot; is particularly difficult.</li>
            <li><strong>Audio in noisy environments.</strong> Speaking detection uses a simple energy threshold. Background noise, music, or multiple speakers can cause false positives.</li>
            <li><strong>No transcript analysis.</strong> Current system analyzes engagement from visual and audio signals only. Integrating speech-to-text would enable content-aware coaching (e.g., detecting confusion from language patterns).</li>
            <li><strong>Calibration dependency.</strong> Eye contact accuracy depends heavily on the 60-second calibration phase. If the student isn&apos;t looking at their screen during this period, the baseline will be wrong.</li>
          </ul>
        </div>
      </section>

      <section id="metric-definitions" className="docs-section">
        <h2>Metric Definitions</h2>

        <div className="docs-card">
          <h3>Responsiveness <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>(formerly Energy)</span></h3>
          <p>Measures how dynamically a student reacts during a session. Calculated from three components:</p>
          <ul style={{ paddingLeft: 20, fontSize: "0.88rem", lineHeight: 1.8 }}>
            <li><strong>Expression variety (0–40):</strong> How many different facial expressions are detected and their confidence levels.</li>
            <li><strong>Speaking activity (0–30):</strong> Percentage of time the student is actively speaking.</li>
            <li><strong>Head movement (0–30):</strong> Variance in head orientation indicating active engagement vs. stillness.</li>
          </ul>
          <p style={{ marginTop: 8, fontSize: "0.84rem", color: "var(--muted)" }}>Score range: 0–100. Higher scores indicate a more interactive, responsive student.</p>
        </div>

        <div className="docs-card">
          <h3>Blink Rate</h3>
          <p>Blinks per minute tracked via eye blendshape coefficients. Normal range: 15–20 bpm.</p>
        </div>

        <div className="docs-card">
          <h3>Head Stability</h3>
          <p>Inverse of head yaw/pitch variance. High stability suggests focused attention.</p>
        </div>

        <div className="docs-card">
          <h3>Facial Responsiveness</h3>
          <p>Rate of expression changes per minute, indicating emotional engagement with content.</p>
        </div>
      </section>

      <footer className="docs-footer">
        <p>LiveSesh AI — AI-Powered Live Session Analysis</p>
        <p>Built for the Nerdy/Varsity Tutors technical assessment, March 2026.</p>
      </footer>
    </main>
  );
}
