-- Migration 11: Property listing status + staged deletion window
-- Run against: Supabase project (PAT 3.0)

-- 1. Add Zillow-style listing status column
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS listing_status TEXT
    CHECK (listing_status IN (
      'For Sale',
      'Under Contract',
      'Active Under Contract',
      'Sold',
      'Off Market'
    ));

-- 2. Add staged_for_deletion_at for the 5-business-day undo window
--    When set, property is visible in Catalogue with countdown banner.
--    softDeleteProperty() (sets deleted_at) finalizes removal client-side
--    after the window expires. No pg_cron — no rows are ever hard-deleted.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS staged_for_deletion_at TIMESTAMPTZ;

-- 3. Index to make staged-deletion lookups fast on Catalogue load
CREATE INDEX IF NOT EXISTS idx_properties_staged_for_deletion
  ON properties (staged_for_deletion_at)
  WHERE staged_for_deletion_at IS NOT NULL;
