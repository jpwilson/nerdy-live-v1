# LiveSesh - AI-Powered Live Session Analysis

Real-time engagement analysis and coaching for video tutoring sessions.

## Overview

LiveSesh is a native iOS app that analyzes live tutoring video sessions in real-time, measuring engagement metrics like eye contact, speaking time balance, and energy levels. It provides non-intrusive coaching nudges to tutors during sessions and comprehensive post-session analytics.

Built for Nerdy's (nerdy.com) platform, matching their design language and integrating with Supabase for backend persistence.

## Quick Start

### Prerequisites
- Xcode 15+ with iOS 17 SDK
- Swift 5.9+
- A physical iPhone (camera/mic features require real hardware)
- (Optional) Supabase project for cloud sync

### Build & Run

```bash
# Open in Xcode
open ios/LiveSesh/LiveSesh.xcodeproj

# Select your iPhone as the run target
# Product > Run (⌘R)
```

On first launch, sign in with your email to get a one-time code. The app creates your tutor identity from the authenticated Supabase user.

### Run Tests
```bash
cd ios/LiveSesh
swift test   # 124 tests, all passing
```

### Supabase Setup (Optional)

To enable cloud sync:

1. Create a Supabase project
2. Run `supabase/migrations/001_initial_schema.sql` against your database
3. Deploy the edge function: `supabase functions deploy session-summary`
4. In Xcode, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to your scheme environment or Info.plist
5. Enable Email auth in the Supabase dashboard (Authentication > Providers > Email)

## Architecture

```
Camera/Mic → AVCaptureSession → Video/Audio Processing → Metrics Engine → Dashboard
                                                              ↓
                                                       Coaching Nudges
                                                              ↓
                                                     Post-Session Analytics
                                                              ↓
                                                   Supabase (cloud sync)
```

### Modular Structure
- `Core/VideoProcessor/` - Face detection, gaze estimation, expression analysis (Apple Vision)
- `Core/AudioProcessor/` - Voice activity detection, speaker diarization, audio levels
- `Core/MetricsEngine/` - Engagement metric computation with 30-second sliding windows
- `Core/LiveCapture/` - AVCaptureSession orchestrator for video + audio
- `Features/Session/` - Live session view with camera preview and real-time metrics
- `Features/Coaching/` - Nudge system with configurable sensitivity (low/medium/high)
- `Features/Analytics/` - Post-session dashboard and trend tracking
- `Features/Auth/` - Email OTP sign-in flow (Supabase Auth)
- `Services/AuthService/` - Authentication, session restore, token refresh
- `Services/SupabaseService/` - REST API client for Supabase with RLS support
- `Services/SessionStore/` - Local-first persistence (UserDefaults)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full decision log and design rationale.

### Key Technical Decisions
1. **Native iOS (SwiftUI + Vision)** - On-device ML for <500ms latency, privacy-first
2. **Apple Vision Framework** - Face detection, gaze estimation, expression analysis at ~5fps
3. **AVCaptureSession for audio** - Routes audio through the same capture session as video to avoid AVAudioEngine hardware conflicts
4. **Supabase Backend** - Matches Nerdy's existing toolchain; RLS for data isolation
5. **Sliding Window Metrics** - 30-second rolling windows at 2 Hz update rate
6. **Email OTP Auth** - Simplest auth path; tutor identity comes from Supabase `auth.users.id`
7. **Local-first persistence** - Sessions are always saved locally; cloud sync is optional and additive

## Features

### Real-Time Analysis
- Face detection and tracking via Apple Vision framework
- Eye gaze estimation and attention detection (yaw/pitch from face landmarks)
- Voice activity detection with energy-based speaker identification
- Facial expression analysis for energy/engagement scoring
- Audio routed through AVCaptureSession (same pipeline as video)

### Engagement Metrics
- **Eye Contact Score** - % of time looking at camera (tutor-side via front camera)
- **Speaking Time Balance** - Tutor talk time percentage
- **Interruptions** - Overlapping speech detection and counting
- **Energy Level** - Voice volume + facial expression valence
- **Engagement Trend** - Rising/stable/declining based on sliding window comparison

### Coaching Nudges
- Non-intrusive floating pill notifications (tutor-visible only)
- Configurable sensitivity (Low/Medium/High) with adjustable thresholds
- Cooldown system to prevent notification fatigue (30-120s)
- Types: engagement check, attention alert, talk balance, energy drop, interruption spike, positive reinforcement
- Auto-dismiss after 5 seconds

### Post-Session Analytics
- Session summary with key metrics
- Trend analysis across multiple sessions
- Personalized improvement recommendations
- Session history with detail views

