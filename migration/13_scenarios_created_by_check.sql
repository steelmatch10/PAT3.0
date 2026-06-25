-- Migration 13: Enforce scenarios.created_by integrity at the database layer
-- Run against: Supabase project (PAT 3.0)
--
-- Context: scenarios.created_by exists but was never written to or constrained.
-- Phase 1B wires it up to show an "Investor-created" badge so founders can see
-- who created a scenario. Without a server-side check, the column was set
-- purely from the client's insert payload — an investor's browser session
-- could write any UUID into created_by (including a founder's), inverting the
-- trust signal the badge exists to provide. This migration closes that gap by
-- defaulting created_by to the inserting user and rejecting any insert that
-- claims a different created_by.

-- 1. Default created_by to the inserting user so the client never has to set it.
ALTER TABLE scenarios
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 2. Enforce created_by at the RLS layer: investors may only insert scenarios
-- attributed to themselves (NULL is also rejected here since the app always
-- supplies auth.uid() going forward — existing pre-migration rows with NULL
-- created_by are untouched and unaffected by this INSERT-only check).
DROP POLICY IF EXISTS "investors_insert_approved_scenarios" ON scenarios;

CREATE POLICY "investors_insert_approved_scenarios" ON scenarios
  FOR INSERT WITH CHECK (
    get_my_role() = 'investor'
    AND created_by = auth.uid()
    AND property_id IN (
      SELECT property_id FROM property_access
      WHERE user_id = auth.uid() AND access_approved_at IS NOT NULL
    )
  );
