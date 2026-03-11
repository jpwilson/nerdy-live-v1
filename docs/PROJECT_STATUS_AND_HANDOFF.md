# LiveSesh Combined Status, Handoff, and Execution Plan

## Executive Summary

This repository is no longer just a visual prototype. It is now a real native iOS app that runs on a physical iPhone, captures tutor-side camera and microphone input locally, computes live engagement metrics, surfaces live coaching nudges, stores session artifacts locally, and is wired to a real Supabase project for eventual cloud sync.

The project is not yet fully aligned with the original "AI Powered Live Session Analysis" spec. The biggest remaining gaps are:

1. Real app authentication through Supabase Auth.
2. True two-party session analysis using real student media.
3. Backend parity and validation work so the app is trustworthy, not just functional.

The current state is best described as: strong prototype with real device capture, real local UX, real Supabase infrastructure, and a clear path to production-like behavior, but not yet a full end-to-end spec-complete system.

---

## What Has Been Done

### Repo and Infrastructure

- Reviewed the repository end to end and identified that the original version was mostly a polished prototype with simulated data paths and incomplete backend wiring.
- Created and linked a real Supabase project for this repo.
- Pushed the database schema from `supabase/migrations/001_initial_schema.sql`.
- Deployed the `session-summary` edge function from `supabase/functions/session-summary/index.ts`.
- Initialized local Supabase CLI configuration in `supabase/config.toml`.
- Created a private GitHub repository and pushed the project to:
  - `https://github.com/jpwilson/nerdy-live-v1`

### iOS App

- Added a real iPhone live capture path in `ios/LiveSesh/LiveSesh/Core/LiveCapture/LiveCaptureController.swift`.
- Wired live capture into the session flow through `ios/LiveSesh/LiveSesh/Features/Session/SessionViewModel.swift`.
- Replaced the session placeholder surface with a real camera preview and capture-status UI in `ios/LiveSesh/LiveSesh/Features/Session/SessionView.swift`.
- Updated the metrics engine so eye-contact history is tracked separately by participant role instead of sharing one history across both roles.
- Added local-first persistence for live session artifacts:
  - sessions
  - summaries
  - metrics snapshots
  - coaching nudges
- Added a background cloud-sync queue that only attempts protected writes when authenticated access exists.
- Reworked analytics and profile screens so they derive from stored session data instead of looking purely mocked.
- Added an actual app icon asset catalog and branded app icon set under:
  - `ios/LiveSesh/LiveSesh/Resources/Assets.xcassets/AppIcon.appiconset`

### Device and Build Setup

- Guided physical-device deployment through Xcode signing and developer-team setup.
- Confirmed the app runs on the user's iPhone.
- Confirmed the live session screen, analytics screen, and profile screen render correctly on device based on user screenshots.

---

## Current Repo State

### Branch

- Current branch: `main`

### Current Uncommitted Changes

At the time of this handoff, the working tree includes:

- modified:
  - `ios/LiveSesh/LiveSesh.xcodeproj/project.pbxproj`
- untracked:
  - `ios/LiveSesh/LiveSesh/Resources/`

Those changes are expected. They correspond to the newly added asset catalog and Xcode project updates needed for the app icon and local Xcode configuration.

### Verification

Latest verified state:

- `swift test` passes with `124` tests.
- The Swift Package test run emits one warning:
  - the new `Assets.xcassets` file is unhandled by `Package.swift`
- That warning does not break tests, but it should be cleaned up by either:
  - declaring resources in `Package.swift`, or
  - excluding the asset catalog from the package target

Important note:

- sandboxed `xcodebuild` asset verification from this environment is noisy because CoreSimulator is unavailable in the sandbox
- the correct practical verification for the icon is to reinstall the app on the phone and confirm the home-screen icon updates

---

## Current Supabase State

### Linked Project

- Supabase project ref: `ibikuhcxgnxkacpsxpaw`
- Supabase URL:
  - `https://ibikuhcxgnxkacpsxpaw.supabase.co`

### What Is Deployed