### Authentication
- Email OTP sign-in (Supabase Auth)
- Automatic session restore on app relaunch
- Token refresh before expiry
- Sign-out from profile screen
- Tutor identity derived from authenticated user UUID

## Performance

| Metric | Measured | Target |
|---|---|---|
| Video analysis latency | ~100-150ms | <500ms |
| Audio analysis latency | ~25-30ms | <500ms |
| Metric update rate | 2 Hz | 1-2 Hz |
| Eye contact accuracy (good conditions) | ~85-90% | 85%+ |
| Speaking time accuracy (quiet room) | ~95%+ | 95%+ |

See [docs/VALIDATION.md](docs/VALIDATION.md) for detailed latency measurements, accuracy methodology, and known gaps.

## Privacy

- **On-device processing:** All video and audio is analyzed locally using Apple Vision. Raw video/audio is never transmitted or stored.
- **Consent:** The app requests camera and microphone permissions with clear purpose strings. Both participants should be informed that engagement analysis is active.
- **Data minimization:** Only aggregate metrics (scores, counts, trends) are stored. No raw biometric data is persisted.
- **Access control:** Supabase Row Level Security ensures tutors can only access their own session data (`auth.uid() = tutor_id`).
- **Transparency:** A "LIVE CAPTURE" indicator is always visible during active sessions.
- **Retention:** Session data is stored locally and in Supabase. Retention policies should be configured per deployment (recommended: 90-day auto-delete).
- **COPPA/FERPA:** Relevant for K-12 tutoring. The on-device processing model reduces compliance surface area, but institutional deployment should include parental consent flows.

## Testing

124 unit tests covering all core modules:

| Module | Tests | Coverage |
|---|---|---|
| Models | 15+ | Codable, equality, initialization |
| MetricsEngine | 10+ | Eye contact, talk time, energy, trends |
| VideoProcessor | 10+ | Face detection, gaze, expressions |
| AudioProcessor | 15+ | VAD, diarization, audio levels |
| CoachingEngine | 15+ | All nudge types, cooldowns, config |
| SessionStore | 15+ | CRUD, filtering, encoding |
| SupabaseService | 10+ | Mock service, errors, JSON encoding |

## Limitations

1. **Tutor-side capture only** - The app currently analyzes the tutor's front camera and device microphone. Student-side metrics require integration with the actual video call SDK to receive the student's media stream. Without this, student engagement is inferred rather than measured.
2. **Single-mic speaker diarization** - Separating tutor vs. student voice from one microphone is approximate. The energy-based approach works best when the tutor is closer to the device mic.
3. **Gaze estimation accuracy** - Depends on camera quality, lighting, and angle. Multi-monitor setups may confuse attention tracking. Calibration per-user is recommended but not yet implemented.
4. **Facial expression demographics** - Vision framework accuracy varies across face shapes, skin tones, and lighting. No demographic-specific calibration has been performed.
5. **Battery impact** - Continuous camera + audio processing increases battery drain. Throttled to ~5fps for analysis to manage this.
6. **iOS only** - No cross-platform support. Requires iPhone with iOS 17+.
7. **No ground-truth validation** - Accuracy numbers are from manual testing, not a labeled benchmark dataset.

## Documentation

- [Architecture & Decision Log](docs/ARCHITECTURE.md) - Technical decisions, design rationale, privacy analysis
- [Validation Report](docs/VALIDATION.md) - Latency measurements, accuracy methodology, known gaps
- [API Documentation](docs/API.md) - Data models and Supabase schema
- [Supabase Schema](supabase/migrations/001_initial_schema.sql) - Database tables and RLS policies

---

## Codebase Overview

LiveSesh is a two-app system: a **native iOS tutor app** that runs real-time AI engagement analysis, and a **web student app** that provides the student's side of the video call. They connect peer-to-peer via WebRTC, with Supabase Realtime handling signaling.

### Why this architecture?

The core insight is that engagement analysis must happen **on-device** — sending raw video to a server adds latency, costs money, and raises privacy concerns. Apple's Vision framework gives us face detection, gaze estimation, and expression analysis for free, running locally on the iPhone's Neural Engine. The student just needs a browser to join the call; they don't need analysis capabilities.

### iOS App (`ios/LiveSesh/`)

**Language:** Swift 5.9 · **UI:** SwiftUI · **Target:** iOS 17+ · **Build:** xcodegen (`project.yml` → `.xcodeproj`)

