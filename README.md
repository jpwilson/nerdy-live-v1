# LiveSesh - AI-Powered Live Session Analysis

Real-time engagement analysis and coaching for Nerdy/Varsity Tutors video tutoring sessions.

## Overview

LiveSesh is a native iOS app that analyzes live tutoring video sessions in real-time, measuring engagement metrics like eye contact, speaking time balance, and energy levels. It provides non-intrusive coaching nudges to tutors during sessions and comprehensive post-session analytics.

Built to match Nerdy's (nerdy.com) design language and integrate with their existing technology stack (TypeScript/React, REST/GraphQL/gRPC APIs, Supabase, AWS).

## Quick Start

### Prerequisites
- Xcode 15+ with iOS 17 SDK
- Swift 5.9+
- (Optional) Supabase project for backend persistence

### Build & Run

```bash
# Open in Xcode
open ios/LiveSesh/LiveSesh.xcodeproj

# Or build via SPM (for tests)
cd ios/LiveSesh
swift build
swift test
```

### Run Tests
```bash
cd ios/LiveSesh
swift test
```

## Architecture

```
Video/Audio Stream → Processing Pipeline → Metrics Dashboard
                           ↓
                    Coaching Nudges
                           ↓
                    Post-Session Analytics
```

### Modular Structure
- `Core/VideoProcessor/` - Real-time face detection, gaze estimation, expression analysis (Apple Vision)
- `Core/AudioProcessor/` - Voice activity detection, speaker diarization
- `Core/MetricsEngine/` - Engagement metric computation with sliding windows
- `Features/Session/` - Live session view with camera preview and metrics
- `Features/Coaching/` - Nudge system with configurable sensitivity
- `Features/Analytics/` - Post-session dashboard and trend tracking
- `Services/SupabaseService/` - REST API client matching Supabase patterns
- `Services/SessionStore/` - Local persistence layer

### Key Technical Decisions
1. **Native iOS (SwiftUI + Vision)** - On-device ML for <500ms latency
2. **Apple Vision Framework** - Face detection, gaze estimation, expression analysis
3. **Supabase Backend** - Matches Nerdy's existing toolchain
4. **Sliding Window Metrics** - 30-second rolling windows at 1-2 Hz update rate
5. **Privacy-First** - All video/audio processed on-device, only aggregate metrics stored

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Features

### Real-Time Analysis
- Face detection and tracking for tutor and student
- Eye gaze estimation and attention detection
- Voice activity detection with speaker diarization
- Facial expression analysis for energy/engagement

### Engagement Metrics
- **Eye Contact Score** - % of time looking at camera
- **Speaking Time Balance** - Tutor vs student talk ratio
- **Interruptions** - Overlap detection and counting
- **Energy Level** - Voice prosody + facial expression
- **Attention Drift** - Composite disengagement score

### Coaching Nudges
- Non-intrusive floating pill notifications
- Configurable sensitivity (Low/Medium/High)
- Cooldown system to prevent notification fatigue
- Types: engagement check, attention alert, talk balance, energy drop, interruption spike, positive reinforcement

### Post-Session Analytics
- Session summary with key metrics
- Trend analysis across multiple sessions
- Key moments flagged for review
- Personalized improvement recommendations

## Performance Targets

| Metric | Target |
|---|---|
| Analysis latency | <500ms |
| Metric update rate | 1-2 Hz |
| Eye contact accuracy | 85%+ |
| Speaking time accuracy | 95%+ |
| System uptime | 99.5%+ |

## Privacy

- All video/audio analyzed on-device (never transmitted)
- Only aggregate metrics stored
- Consent required from both participants
- Session data auto-expires after 90 days
- COPPA/FERPA considerations for K-12 audience

## Testing

The test suite covers:
- **Models** - Codable compliance, equality, initialization (15+ tests)
- **MetricsEngine** - Eye contact computation, talk time balance, energy, trends (10+ tests)
- **VideoProcessor** - Face detection models, gaze estimation, expressions (10+ tests)
- **AudioProcessor** - VAD, speaker diarization, audio levels (15+ tests)
- **CoachingEngine** - All nudge types, cooldowns, config presets (15+ tests)
- **SessionStore** - CRUD operations, filtering, encoding stability (15+ tests)
- **SupabaseService** - Mock service, error handling, JSON encoding (10+ tests)

Total: **90+ unit tests**

## Limitations

1. Gaze estimation accuracy depends on camera quality and angle
2. Speaker diarization requires distinct audio streams
3. Facial expression analysis may vary across demographics
4. Battery drain from continuous camera + audio processing
5. iOS only (no cross-platform support in initial release)

## API Documentation

See [docs/API.md](docs/API.md) for data models and Supabase schema.

## License

Proprietary - Nerdy, Inc.
