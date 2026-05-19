-- PAT 3.0 — Investor Property Access Seed
--
-- Run this AFTER:
--   1. migration/02_migrate.js has completed (properties table is populated)
--   2. migration/03_seed_users.sql has run (team_members table is populated)
--
-- This grants vaishnav.udit27@gmail.com editor access to "5 Llewellyn Place" ONLY.
-- Replace the UUID placeholders with real values from Supabase.

-- Step 1: Find the property ID for "5 Llewellyn Place"
-- Run this first to get the UUID, then use it below:
--
--   SELECT id, address FROM properties WHERE address ILIKE '%llewellyn%';

-- Step 2: Insert the access record
-- Replace PROPERTY_UUID with the result from Step 1
-- Replace VAISHNAV_UUID with the investor's Auth user ID
-- Replace DMALDE_UUID with the approving founder's Auth user ID

INSERT INTO property_access (
  property_id,
  user_id,
  role,
  access_requested_at,
  access_approved_at,
  access_approved_by
)
VALUES (
  '86bdd157-d02c-47a0-9e6b-564428d2416a',  -- 5 Llewellyn Place
  'd6cf9798-dbac-47b7-ac21-edfba594bbd1',  -- vaishnav.udit27@gmail.com (investor)
  'editor',
  NOW(),
  NOW(),
  'de0fa524-b1af-4ce7-baaf-5d2c848b0df1'  -- dmalde1998@gmail.com (approving founder)
)
ON CONFLICT (property_id, user_id) DO UPDATE SET
  role               = EXCLUDED.role,
  access_approved_at = EXCLUDED.access_approved_at,
  access_approved_by = EXCLUDED.access_approved_by,
  updated_at         = NOW();

-- Verify
SELECT
  pa.id,
  p.address,
  tm.email,
  pa.role,
  pa.access_approved_at
FROM property_access pa
JOIN properties p ON p.id = pa.property_id
JOIN team_members tm ON tm.user_id = pa.user_id
ORDER BY p.address;
