-- LiveSesh: AI-Powered Live Session Analysis
-- Initial database schema for Nerdy tutoring platform integration

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tutor_id UUID NOT NULL REFERENCES auth.users(id),
    student_id UUID REFERENCES auth.users(id),
    subject TEXT NOT NULL,
    student_level TEXT NOT NULL CHECK (student_level IN (
        'Elementary', 'Middle School', 'High School', 'College', 'Graduate', 'Professional'
    )),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    engagement_score DOUBLE PRECISION CHECK (engagement_score >= 0 AND engagement_score <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Metrics snapshots (time-series data)
CREATE TABLE metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tutor_eye_contact DOUBLE PRECISION NOT NULL CHECK (tutor_eye_contact >= 0 AND tutor_eye_contact <= 1),
    student_eye_contact DOUBLE PRECISION NOT NULL CHECK (student_eye_contact >= 0 AND student_eye_contact <= 1),
    tutor_talk_pct DOUBLE PRECISION NOT NULL CHECK (tutor_talk_pct >= 0 AND tutor_talk_pct <= 1),
    student_talk_pct DOUBLE PRECISION NOT NULL CHECK (student_talk_pct >= 0 AND student_talk_pct <= 1),
    tutor_energy DOUBLE PRECISION NOT NULL CHECK (tutor_energy >= 0 AND tutor_energy <= 1),
    student_energy DOUBLE PRECISION NOT NULL CHECK (student_energy >= 0 AND student_energy <= 1),
    interruption_count INTEGER NOT NULL DEFAULT 0,
    engagement_trend TEXT NOT NULL CHECK (engagement_trend IN ('rising', 'stable', 'declining'))
);

-- Coaching nudges
CREATE TABLE coaching_nudges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    nudge_type TEXT NOT NULL CHECK (nudge_type IN (
        'engagement_check', 'attention_alert', 'talk_time_balance',
        'energy_drop', 'interruption_spike', 'positive_reinforcement'
    )),
    message TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    was_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    trigger_data JSONB DEFAULT '{}'::jsonb
);

-- Session summaries
CREATE TABLE session_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
    duration_minutes INTEGER NOT NULL,
    talk_time_ratio JSONB NOT NULL,
    avg_eye_contact JSONB NOT NULL,
    total_interruptions INTEGER NOT NULL DEFAULT 0,
    engagement_score DOUBLE PRECISION NOT NULL CHECK (engagement_score >= 0 AND engagement_score <= 100),
    key_moments JSONB DEFAULT '[]'::jsonb,
    recommendations TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX idx_sessions_tutor_id ON sessions(tutor_id);
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX idx_metrics_session_id ON metrics_snapshots(session_id);
CREATE INDEX idx_metrics_timestamp ON metrics_snapshots(timestamp);
CREATE INDEX idx_nudges_session_id ON coaching_nudges(session_id);
CREATE INDEX idx_summaries_session_id ON session_summaries(session_id);

-- Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;

-- Policies: Tutors can only see their own data
CREATE POLICY "Tutors can view own sessions" ON sessions
    FOR SELECT USING (auth.uid() = tutor_id);

CREATE POLICY "Tutors can insert own sessions" ON sessions
    FOR INSERT WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can update own sessions" ON sessions
    FOR UPDATE USING (auth.uid() = tutor_id);

CREATE POLICY "View metrics for own sessions" ON metrics_snapshots
    FOR SELECT USING (
        session_id IN (SELECT id FROM sessions WHERE tutor_id = auth.uid())
    );

CREATE POLICY "Insert metrics for own sessions" ON metrics_snapshots
    FOR INSERT WITH CHECK (
        session_id IN (SELECT id FROM sessions WHERE tutor_id = auth.uid())
    );

CREATE POLICY "View nudges for own sessions" ON coaching_nudges
    FOR SELECT USING (
        session_id IN (SELECT id FROM sessions WHERE tutor_id = auth.uid())
    );

CREATE POLICY "Insert nudges for own sessions" ON coaching_nudges
    FOR INSERT WITH CHECK (
        session_id IN (SELECT id FROM sessions WHERE tutor_id = auth.uid())
    );

CREATE POLICY "View summaries for own sessions" ON session_summaries
    FOR SELECT USING (
        session_id IN (SELECT id FROM sessions WHERE tutor_id = auth.uid())
    );

CREATE POLICY "Insert summaries for own sessions" ON session_summaries
    FOR INSERT WITH CHECK (
        session_id IN (SELECT id FROM sessions WHERE tutor_id = auth.uid())
    );
