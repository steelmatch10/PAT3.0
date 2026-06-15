-- Migration 12: Property archive reason + retire staged-deletion window
-- Run against: Supabase project (PAT 3.0)
--
-- Context: Archive Property no longer requires a pre-selected listing status
-- and no longer stages the property for delayed removal. Archiving now
-- records a required reason (and optional listing status) directly.
-- Full removal is handled separately via a permanent hard-delete
-- ("Erase Property from Database").

-- 1. Archive metadata
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- 2. Retire the 5-business-day staged-deletion window (superseded by hard delete)
DROP INDEX IF EXISTS idx_properties_staged_for_deletion;

ALTER TABLE properties
  DROP COLUMN IF EXISTS staged_for_deletion_at;
