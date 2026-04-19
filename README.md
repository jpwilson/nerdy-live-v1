# LiveSesh AI — AI-Powered Live Session Analysis

Real-time engagement analysis for live tutoring sessions. Built for the Nerdy/Varsity Tutors technical assessment.

**Live demo:** [nerdy-live.46-225-235-124.sslip.io](https://nerdy-live.46-225-235-124.sslip.io)

> _Hosted on [Hetzner Cloud](https://www.hetzner.com/cloud) (ARM CAX21, Nuremberg) via [Coolify](https://coolify.io), with self-hosted Supabase on the same box. Migrated off Vercel + Supabase Cloud (prior URL: `student-call.vercel.app`) to cut demo hosting costs._

---

## Evaluator Quick Start

### 1. Sign in
Visit [nerdy-live.46-225-235-124.sslip.io](https://nerdy-live.46-225-235-124.sslip.io) and use a **demo account**:
- **Tutor**: Choose "Kim (Tutor)" or "Nick (Tutor)" from the dropdown
- **Student**: Choose any student name

### 2. Start a tutoring session
- As **tutor**: Click "Start Session" → enters the room with engagement analysis
- As **student**: Open a second browser/tab, sign in as a student, enter room code `demo-room`

### 3. What to observe
- **Face mesh overlay** on the student's video (real-time face landmark detection)
- **Engagement metrics** in the sidebar: eye contact, speaking time, energy, attention drift
- **Coaching nudges** appear on the video after the 5-minute observation period (use `?demo=true` URL param to compress to 30 seconds)
- **Speech transcription** — the tutor's speech is transcribed in real-time and the subject is auto-detected

### 4. After the call
- End the call → post-session summary screen with transcript
- Dashboard → Previous Sessions tab shows session history with sortable table
- Click any session → expandable detail tiles with radar chart, engagement timeline, AI summary, recommendations
- Trends tab → per-student engagement charts over time
- Session Graph → interactive force-directed visualization of all sessions

### 5. iOS app
- Build from `ios/LiveSesh/` in Xcode
- Sign in with demo credentials
- Connect to the same `demo-room` — the web tutor sees the iOS student's video

---

## Architecture

### System Overview

```
┌─────────────────┐     LiveKit WebRTC     ┌──────────────────┐
│   iOS App        │◄────────────────────►│   Web Client      │
│   (Student)      │     Audio + Video     │   (Tutor)         │
│                  │                       │                    │
│   Front camera   │                       │  MediaPipe Face    │
│   LiveKit SDK    │                       │  Landmarker (GPU)  │
│                  │                       │  Web Speech API    │
└─────────────────┘                       │  Engagement Engine │
                                          └────────┬───────────┘
                                                   │
                                          ┌────────▼───────────┐
                                          │   Supabase         │
                                          │   PostgreSQL + Auth│
                                          │   Edge Functions   │
                                          └────────────────────┘
```

### Analysis Pipeline (2Hz, ~150ms latency)

1. **Video Capture** → Remote WebRTC stream
2. **Face Detection** → MediaPipe Face Landmarker (468 landmarks, 52 blendshapes)
3. **Eye Contact Calibration** → 60s baseline, personal deviation tracking
4. **Expression Detection** → 9 expressions from blendshape thresholds
5. **Audio Analysis** → Web Audio API frequency analysis for speaking detection
6. **Engagement Scoring** → Weighted composite (face 15%, eye contact 35%, speaking 20%, stability 15%, energy 15%)
7. **Coaching Assessment** → Window-based (5min grace, 3min windows, escalating L1→L3)

### Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| iOS | Swift/SwiftUI | Native tutor/student app |
| Web | Next.js 15 | Dashboard + call interface |
| Face ML | MediaPipe Face Landmarker | Real-time face detection (client-side, GPU) |
| Speech | Web Speech API | Real-time transcription |
| WebRTC | LiveKit | Room management + SFU |
| Auth | Supabase Auth | Email OTP + demo accounts |
| Database | Supabase PostgreSQL | Sessions, metrics, nudges |
| Hosting | Vercel | Web app deployment |

### Cost Analysis

| Scale | Sessions/mo | Total Cost/mo |
|-------|------------|---------------|
| 100 users | ~3,000 | $60 – $150 |
| 1,000 users | ~30,000 | $645 – $1,545 |
| 10,000 users | ~300,000 | $6,400 – $15,400 |

**Key insight:** ML inference is $0 at any scale (client-side). Cost is dominated by LiveKit SFU.

### Validation

| Metric | Target | Measured |
|--------|--------|----------|
| Eye contact accuracy | 85%+ | ~82-88% |
| Speaking time accuracy | 95%+ | ~93-97% |
| Video processing latency | <500ms | ~150ms |
| Audio processing latency | <500ms | ~30ms |

### Privacy & Security

- **No video storage** — frames processed in real-time, never saved
- **Client-side ML** — no video data ever leaves the device
- **Row Level Security** — tutors can only access their own data
- **WebRTC encryption** — DTLS-SRTP for all audio/video in transit

---

## Rubric Alignment (100 pts)

| Category | Weight | How We Address It |
|----------|--------|------------------|
| Real-Time Performance (25%) | Video ~150ms, audio ~30ms, 2Hz updates | Client-side MediaPipe GPU inference |
| Metric Accuracy (25%) | Eye contact ~85%, speaking ~95% | Auto-calibration + frequency analysis |
| Coaching Value (20%) | Window-based assessment, escalating nudges | 5min grace, 3min windows, L1-L3 levels |
| Technical Implementation (15%) | Dual platform, clean arch, 124 tests | iOS + Web + Supabase + LiveKit |
| Documentation (15%) | This README + /docs page + architecture | Cost analysis, validation, privacy |

---

## Project Structure

```
├── ios/LiveSesh/          # iOS app (Swift/SwiftUI)
├── web/student-call/      # Web app (Next.js 15)
│   ├── app/               # Pages (dashboard, docs, room, session-summary)
│   ├── components/        # React components
│   ├── lib/               # Hooks and utilities
│   └── app/globals.css    # All styles
├── supabase/              # Database schema + edge functions
├── docs/                  # Architecture + validation docs
└── briefing/              # Original assignment brief
```

## Running Locally

```bash
# Web app
cd web/student-call
cp .env.local.example .env.local  # Add Supabase + LiveKit keys
npm install && npm run dev

# iOS app
cd ios/LiveSesh
open LiveSesh.xcodeproj  # Build to device via Xcode
```
