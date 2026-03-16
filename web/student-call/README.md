# LiveSesh AI — AI-Powered Live Session Analysis

Real-time engagement analysis and coaching for video tutoring sessions. Built for the Nerdy hiring challenge.

**Live demo:** [student-call.vercel.app](https://student-call.vercel.app)

## What It Does

- Analyzes live video tutoring sessions in real-time using client-side ML (MediaPipe Face Landmarker + Pose)
- Tracks 11 engagement metrics: eye contact, talk balance, engagement score, attention drift, interruptions, responsiveness, blink rate, head stability, facial responsiveness, posture, mood
- Provides non-intrusive coaching nudges to the tutor (draggable, dismissable, auto-escalating)
- Post-session AI summaries via Claude (OpenRouter) with Langfuse tracing
- Tutor dashboard with session history, per-student trends, and a 3D session graph

## Quick Start — Web

```bash
cd web/student-call
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENROUTER_API_KEY
npm install
npm run dev
```

Open `http://localhost:3000`. Sign in with the demo login, go to Dashboard → Start Session.

To test a two-party call:
1. Open the tutor link in one browser tab
2. Copy the student link and open in another tab/device
3. Both join the same room code

## Quick Start — iOS

The iOS tutor app runs on a physical iPhone with Apple Vision framework for face detection.

### Prerequisites
- Xcode 15+ with iOS 17+ SDK
- Apple Developer account (free tier works for personal device)
- Physical iPhone (camera/mic don't work in simulator)

### Setup
```bash
cd ios/LiveSesh
open LiveSesh.xcodeproj
```

1. In Xcode, select your development team under **Signing & Capabilities**
2. Connect your iPhone via USB
3. On iPhone: **Settings → Privacy & Security → Developer Mode → Enable** (restart required)
4. In Xcode: select your iPhone as the run destination
5. **Product → Clean Build Folder** (Shift+Cmd+K)
6. **Product → Run** (Cmd+R)
7. Trust the developer certificate on iPhone: **Settings → General → VPN & Device Management → your email → Trust**

The app will launch on your phone. Grant camera and microphone permissions when prompted.

## Running Tests

```bash
# iOS unit tests (124 tests)
cd ios/LiveSesh
swift test

# AI summary evals (requires OPENROUTER_API_KEY in .env.local)
cd web/student-call
npx tsx scripts/eval-ai-summary.ts
```

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Web client | Next.js 15, MediaPipe, LiveKit | Student call + tutor dashboard |
| iOS app | Swift/SwiftUI, Apple Vision | Tutor-side capture + analysis |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) | Session storage, auth, summaries |
| Video transport | LiveKit Cloud (WebRTC SFU) | Real-time video/audio rooms |
| AI summaries | Claude via OpenRouter | Post-session analysis |
| Observability | Langfuse | LLM cost/latency tracking |

## Documentation

- **[Project Docs](https://student-call.vercel.app/docs)** — Architecture, pipeline, cost analysis, validation, metric definitions
- **[Changelog](https://student-call.vercel.app/changelog)** — Visual timeline of development progress
- `docs/ARCHITECTURE.md` — Decision log
- `docs/VALIDATION.md` — Accuracy and latency measurements
