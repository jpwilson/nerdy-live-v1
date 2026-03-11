# Architecture & Decision Document
## AI-Powered Live Session Analysis for Nerdy

### Company Context

**Nerdy, Inc. (NYSE: NRDY)** is the company behind Varsity Tutors, operating the Live+AI platform that fuses real-time human tutoring with proprietary generative AI systems. The platform supports 3,000+ subjects with live 1-to-1 tutoring, group classes, AI session summaries, adaptive diagnostics, and an AI Tutor/Copilot.

### Nerdy's Production Tech Stack (Observed)

| Category | Technologies |
|---|---|
| Languages | TypeScript/JavaScript, Java/C++/C# |
| Frontend | React |
| Databases | SQL Server, MySQL |
| APIs & Protocols | REST, GraphQL, gRPC, Webhooks, OAuth |
| Cloud Infrastructure | AWS (RDS, Lambda, EC2, CodeDeploy), Kubernetes |
| Event Streaming | Apache Kafka |
| CI/CD | GitHub Actions, AWS CodeDeploy |
| Integrations | Twilio Flex, Segment CDP, Braze/SendGrid |
| AI Development Tools | Claude Code, Cursor, ChatGPT, Make.com, n8n |
| Deployment | Supabase, Vercel, Netlify |

### Mobile App Landscape

- **Varsity Tutors Live Tutoring** - iOS/Android app (branded under Varsity Tutors, not "Nerdy")
- **Varsity Tutors Learning Tools** - iOS/Android practice app
- **Nerdy Sidekick** - Desktop-only app (Mac/Windows) for AI study assistance
- **No native "Nerdy"-branded iOS app exists** - The "Nerdy - Daily Micro Learning" app on the App Store is by FENIX MOBILE YAZILIM A.S., unrelated to Nerdy Inc.

---

## Project: AI-Powered Live Session Analysis

### Problem Statement

Live tutoring sessions are Nerdy's core value proposition, but tutors lack real-time feedback on teaching effectiveness. Engagement signals like eye contact, talk time balance, and energy levels are invisible during sessions. This system aims to surface these metrics in real-time and provide non-intrusive coaching nudges.

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    iOS Application                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐ │
│  │  Camera   │  │   Mic    │  │   Session Context     │ │
│  │  Feed     │  │   Feed   │  │   (subject, level)    │ │
│  └────┬─────┘  └────┬─────┘  └───────────┬───────────┘ │
│       │              │                     │             │
│       ▼              ▼                     ▼             │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Video/Audio Processing Pipeline        │    │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────┐ │    │
│  │  │   Vision    │  │   Audio    │  │  Metrics  │ │    │
│  │  │  Framework  │  │  Analysis  │  │  Engine   │ │    │
│  │  │  (on-device)│  │  (on-device)│ │           │ │    │
│  │  └────────────┘  └────────────┘  └───────────┘ │    │
│  └─────────────────────┬───────────────────────────┘    │
│                        │                                 │
│       ┌────────────────┼────────────────┐               │
│       ▼                ▼                ▼               │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Live     │  │  Coaching    │  │  Post-Session│     │
│  │  Metrics  │  │  Nudge       │  │  Analytics   │     │
│  │  Dashboard│  │  System      │  │  Dashboard   │     │
│  └──────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Supabase Backend  │
              │  ┌───────────────┐  │
              │  │ Session Store │  │
              │  │ Metrics DB    │  │
              │  │ Analytics API │  │
              │  └───────────────┘  │
              └─────────────────────┘