```
LiveSesh/
├── App/                    # App entry point, global state, root navigation
├── Core/
│   ├── AudioProcessor/     # Voice activity detection, energy levels (CMSampleBuffer)
│   ├── VideoProcessor/     # Face/gaze/expression analysis (Apple Vision)
│   ├── MetricsEngine/      # 30s sliding windows, 2Hz metric updates
│   └── LiveCapture/        # AVCaptureSession orchestrator (unified video + audio)
├── Features/
│   ├── Session/            # FaceTime-style live call UI, WebRTC video rendering
│   ├── Coaching/           # Real-time nudge engine (6 types, configurable sensitivity)
│   ├── Analytics/          # Post-session dashboard and trends
│   ├── Auth/               # Email OTP sign-in (Supabase Auth)
│   └── Settings/           # Profile, sign-out
├── Models/                 # Domain types (Session, Metrics, Nudge, Summary)
├── Services/
│   ├── WebRTCService/      # Peer connection + Supabase Realtime signaling (Phoenix WS)
│   ├── AuthService/        # Token management, session restore, refresh
│   ├── SupabaseService/    # REST client with RLS-compatible auth headers
│   └── SessionStore/       # Local-first persistence (UserDefaults)
└── Design/                 # Nerdy brand theme tokens
```

**Key dependencies:** [stasel/WebRTC](https://github.com/stasel/WebRTC) v114 (Google WebRTC compiled for iOS via SPM).

**Testing:** 124 unit tests across 8 test files covering all core modules. Run with `swift test` from `ios/LiveSesh/`.

### Web App (`web/student-call/`)

**Language:** TypeScript · **Framework:** Next.js 15 (React 19) · **Deployed:** Vercel

```
student-call/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page with room join form
│   └── room/[roomId]/      # Dynamic room page
├── components/
│   ├── join-form.tsx       # Room entry UI with demo accounts
│   └── room-client.tsx     # Video call UI (remote + local PiP, controls, presence)
└── lib/
    ├── use-webrtc-room.ts  # WebRTC hook: getUserMedia, peer connection, ICE, presence
    ├── supabase-browser.ts # Supabase client singleton
    ├── call-types.ts       # Shared types (roles, signals, connection states)
    └── room-utils.ts       # Display helpers (labels, URLs, formatting)
```

**Key dependencies:** `@supabase/supabase-js` for Realtime signaling and presence.

The web app is intentionally simple — it's a video endpoint, not an analysis tool. Students join via a link, see the tutor's video, and send their own camera/mic back. All the intelligence lives on the iOS side.

### Backend (`supabase/`)

**Platform:** Supabase (hosted PostgreSQL + Auth + Realtime + Edge Functions)

- `migrations/001_initial_schema.sql` — Tables for sessions, metrics snapshots, coaching nudges, summaries. Row Level Security ensures each tutor only sees their own data.
- `functions/session-summary/` — Edge function for post-session summary generation.
- **Realtime** — Used as the WebRTC signaling layer. Both apps join a Phoenix channel (`room:{roomId}:webrtc`), exchange SDP offers/answers and ICE candidates via broadcast, and track presence to detect who's in the room.

### How the video call works

1. **Tutor** starts a session on iOS with a room code (e.g., `demo-room`)
2. **Student** opens the web app and joins the same room code
3. Both connect to a Supabase Realtime channel and announce via presence
4. When both peers are present, WebRTC negotiation starts (perfect negotiation pattern)
5. SDP offers/answers and ICE candidates flow through Supabase broadcast
6. Once the P2P connection is established, video/audio streams directly between devices
7. The iOS app renders the student's video full-screen and runs Vision analysis on it
8. The student sees the tutor's video in their browser

### CI/CD (`.github/workflows/ci.yml`)

Runs on every push to `main` and all PRs:
- **iOS:** Swift tests with coverage on macOS
- **Web:** TypeScript typecheck + Next.js production build on Ubuntu (Node 20)

### Infrastructure summary

| Component | Technology | Why |
|-----------|-----------|-----|
| iOS app | Swift / SwiftUI | Native access to Vision framework, camera, Neural Engine |
| ML inference | Apple Vision | On-device, zero-latency, no API costs, privacy-preserving |
| Web app | Next.js / TypeScript | Fast to build, easy Vercel deploy, minimal student-side complexity |
| Video call | WebRTC (peer-to-peer) | Direct media streaming, no relay server needed for 1:1 |
| Signaling | Supabase Realtime | Already using Supabase for backend; avoids a separate signaling server |
| Auth | Supabase Auth (Email OTP) | Simple, no password management, works with RLS |
| Database | Supabase (PostgreSQL) | RLS for data isolation, REST API, matches Nerdy's stack |
| Deployment | Vercel (web), Xcode (iOS) | Zero-config for Next.js; standard iOS distribution |
| CI | GitHub Actions | Free for open-source, runs both Swift and Node |

## License

Proprietary - Nerdy, Inc.