- database schema pushed
- `session-summary` edge function deployed

### What Exists in `supabase/`

- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/functions/session-summary/index.ts`

### Important Backend Reality

The backend exists, but the app is not fully using it yet because writes are protected by Row Level Security. The RLS policies require:

- `auth.uid() = tutor_id` for session writes
- session ownership for snapshots, nudges, and summaries

Right now the app still does not sign in a real tutor user, so protected cloud writes remain blocked unless a manual access token is injected. That is the primary backend/application gap.

---

## How the iOS App Works

### Entry Flow

The app entry point is:

- `ios/LiveSesh/LiveSesh/App/LiveSeshApp.swift`

It creates:

- `AppState`

`AppState` currently holds:

- a `SupabaseService`
- a `SessionStore`
- placeholder auth state fields

This is important: auth state exists conceptually in `AppState`, but there is no actual authentication implementation yet.

### Main Navigation

The main UI is driven by:

- `ios/LiveSesh/LiveSesh/App/ContentView.swift`

It shows a `TabView` with three tabs:

1. Session
2. Analytics
3. Profile

### Session Screen

The live-session product experience lives in:

- `ios/LiveSesh/LiveSesh/Features/Session/SessionView.swift`
- `ios/LiveSesh/LiveSesh/Features/Session/SessionViewModel.swift`

When the user starts a session:

1. `SessionViewModel.startSession()` creates a `LiveSession`.
2. The session is saved locally through `SessionStore`.
3. The app attempts to enqueue cloud sync if authenticated access exists.
4. `MetricsEngine` starts.
5. `CoachingEngine` starts.
6. A session timer starts.
7. `LiveCaptureController.start()` requests permissions and starts real capture on iOS hardware.

### Live Capture Pipeline

The real device capture path is:

- `LiveCaptureController`

It does the following:

1. Requests camera and microphone permissions.
2. Configures `AVAudioSession`.
3. Configures an `AVCaptureSession` with the front camera.
4. Streams video frames to `VideoProcessor`.
5. Streams audio signals to `AudioProcessor`.
6. Forwards processed outputs into `MetricsEngine`.

Current role behavior:

- live video gaze and expression are treated as tutor-side signals
- unknown audio speech can be normalized to tutor

That means the app currently performs tutor-side capture well enough to demo the system, but it is not yet a true tutor-versus-student live analysis system.

### Metrics and Coaching

Core logic lives in:

- `ios/LiveSesh/LiveSesh/Core/VideoProcessor/VideoProcessor.swift`
- `ios/LiveSesh/LiveSesh/Core/AudioProcessor/AudioProcessor.swift`
- `ios/LiveSesh/LiveSesh/Core/MetricsEngine/MetricsEngine.swift`
- `ios/LiveSesh/LiveSesh/Features/Coaching/CoachingEngine.swift`

Data flow:

1. `VideoProcessor` emits gaze and expression signals.
2. `AudioProcessor` emits audio levels and speaking state.
3. `MetricsEngine` turns those raw signals into:
   - tutor metrics
   - student metrics
   - session metrics
4. `CoachingEngine` evaluates the metrics stream and emits nudges.
5. `SessionViewModel` surfaces those nudges in the UI and persists them.

### Persistence

Local storage is handled by:

- `ios/LiveSesh/LiveSesh/Services/SessionStore/SessionStore.swift`

Cloud communication is handled by:

- `ios/LiveSesh/LiveSesh/Services/SupabaseService/SupabaseService.swift`

Current persistence model:

- local-first always
- cloud sync only if authenticated access exists

This is the right behavior for not losing session data, but it also means the user can currently have a working on-device app without actually satisfying the full backend requirements.

### Analytics and Profile

The analytics surface lives in:

- `ios/LiveSesh/LiveSesh/Features/Analytics/AnalyticsDashboardView.swift`

The profile surface lives in:

- `ios/LiveSesh/LiveSesh/App/ContentView.swift` under `ProfileView`

Current behavior:

- both screens primarily derive from locally stored summaries
- profile aggregates simple stats
- analytics shows session cards and basic trend state

They now feel like real product surfaces, but they still need authenticated backend-backed loading to be authoritative.

---

## What Is Working Right Now

### Confirmed Working

- app builds and runs locally
- app runs on a real iPhone
- session setup UI works
- real on-device tutor camera capture works
- live metrics render during session
- live nudges can render
- end-session flow works
- analytics screen reads stored sessions
- profile screen reads stored summaries
- Supabase project exists and schema is deployed
- local persistence works
- test suite passes

### Recently Added but Not Fully Verified in Sandbox

- branded app icon asset catalog

This should work on device after:

1. deleting the app from the iPhone
2. cleaning the build folder in Xcode
3. reinstalling the app

---

## What Is Not Finished Yet

### 1. Real Authentication

This is the most important missing piece.

Current problem:

- `SessionViewModel` still generates a local tutor UUID fallback
- `SupabaseService` still relies on a manually supplied access token if one exists
- `AppState` has no real sign-in flow

Result:

- RLS-protected writes are blocked in the intended real-world flow

### 2. Real Two-Party Analysis

Current problem:

- the app captures tutor-side device media
- it does not ingest the actual student's media stream from the tutoring session

Result:

- the "student" side of the metrics is not truly grounded in live student input

### 3. Backend Contract Completeness

Current problem:

- only `session-summary` exists as an edge function
- the iOS client still references other backend-style flows for tutor summaries/trends

Result:

- the backend contract is incomplete and split across local assumptions and one deployed function

### 4. Summary Logic Consistency

Current problem:

- iOS computes a local end summary
- the edge function also computes a summary from snapshots

Result:

- the system has more than one source of truth for post-session scoring

### 5. Accuracy and Latency Validation

Current problem:

- the system has targets in docs
- it does not yet have a validation report against labeled sessions

Result:

- the app can demonstrate behavior, but cannot yet prove performance or accuracy

### 6. Docs Need Honesty Pass

Current problem:

- some existing README and architecture language reads more complete than the current code really is

Result:

- the documentation should be tightened to match implemented behavior

---

## What I Was Working On Most Recently

Right before this handoff, the active work was:

1. adding a branded iPhone home-screen app icon
2. mapping the next major implementation step: real Supabase Auth

The icon work is now in the repo at:

- `ios/LiveSesh/LiveSesh/Resources/Assets.xcassets/AppIcon.appiconset`

The next major engineering task should not be UI polish. It should be authentication.

---

## Recommended Next Steps

### Phase 1: Real Supabase Auth

This should be the immediate next implementation.

Goal:

- the app signs in a real tutor
- the tutor ID becomes `auth.users.id`
- RLS-protected writes succeed without manual token hacks

Detailed plan:

1. Add the official Supabase Swift client package to the iOS app target.
2. Create an `AuthService` that owns a `SupabaseClient`.
3. Implement email OTP login first.
4. Restore the auth session on app launch.
5. Expose signed-in user/session state through `AppState`.
6. Gate the app UI so unauthenticated users see login first.
7. Replace the local tutor UUID fallback in `SessionViewModel` with the authenticated user ID.
8. Refactor `SupabaseService` so it uses the authenticated session token automatically.

Why email OTP first:

- fastest path to working auth
- no password UX to build
- simpler than Apple Sign In for the first pass
- aligns cleanly with Supabase Swift auth capabilities

Official references:

- `https://supabase.com/docs/reference/swift/v1/initializing`
- `https://supabase.com/docs/reference/swift/v1/auth-signinwithotp`
- `https://supabase.com/docs/reference/swift/v1/auth-verifyotp`
- `https://supabase.com/docs/reference/swift/v1/auth-getsession`
- `https://supabase.com/docs/reference/swift/v1/auth-getuser`