```

### Key Architecture Decisions

#### Decision 1: Native iOS with SwiftUI
**Choice:** Swift + SwiftUI + Apple Vision Framework
**Rationale:**
- Aligns with Nerdy's need for a "Nerdy"-branded iOS app (they don't have one)
- Apple Vision framework provides on-device face detection, gaze estimation, and facial expression analysis with <100ms latency
- On-device processing addresses privacy concerns (no video sent to cloud)
- SwiftUI matches modern iOS development patterns
- AVFoundation provides direct camera/mic access with low latency

**Alternatives Considered:**
- React Native (matches Nerdy's React stack but lacks native Vision framework access)
- Flutter (cross-platform but heavier for real-time video processing)
- Web-based (bonus points but higher latency for video processing)

#### Decision 2: On-Device ML Processing
**Choice:** Apple Vision + AVCaptureSession (all on-device)
**Rationale:**
- Latency target <500ms requires on-device processing
- Privacy-first: video never leaves the device
- Apple Vision provides face detection, face landmarks, gaze tracking natively
- No network dependency during sessions

**Trade-offs:**
- Limited to Apple hardware capabilities
- Less flexibility than cloud-based models
- Battery/thermal considerations on older devices

#### Decision 2b: Audio Routing through AVCaptureSession
**Choice:** Route microphone audio through AVCaptureSession (same pipeline as video) instead of a separate AVAudioEngine
**Rationale:**
- AVCaptureSession and AVAudioEngine both claim the microphone hardware on iOS. Running both simultaneously causes the audio engine to receive silence instead of real mic input.
- By adding `AVCaptureAudioDataOutput` to the existing capture session, audio and video share the same hardware session and both receive real data.
- The `AudioProcessor` accepts `CMSampleBuffer` from the capture session delegate, extracts PCM samples, and feeds them through the same RMS/VAD/diarization pipeline.

**Trade-off:** Slightly tighter coupling between capture and processing, but audio actually works.

#### Decision 3: Supabase for Backend
**Choice:** Supabase (PostgreSQL + Edge Functions + Realtime)
**Rationale:**
- Nerdy already uses Supabase in their development workflow
- PostgreSQL aligns with their SQL Server/MySQL database expertise
- Edge Functions (TypeScript) match their TS/JS stack
- Realtime subscriptions enable live dashboard syncing
- Row Level Security for multi-tenant data isolation
- Cost-effective for MVP

#### Decision 4: Engagement Metric Architecture
**Choice:** Sliding window metrics with configurable thresholds
**Approach:**
- Eye contact: 3-second rolling average of gaze direction (Vision framework)
- Speaking time: Real-time VAD with speaker diarization (AVAudioEngine + WebRTC VAD)
- Interruptions: Overlap detection on dual audio streams
- Energy level: Voice prosody (pitch variance, volume) + facial expression valence
- Attention drift: Composite score from declining eye contact + silence + expression

**Update Frequency:** 1-2 Hz for dashboard, event-driven for nudges

#### Decision 5: Coaching Nudge Design
**Choice:** Subtle, non-intrusive visual indicators (tutor-only)
**Design Principles:**
1. Small floating pill notifications (corner of screen)
2. Color-coded severity (blue=info, amber=suggestion, red=alert)
3. Auto-dismiss after 5 seconds unless pinned
4. Configurable sensitivity (low/medium/high)
5. Nudges visible only to tutor, never to student
6. Minimum 60-second cooldown between nudges to avoid fatigue

**Nudge Triggers:**
| Trigger | Threshold | Message |
|---|---|---|
| Student silent >3 min | 180s no speech | "Check for understanding" |
| Low eye contact | <30% over 30s | "Student may be distracted" |
| Tutor talk >80% | 5 min window | "Try asking a question" |
| Energy drop | 20% decline | "Consider a short break" |
| Interruption spike | 3+ in 2 min | "Give more wait time" |

#### Decision 6: Authentication via Email OTP
**Choice:** Supabase Auth with email one-time-password (OTP) codes
**Rationale:**
- Fastest path to real authenticated sessions without building password UX
- Supabase Auth REST API (`/auth/v1/otp`, `/auth/v1/verify`) provides email OTP natively
- The authenticated user's UUID becomes `tutor_id`, making RLS policies work (`auth.uid() = tutor_id`)
- Tokens are stored locally and auto-refreshed before expiry
- Session restore on app relaunch provides seamless re-authentication

**Why not Apple Sign In first:**
- Email OTP has zero external dependencies (no Apple Developer provisioning changes)
- Simpler to test and iterate
- Apple Sign In can be added later as an additional auth method

#### Decision 7: Post-Session Analytics Storage
**Choice:** Time-series metrics stored in Supabase with aggregation views
**Schema:**
- `sessions` - Session metadata (tutor, student, subject, duration)
- `metrics_snapshots` - Time-series engagement data (1 row per second)
- `coaching_nudges` - Log of all nudges triggered and outcomes
- `session_summaries` - Aggregated post-session reports
- `improvement_plans` - Tutor-specific coaching recommendations

### Design Language

Matching nerdy.com's visual identity:
- **Dark theme** (charcoal/navy backgrounds: `#1A1B2E`, `#0D0E1A`)
- **Gradient accents** (cyan `#00D4AA` → magenta `#FF3CAC` → purple `#784BA0`)
- **Typography:** Clean sans-serif (SF Pro on iOS)
- **Cards:** Subtle glass-morphism with rounded corners
- **"nerdy" logo:** Lowercase, clean, colorful character variations
- **Live+AI branding:** Rainbow gradient on "Live" text

