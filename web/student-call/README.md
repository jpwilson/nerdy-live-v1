# LiveSesh Student Call

Standalone Next.js student-side call surface for LiveSesh.

## What it does

- Captures webcam and microphone from a browser
- Joins a dedicated Supabase Realtime room topic for signaling
- Establishes a one-to-one WebRTC connection
- Shows the incoming remote feed plus a local preview
- Supports a browser-only `tutor_preview` role so the call path is testable before the iOS tutor app joins the same room

## Setup

1. Copy `.env.example` to `.env.local`
2. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - optionally `NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON`
3. Install dependencies
4. Start the dev server

```bash
cd web/student-call
npm install
npm run dev
```

Open `http://localhost:3000`.

## Room model

- Topic: `room:<roomId>:webrtc`
- Broadcast event: `webrtc_signal`
- Presence payload:

```json
{
  "peerId": "uuid",
  "displayName": "Student Guest",
  "role": "student",
  "joinedAt": "2026-03-11T16:00:00.000Z"
}
```

- Signal payload:

```json
{
  "from": "uuid",
  "to": "uuid",
  "sentAt": "2026-03-11T16:00:03.000Z",
  "displayName": "Student Guest",
  "role": "student",
  "kind": "description",
  "description": {
    "type": "offer",
    "sdp": "..."
  }
}
```

`kind` can be `description`, `ice_candidate`, or `hangup`.

## Current limitations

- Channels are public for now because the broader auth story in this repo is still in flux. Production should move to private Realtime channels with authenticated participants.
- The browser app uses STUN by default. Real deployments need TURN credentials for restrictive networks.
- The tutor analysis still lives outside this app. The intended next step is wiring the iOS tutor client to the same topic and feeding the incoming remote stream into the metrics pipeline.
