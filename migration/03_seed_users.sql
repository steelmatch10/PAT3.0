-- PAT 3.0 — Team Members Seed
--
-- Run this AFTER creating all 4 users in Supabase Auth (Authentication > Users).
-- Replace each placeholder UUID with the actual user ID from the Auth dashboard.
--
-- Steps:
--   1. Go to Supabase > Authentication > Users
--   2. Create each user with email/password
--   3. Copy the UUID for each user
--   4. Replace the placeholders below
--   5. Run this SQL in the Supabase SQL Editor

INSERT INTO team_members (user_id, global_role, email, first_name, last_name, phone_primary, phone_secondary, email_secondary) VALUES
  -- dmalde1998@gmail.com (Primary founder — runs migration)
  ('de0fa524-b1af-4ce7-baaf-5d2c848b0df1', 'founder',  'dmalde1998@gmail.com',       'Dharmin',   'Malde',    NULL, NULL, NULL),

  -- dan.daanish@gmail.com (Founder)
  ('a408c3e7-904c-4687-a08f-6a45df2780fc', 'founder',  'dan.daanish@gmail.com',       'FNU',       'Daanish',  NULL, NULL, NULL),

  -- jaydaslot4@gmail.com (Founder)
  ('8e18471d-7d79-4876-9cb4-4dc94724e112', 'founder',  'jaydaslot4@gmail.com',        'Jay',       'Das',      NULL, NULL, NULL),

  -- vaishnav.udit27@gmail.com (Investor — limited access)
  ('d6cf9798-dbac-47b7-ac21-edfba594bbd1', 'investor', 'vaishnav.udit27@gmail.com',   'Udit',      'Vaishnav', NULL, NULL, NULL)

ON CONFLICT (user_id) DO UPDATE SET
  global_role     = EXCLUDED.global_role,
  email           = EXCLUDED.email,
  first_name      = EXCLUDED.first_name,
  last_name       = EXCLUDED.last_name,
  phone_primary   = EXCLUDED.phone_primary,
  phone_secondary = EXCLUDED.phone_secondary,
  email_secondary = EXCLUDED.email_secondary,
  updated_at      = NOW();

-- Verify inserts
SELECT user_id, global_role, email, created_at
FROM team_members
ORDER BY global_role, email;
