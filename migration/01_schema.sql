-- PAT 3.0 — Supabase Schema (v2)
-- Run this in the Supabase SQL Editor BEFORE creating users or migrating data.
-- All tables use UUID primary keys. RLS is mandatory — do not skip.

-- ============================================================
-- 1. PROPERTIES
-- ============================================================
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  zillow_link TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP,
  pinned BOOLEAN DEFAULT false,
  CONSTRAINT address_unique UNIQUE(address)
);

CREATE INDEX idx_properties_created_by ON properties(created_by);
CREATE INDEX idx_properties_created_at ON properties(created_at);

-- ============================================================
-- 2. SCENARIOS
-- ============================================================
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('GRASP', 'FRAT', 'PAPPY')),
  scenario_name TEXT NOT NULL,
  scenario_description TEXT,
  bedrooms_or_units INT NOT NULL,
  calculate_per_bedroom BOOLEAN DEFAULT false,
  inputs JSONB NOT NULL,
  computed JSONB NOT NULL,
  bedroom_details JSONB,
  bands JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMP,
  UNIQUE(property_id, module, scenario_name)
);

CREATE INDEX idx_scenarios_property_id ON scenarios(property_id);
CREATE INDEX idx_scenarios_module ON scenarios(module);
CREATE INDEX idx_scenarios_created_at ON scenarios(created_at);
CREATE INDEX idx_scenarios_archived_at ON scenarios(archived_at);

-- ============================================================
-- 3. PROPERTY ACCESS (per-property role override for investors)
-- ============================================================
CREATE TABLE property_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  access_requested_at TIMESTAMP,
  access_approved_at TIMESTAMP,
  access_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(property_id, user_id)
);

CREATE INDEX idx_property_access_user_id ON property_access(user_id);
CREATE INDEX idx_property_access_approved_at ON property_access(access_approved_at);

-- ============================================================
-- 4. TEAM MEMBERS
-- ============================================================
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  global_role TEXT NOT NULL CHECK (global_role IN ('founder', 'investor')),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone_primary TEXT,
  phone_secondary TEXT,
  email_secondary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- Enable RLS on all tables before creating policies.
-- ============================================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5a. HELPER FUNCTION (must be created before policies)
-- Security-definer bypasses RLS when reading team_members,
-- preventing infinite recursion in all downstream policies.
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT global_role FROM team_members WHERE user_id = auth.uid() LIMIT 1;
$$;

-- PROPERTIES
CREATE POLICY "founders_all_properties" ON properties
  FOR ALL USING (get_my_role() = 'founder');

CREATE POLICY "investors_read_all_properties" ON properties
  FOR SELECT USING (get_my_role() = 'investor');

-- SCENARIOS
CREATE POLICY "founders_all_scenarios" ON scenarios
  FOR ALL USING (get_my_role() = 'founder');

-- Investors can read ALL scenarios (read-only); write ops remain gated to approved properties below
CREATE POLICY "investors_read_all_scenarios" ON scenarios
  FOR SELECT USING (get_my_role() = 'investor');

CREATE POLICY "investors_insert_approved_scenarios" ON scenarios
  FOR INSERT WITH CHECK (
    get_my_role() = 'investor'
    AND property_id IN (
      SELECT property_id FROM property_access
      WHERE user_id = auth.uid() AND access_approved_at IS NOT NULL
    )
  );

CREATE POLICY "investors_update_approved_scenarios" ON scenarios
  FOR UPDATE USING (
    get_my_role() = 'investor'
    AND property_id IN (
      SELECT property_id FROM property_access
      WHERE user_id = auth.uid() AND access_approved_at IS NOT NULL
    )
  );

CREATE POLICY "investors_delete_approved_scenarios" ON scenarios
  FOR DELETE USING (
    get_my_role() = 'investor'
    AND property_id IN (
      SELECT property_id FROM property_access
      WHERE user_id = auth.uid() AND access_approved_at IS NOT NULL
    )
  );

-- PROPERTY_ACCESS
CREATE POLICY "founders_manage_property_access" ON property_access
  FOR ALL USING (get_my_role() = 'founder');

-- Investors can read their own access rows (needed so frontend can identify approved properties)
CREATE POLICY "investors_read_own_property_access" ON property_access
  FOR SELECT USING (
    get_my_role() = 'investor'
    AND user_id = auth.uid()
  );

-- TEAM_MEMBERS: any authenticated user reads their own row (bootstraps role check)
CREATE POLICY "users_read_own_team_member" ON team_members
  FOR SELECT USING (auth.uid() = user_id);

-- TEAM_MEMBERS: any authenticated user can update their own row (profile widget)
CREATE POLICY "users_update_own_team_member" ON team_members
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- TEAM_MEMBERS: investors can read founder rows (for "Your Team" contact section)
CREATE POLICY "investors_read_founders" ON team_members
  FOR SELECT USING (
    get_my_role() = 'investor'
    AND global_role = 'founder'
  );

-- TEAM_MEMBERS: founders manage all rows
CREATE POLICY "founders_manage_team_members" ON team_members
  FOR ALL USING (get_my_role() = 'founder');

-- ============================================================
-- MIGRATIONS (run these after initial schema creation)
-- ============================================================

-- v2.1: Add income_efficiency to properties (per-property DSCR guidance setting)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS income_efficiency NUMERIC DEFAULT 80;

-- v2.2: Split address into discrete columns; drop single-string address column
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS city   TEXT,
  ADD COLUMN IF NOT EXISTS state  TEXT,
  ADD COLUMN IF NOT EXISTS zip    TEXT;

UPDATE properties
SET
  street = TRIM(SPLIT_PART(address, ',', 1)),
  city   = TRIM(SPLIT_PART(address, ',', 2)),
  state  = TRIM(SPLIT_PART(SPLIT_PART(address, ',', 3), ' ', 2)),
  zip    = TRIM(SPLIT_PART(SPLIT_PART(address, ',', 3), ' ', 3))
WHERE street IS NULL;

ALTER TABLE properties
  ALTER COLUMN street SET NOT NULL,
  ALTER COLUMN city   SET NOT NULL,
  ALTER COLUMN state  SET NOT NULL,
  ALTER COLUMN zip    SET NOT NULL;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS address_unique;
ALTER TABLE properties ADD CONSTRAINT address_street_zip_unique UNIQUE (street, zip);
ALTER TABLE properties DROP COLUMN IF EXISTS address;

-- v2.3: Property management cut — percentage of gross rent taken by property manager (default 10%)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_management_cut NUMERIC DEFAULT 10;