Acceptance criteria for Phase 1:

- user can log in from the app
- app restores session after relaunch
- session writes succeed in Supabase without `SUPABASE_ACCESS_TOKEN`
- `sessions.tutor_id` equals the authenticated user UUID
- cloud status banner reports real authenticated sync

### Phase 2: Backend Source of Truth

Goal:

- make backend-backed session history real
- stop split-brain summary logic

Tasks:

1. Decide whether summaries are computed client-side or server-side.
2. Prefer server-side summary generation as the source of truth.
3. Add missing backend endpoints or edge functions for:
   - tutor summaries
   - tutor trends
4. Update analytics/profile views to load backend-backed data for the signed-in tutor.

Acceptance criteria:

- analytics for a signed-in tutor can be rebuilt from Supabase data
- only one engagement summary formula is authoritative

### Phase 3: Real Student Media Integration

Goal:

- move from tutor-only capture to true two-party engagement analysis

Tasks:

1. decide where student media comes from:
   - embedded tutoring call SDK
   - remote WebRTC stream
   - mirrored session feed from another system
2. ingest separate tutor and student tracks
3. update `MetricsEngine` to consume actual participant-separated live signals
4. stop using tutor-side normalization as a substitute for student-side truth

Acceptance criteria:

- tutor and student metrics come from real distinct inputs
- speaking balance and interruptions are based on real participant streams

