-- Application Tracker V2: Add new columns to applications table
-- Run this in Supabase SQL Editor

-- Feature 4: Resume & Cover Letter Tracking
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_version TEXT DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter_used BOOLEAN DEFAULT FALSE;

-- Feature 5: Application Timeline
ALTER TABLE applications ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]';

-- Feature 7: Enhanced Interview Scheduler
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_type TEXT DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_link TEXT DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interviewer_name TEXT DEFAULT '';

-- Feature 10: Priority Tags
ALTER TABLE applications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
