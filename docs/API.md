# API Documentation
## AI-Powered Live Session Analysis

### Data Models

#### Real-Time Metrics Snapshot
```json
{
  "timestamp": "2024-01-15T14:32:45Z",
  "session_id": "session_123",
  "metrics": {
    "tutor": {
      "eye_contact_score": 0.85,
      "talk_time_percent": 0.65,
      "energy_score": 0.72,
      "current_speaking": true
    },
    "student": {
      "eye_contact_score": 0.45,
      "talk_time_percent": 0.35,
      "energy_score": 0.58,
      "current_speaking": false
    },
    "session": {
      "interruption_count": 2,
      "silence_duration_current": 0,
      "engagement_trend": "declining"
    }
  }
}
```

#### Coaching Nudge
```json
{
  "timestamp": "2024-01-15T14:32:45Z",
  "nudge_type": "engagement_check",
  "message": "Student hasn't spoken in 4 minutes. Consider asking a question.",
  "priority": "medium",
  "trigger_metrics": {
    "student_silence_duration": 240,
    "student_eye_contact_avg": 0.42
  }
}
```

#### Post-Session Summary
```json
{
  "session_id": "session_123",
  "duration_minutes": 45,
  "summary": {
    "talk_time_ratio": { "tutor": 0.62, "student": 0.38 },
    "avg_eye_contact": { "tutor": 0.78, "student": 0.54 },
    "total_interruptions": 8,
    "engagement_score": 72,
    "key_moments": [
      {
        "timestamp": "00:12:34",
        "type": "attention_drop",
        "description": "Student engagement dropped significantly"
      }
    ]
  },
  "recommendations": [
    "Try shorter explanation segments",
    "Ask more check-for-understanding questions"
  ]
}
```

### Supabase Schema

#### sessions
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| tutor_id | uuid | References auth.users |
| student_id | uuid | References auth.users |
| subject | text | Session subject |
| student_level | text | Student proficiency level |
| started_at | timestamptz | Session start time |
| ended_at | timestamptz | Session end time |
| duration_minutes | int | Calculated duration |
| engagement_score | float | Overall engagement (0-100) |

#### metrics_snapshots
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| session_id | uuid | References sessions |
| timestamp | timestamptz | Measurement time |
| tutor_eye_contact | float | 0-1 score |
| student_eye_contact | float | 0-1 score |
| tutor_talk_pct | float | 0-1 ratio |
| student_talk_pct | float | 0-1 ratio |
| tutor_energy | float | 0-1 score |
| student_energy | float | 0-1 score |
| interruption_count | int | Cumulative count |
| engagement_trend | text | rising/stable/declining |

#### coaching_nudges
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| session_id | uuid | References sessions |
| timestamp | timestamptz | When nudge was triggered |
| nudge_type | text | Category of nudge |
| message | text | Display message |
| priority | text | low/medium/high |
| was_dismissed | boolean | Did tutor dismiss it? |
| trigger_data | jsonb | Metrics that triggered nudge |

#### session_summaries
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| session_id | uuid | References sessions |
| talk_time_ratio | jsonb | {tutor: float, student: float} |
| avg_eye_contact | jsonb | {tutor: float, student: float} |
| total_interruptions | int | Total count |
| engagement_score | float | 0-100 overall score |
| key_moments | jsonb[] | Array of notable events |
| recommendations | text[] | Improvement suggestions |
| created_at | timestamptz | When summary was generated |

### Edge Functions

#### POST /functions/v1/session-summary
Generates post-session analytics summary from stored metrics snapshots.

#### GET /functions/v1/tutor-trends?tutor_id={id}&days={n}
Returns engagement trends across recent sessions for coaching recommendations.

#### POST /functions/v1/improvement-plan
Generates personalized improvement plan based on session history.
