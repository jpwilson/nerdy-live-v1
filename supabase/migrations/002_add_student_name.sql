-- Add student_name to sessions for display purposes
-- (avoids joining auth.users which is complex with RLS)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS student_name TEXT;

-- Index for per-student queries
CREATE INDEX IF NOT EXISTS idx_sessions_student_id ON sessions(student_id);