### Phase 4: Validation and Spec Hardening

Goal:

- prove the system is not just visually convincing, but measurably correct

Tasks:

1. collect sample recorded sessions
2. hand-label key moments and expected engagement signals
3. compare output against known labels
4. measure latency on device
5. write an honest validation note in docs

Acceptance criteria:

- latency is measured on real hardware
- at least a basic accuracy report exists for core metrics

---

## How to Move Forward in Practice

If another agent picks this up, the right first task is:

### First Concrete Task

Implement Supabase Auth in the iOS app using email OTP.

That means touching:

- `ios/LiveSesh/project.yml`
- `ios/LiveSesh/LiveSesh/App/AppState.swift`
- `ios/LiveSesh/LiveSesh/App/ContentView.swift`
- `ios/LiveSesh/LiveSesh/Services/SupabaseService/SupabaseService.swift`
- `ios/LiveSesh/LiveSesh/Features/Session/SessionViewModel.swift`

Likely new files:

- `ios/LiveSesh/LiveSesh/Services/AuthService/AuthService.swift`
- `ios/LiveSesh/LiveSesh/Features/Auth/LoginView.swift`
- `ios/LiveSesh/LiveSesh/Features/Auth/VerifyCodeView.swift`

Dashboard setup needed before coding:

1. In Supabase dashboard, enable Email auth.
2. Decide whether to use:
   - email code entry
   - magic link
3. For code entry, configure the email template to send the token instead of only the confirmation URL.

---

## Known Technical Notes for the Next Agent

### Important

- The iOS project currently contains user-specific Xcode-side changes in `project.pbxproj`.
- The publishable key is not secret, but a cleaner long-term setup would move user-specific settings into an xcconfig or environment-driven scheme setup.
- Do not put service-role keys or the database password in the app.

### App Icon Note

- The branded app icon has been added.
- Because app icons are cached aggressively by iOS, the correct verification step is a clean reinstall on the phone.

### Swift Package Note

- `swift test` passes.
- `Package.swift` currently warns about the new asset catalog.
- That warning should be cleaned up, but it does not block the app itself.

### Sandbox Note

- Command-line `xcodebuild` in this environment may report CoreSimulator-related noise.
- That is an environment limitation here, not proof the Xcode project is broken on the user's machine.

---

## Final Assessment

This repo is now in a good transitional state:

- no longer fake
- not yet complete
- close enough that the next steps are obvious

The project has already crossed the hardest early threshold: it runs on a real phone and demonstrates a believable end-to-end user experience. The next threshold is different. It is not about more UI. It is about identity, data truth, and real two-party signals.

If the next agent does only one major thing, it should be real Supabase Auth. That one change unlocks:

- legitimate cloud sync
- correct RLS behavior
- real tutor identity
- trustworthy analytics ownership
- a clean path into backend-backed history and validation

After auth, the highest-value technical problem becomes student-media ingestion. After that, the highest-value product problem becomes validation.