### Performance Requirements

| Metric | Target | Approach |
|---|---|---|
| Video processing latency | <500ms | On-device Vision framework |
| Metric update frequency | 1-2 Hz | Timer-based aggregation |
| Nudge delivery time | <1s from trigger | Event-driven local processing |
| Battery impact | <15% per hour | Throttled frame sampling (5 fps for analysis) |
| App launch to session | <3s | Lazy loading, minimal network deps |

### Privacy Considerations

1. **On-device processing:** Video/audio analyzed locally, never transmitted
2. **Consent:** Both tutor and student must opt-in before analysis begins
3. **Data minimization:** Only aggregate metrics stored, no raw video/audio
4. **Retention:** Session metrics auto-delete after 90 days (configurable)
5. **Access control:** Tutors see only their own sessions; QA team sees anonymized aggregates
6. **Transparency:** Clear in-session indicator that analysis is active
7. **COPPA/FERPA compliance:** Critical given K-12 student audience

### Known Limitations

1. **Gaze estimation accuracy** depends on camera quality and angle; multi-monitor setups may confuse attention tracking
2. **Speaker diarization** on a single device with two speakers requires distinct audio streams (challenging with shared mic)
3. **Facial expression analysis** varies across demographics; calibration recommended
4. **Battery drain** from continuous camera + audio processing on older devices
5. **No cross-platform support** in initial release (iOS only)

### Calibration Methodology

1. **Eye contact baseline:** 10-second calibration where user looks at camera, then away
2. **Audio baseline:** 5-second silence capture for noise floor
3. **Expression baseline:** Neutral face capture for per-user expression normalization
4. **Threshold tuning:** First 3 sessions use relaxed thresholds, then tighten based on tutor feedback

### Modular Project Structure

```
livesesh/v1/
├── docs/
│   ├── ARCHITECTURE.md          # This document
│   └── API.md                   # API documentation
├── ios/
│   └── LiveSesh/
│       ├── App/                  # App entry point, configuration
│       ├── Core/
│       │   ├── VideoProcessor/   # Real-time video analysis pipeline
│       │   ├── AudioProcessor/   # Audio analysis & speaker diarization
│       │   └── MetricsEngine/    # Engagement metric calculations
│       ├── Features/
│       │   ├── Session/          # Live session view & controls
│       │   ├── Auth/             # Login and OTP verification
│       │   ├── Coaching/         # Nudge system & notifications
│       │   └── Analytics/        # Post-session analytics
│       ├── Services/
│       │   ├── AuthService/      # Supabase Auth (OTP, tokens)
│       │   ├── SupabaseService/  # Backend communication
│       │   └── SessionStore/     # Local data persistence
│       ├── Models/               # Data models & DTOs
│       ├── Design/               # Colors, typography, theme
│       └── Resources/            # Assets, ML models
└── supabase/
    ├── migrations/               # Database schema
    └── functions/                # Edge functions for analytics
```
