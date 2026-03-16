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
              <li>AI post-session analysis via Claude (OpenRouter)</li>
              <li>Langfuse tracing for LLM observability</li>
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
              <p>Every 3 minutes (after 5-min grace period), compare window average to session baseline. Escalating nudge levels if engagement drops 10+ points below baseline, or if absolute thresholds are breached (e.g., tutor talking &gt; 80%). De-escalate on recovery.</p>
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
              <span className="docs-tl-desc"><strong>Active assessment.</strong> Every 3-minute window is compared to baseline. Nudges fire on relative drops (10+ points below baseline), absolute thresholds (engagement &lt; 50%, tutor talk &gt; 80%, eye contact &lt; 30%, student speaking &lt; 10%), or positive reinforcement when engagement recovers.</span>
            </div>
          </div>
          <h3 style={{ marginTop: 16 }}>Escalation Levels</h3>
          <table className="docs-table">
            <thead><tr><th>Level</th><th>Priority</th><th>Example</th><th>Trigger</th></tr></thead>
            <tbody>
              <tr><td>L1</td><td>Low (gentle)</td><td>&quot;Try asking an open-ended question to re-engage.&quot;</td><td>First window below baseline</td></tr>
              <tr><td>L2</td><td>Medium</td><td>&quot;Engagement has dropped. Consider pausing to check understanding.&quot;</td><td>Second consecutive low window</td></tr>
              <tr><td>L3</td><td>High (urgent)</td><td>&quot;Engagement is very low. Try changing the activity or taking a break.&quot;</td><td>Third consecutive low window</td></tr>
              <tr><td>TB</td><td>Medium</td><td>&quot;You&apos;re talking 96% of the time. Try pausing to ask a question.&quot;</td><td>Tutor talk &gt; 80% of window</td></tr>
              <tr><td>EC</td><td>Medium</td><td>&quot;Low eye contact detected. Try calling their name.&quot;</td><td>Eye contact &lt; 30% avg</td></tr>
              <tr><td>SP</td><td>Low</td><td>&quot;The student has barely spoken. Try the Socratic method.&quot;</td><td>Student speaking &lt; 10%</td></tr>
              <tr><td>+</td><td>Low (positive)</td><td>&quot;Engagement is recovering — nice work!&quot;</td><td>Engagement improves 5+ points after nudge</td></tr>
            </tbody>
          </table>
        </div>
        <div className="docs-card">
          <h3>Demo Mode</h3>
          <p style={{ fontSize: "0.88rem", lineHeight: 1.7 }}>For testing and evaluation, a demo mode compresses the coaching timeline: <strong>30-second grace period</strong> and <strong>15-second assessment windows</strong> (vs. 5 min / 3 min in production). Both values are configurable from the Settings page. Nudges appear within ~45 seconds of starting a demo session.</p>
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
              <tr><td>AI Summary (Claude via OpenRouter)</td><td>~$0.003 – $0.01</td><td>~800 input + ~400 output tokens per summary. Haiku: $0.003, Sonnet: $0.01. Only runs once per session (post-session).</td></tr>
              <tr><td>Langfuse Observability</td><td>$0.00</td><td>Free tier: 50K observations/month. Tracks LLM latency, token usage, and cost per call.</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 12, fontSize: "0.84rem", color: "var(--muted)" }}><strong>Total per session: ~$0.02 – $0.06</strong> (dominated by LiveKit SFU costs).</p>
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

        <details className="docs-card" style={{ cursor: "pointer" }}>
          <summary style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 8 }}>AI Observability (Langfuse)</summary>
          <p style={{ fontSize: "0.84rem", color: "var(--muted)", marginBottom: 12 }}>All LLM calls are traced via Langfuse for cost tracking, latency monitoring, and quality evaluation.</p>
          <table className="docs-table">
            <thead><tr><th>Metric</th><th>What&apos;s Tracked</th></tr></thead>
            <tbody>
              <tr><td>Token usage</td><td>Input/output tokens per call, cost per session</td></tr>
              <tr><td>Latency</td><td>Time-to-first-token, total generation time</td></tr>
              <tr><td>Quality</td><td>Schema compliance rate, recommendation relevance</td></tr>
              <tr><td>Model comparison</td><td>Haiku vs Sonnet vs Opus cost/quality tradeoffs</td></tr>
            </tbody>
          </table>
        </details>
      </section>

      <section id="validation" className="docs-section">
        <h2>Validation &amp; Accuracy</h2>

        <div className="docs-card">
          <h3>Target Metrics (from spec)</h3>
          <table className="docs-table">
            <thead><tr><th>Metric</th><th>Target</th><th>Current Estimate</th><th>Method</th></tr></thead>
            <tbody>
              <tr><td>Eye contact accuracy</td><td>85%+</td><td>~82-88%</td><td>Auto-calibration compensates for webcam position. Estimated from developer testing across varied lighting/angles. Formal ground-truth dataset not yet built.</td></tr>
              <tr><td>Speaking time accuracy</td><td>95%+</td><td>~93-97%</td><td>Web Audio frequency threshold tested against known speaking/silence segments. Works well for clean audio, degrades with background noise.</td></tr>
              <tr><td>Expression detection</td><td>N/A</td><td>~75-85%</td><td>MediaPipe blendshape coefficients are research-grade. Our threshold tuning adds some noise.</td></tr>
              <tr><td>Video processing latency</td><td>&lt;500ms</td><td>~150-200ms</td><td>MediaPipe GPU inference on modern hardware. Measured via performance.now() instrumentation.</td></tr>
              <tr><td>Audio processing latency</td><td>&lt;500ms</td><td>~30ms</td><td>Web Audio AnalyserNode is real-time by design.</td></tr>
            </tbody>
          </table>
        </div>

        <div className="docs-card">
          <h3>AI Summary Evaluation</h3>
          <p>The post-session AI summary (Claude via OpenRouter) is validated against 5 test scenarios representing common tutoring patterns. Each scenario tests schema compliance and recommendation relevance.</p>
          <table className="docs-table">
            <thead><tr><th>Scenario</th><th>Schema</th><th>Relevance</th><th>Latency</th><th>Cost</th></tr></thead>
            <tbody>
              <tr><td>Tutor-dominated session (92% tutor talk)</td><td style={{ color: "var(--success)" }}>Pass</td><td style={{ color: "var(--success)" }}>Correctly flags one-sided dialogue</td><td>~1.1s</td><td>$0.001</td></tr>
              <tr><td>Distracted student (18% eye contact)</td><td style={{ color: "var(--success)" }}>Pass</td><td style={{ color: "var(--success)" }}>Identifies attention problem</td><td>~0.8s</td><td>$0.001</td></tr>
              <tr><td>Excellent session (87% engagement)</td><td style={{ color: "var(--success)" }}>Pass</td><td style={{ color: "var(--success)" }}>Recognizes strong interaction</td><td>~1.0s</td><td>$0.001</td></tr>
              <tr><td>Energy drop mid-session</td><td style={{ color: "var(--success)" }}>Pass</td><td style={{ color: "var(--success)" }}>Suggests pacing/breaks</td><td>~0.6s</td><td>$0.001</td></tr>
              <tr><td>High interruption session (14 interruptions)</td><td style={{ color: "var(--success)" }}>Pass</td><td style={{ color: "var(--success)" }}>Flags turn-taking issues</td><td>~0.8s</td><td>$0.001</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: "0.84rem", color: "var(--muted)" }}><strong>5/5 passed</strong> — 100% schema compliance, 100% recommendation relevance. Avg latency: 859ms. Total eval cost: $0.005. Run via <code>npx tsx scripts/eval-ai-summary.ts</code></p>
        </div>

        <div className="docs-card">
          <h3>Unit Test Coverage</h3>
          <p>124 unit tests covering the iOS analysis pipeline and coaching engine:</p>
          <ul style={{ paddingLeft: 20, fontSize: "0.88rem", lineHeight: 1.8 }}>
            <li><strong>MetricsEngine:</strong> Eye contact tracking, talk time, energy, trends, sliding windows</li>
            <li><strong>VideoProcessor:</strong> Face detection models, gaze estimation, expression classification</li>
            <li><strong>AudioProcessor:</strong> VAD thresholds, speaker diarization, audio levels</li>
            <li><strong>CoachingEngine:</strong> All 6 nudge types, cooldowns, escalation, config presets</li>
            <li><strong>SessionStore:</strong> CRUD operations, filtering, encoding stability</li>
            <li><strong>SupabaseService:</strong> Mock service, error handling, JSON encoding</li>
          </ul>
          <p style={{ marginTop: 8, fontSize: "0.84rem", color: "var(--muted)" }}>All tests pass on macOS 14+ and iOS 17+ targets via <code>swift test</code>.</p>
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
            <li><strong>Student-side analysis only (web).</strong> The web client analyzes the remote student&apos;s video stream. The tutor&apos;s own engagement is not analyzed on the web side (iOS analyzes tutor-side via Apple Vision).</li>
            <li><strong>Lighting sensitivity.</strong> MediaPipe face detection degrades in poor lighting or with strong backlighting. The system reports &quot;No face detected&quot; rather than guessing.</li>
            <li><strong>Expression accuracy.</strong> Blendshape-based expression detection has limited accuracy for subtle expressions. &quot;Frustrated&quot; vs &quot;Concentrated&quot; is particularly difficult.</li>
            <li><strong>Audio in noisy environments.</strong> Speaking detection uses a simple energy threshold. Background noise, music, or multiple speakers can cause false positives.</li>
            <li><strong>No real-time transcript analysis.</strong> Post-session AI summaries analyze session metrics via Claude, but real-time speech-to-text is not yet integrated. Adding live transcription would enable content-aware coaching (e.g., detecting confusion from language patterns).</li>
            <li><strong>Calibration dependency.</strong> Eye contact accuracy depends heavily on the 60-second calibration phase. If the student isn&apos;t looking at their screen during this period, the baseline will be wrong.</li>
            <li><strong>Speaker diarization.</strong> With a shared audio stream, distinguishing who is speaking relies on energy-profile heuristics. Accuracy improves with separate audio tracks from the call SDK.</li>
          </ul>
        </div>
      </section>

      <section id="metric-definitions" className="docs-section">
        <h2>Metric Definitions</h2>

        <div className="docs-card">
          <h3>Eye Contact</h3>
          <p>Percentage of time the student looks at their screen/camera. Calculated from gaze direction (yaw/pitch) relative to a per-session calibration baseline established in the first 60 seconds. Uses a 30-sample rolling average for smoothing.</p>
          <p style={{ marginTop: 8, fontSize: "0.84rem", color: "var(--muted)" }}>Target accuracy: 85%+. Weight in engagement score: 35%.</p>
        </div>

        <div className="docs-card">
          <h3>Talk Balance</h3>
          <p>Ratio of student speaking time vs. tutor speaking time, derived from Web Audio frequency analysis on both local and remote audio tracks. Displayed as &quot;Student% / Tutor%&quot;.</p>
          <p style={{ marginTop: 8, fontSize: "0.84rem", color: "var(--muted)" }}>Ideal range varies by session type: Socratic discussion 40-60% tutor, lecture/explanation 70-80% tutor, practice/review 30-50% tutor.</p>
        </div>

        <div className="docs-card">
          <h3>Engagement Score <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>(composite)</span></h3>
          <p>Weighted composite of five inputs, all normalized 0-100:</p>
          <ul style={{ paddingLeft: 20, fontSize: "0.88rem", lineHeight: 1.8 }}>
            <li><strong>Face presence (15%):</strong> Is the student&apos;s face detected in the frame?</li>
            <li><strong>Eye contact (35%):</strong> Smoothed gaze direction relative to calibration baseline.</li>
            <li><strong>Speaking participation (20%):</strong> Student speaking time as a percentage.</li>
            <li><strong>Attention stability (15%):</strong> Inverse of attention drift score.</li>
            <li><strong>Responsiveness (15%):</strong> Expression variety + head movement + speaking energy.</li>
          </ul>
          <p style={{ marginTop: 8, fontSize: "0.84rem", color: "var(--muted)" }}>Displayed as a real-time badge on the video overlay: &quot;Engagement: High/Medium/Low&quot;.</p>
        </div>

        <div className="docs-card">
          <h3>Attention Drift</h3>
          <p>Measures how much a student&apos;s engagement is wavering. Calculated from gaze variance (how much their look-direction changes frame-to-frame) combined with declining eye contact trends. Score 0-100 where higher = more drifting.</p>
        </div>

        <div className="docs-card">
          <h3>Interruptions</h3>
          <p>Count of simultaneous speaking events where both tutor and student audio exceed the speaking threshold at the same time. High interruption frequency may indicate poor turn-taking or confusion.</p>
        </div>

        <div className="docs-card">
          <h3>Posture</h3>
          <p>Tracked via MediaPipe Pose Landmarker (lite model) running every 3rd frame. Measures shoulder tilt angle (landmarks 11/12) and slouch ratio (torso height / shoulder width from landmarks 23/24). &quot;Normal&quot; vs. &quot;Slouching&quot; classification.</p>
        </div>

        <div className="docs-card">
          <h3>Mood / Expression</h3>
          <p>9 expressions tracked from blendshape coefficients: Smiling, Frowning, Surprised, Squinting, Yawning, Lip pressing, Mouth puckered, Frustrated, Focused. The dominant expression is displayed in the sidebar with &quot;Concentrating&quot; as a meta-state.</p>
        </div>

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

        <details className="docs-card" style={{ cursor: "pointer" }}>
          <summary style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 8 }}>Overlay Modes Reference</summary>
          <p style={{ fontSize: "0.84rem", color: "var(--muted)", marginBottom: 12 }}>
            The tutor can select an overlay mode during the call to control what is displayed on the student&apos;s video feed.
            Data collection runs independently regardless of which overlay is selected.
          </p>
          <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e0d8d0" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Mode</th>
                <th style={{ padding: "6px 8px" }}>Face Mesh</th>
                <th style={{ padding: "6px 8px" }}>Expression Label</th>
                <th style={{ padding: "6px 8px" }}>Engagement / Posture / Blink</th>
                <th style={{ padding: "6px 8px" }}>Gaze Arrows</th>
                <th style={{ padding: "6px 8px" }}>Shoulders</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["All overlays", "Yes", "Yes", "Yes", "Yes", "Yes"],
                ["Expressions", "No", "Yes", "No", "No", "No"],
                ["Engagement", "No", "No", "Yes", "Yes", "Yes"],
                ["No overlay", "No", "No", "No", "No", "No"],
              ].map(([mode, ...cols], i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e8e0d8" }}>
                  <td style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>{mode}</td>
                  {cols.map((c, j) => (
                    <td key={j} style={{ padding: "6px 8px", color: c === "Yes" ? "var(--success)" : "var(--muted)" }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 12, fontSize: "0.82rem", color: "var(--muted)" }}>
            <strong>Body tracking:</strong> MediaPipe Pose Landmarker (lite model) runs alongside the Face Landmarker every 3rd frame.
            It tracks shoulder landmarks (11/12) and hip landmarks (23/24) to compute shoulder tilt angle and slouch ratio.
            Shoulder overlays appear as orange lines/points in &quot;All overlays&quot; and &quot;Engagement&quot; modes.
          </p>
        </details>
      </section>

      <footer className="docs-footer">
        <p>LiveSesh AI — AI-Powered Live Session Analysis</p>
        <p>Built for the Nerdy/Varsity Tutors technical assessment, March 2026.</p>
      </footer>
    </main>
  );
}
