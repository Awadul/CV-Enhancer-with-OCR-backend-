-- Application Deadline Tracker: Add deadline column to applications table
-- Run this in Supabase SQL Editor

-- Feature: Application Deadline Tracker
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
