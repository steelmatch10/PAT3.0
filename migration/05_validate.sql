-- PAT 3.0 — Migration Validation Queries
-- Run these in the Supabase SQL Editor after migration to verify data integrity.

-- ── 1. ROW COUNTS ─────────────────────────────────────────────────────────────
SELECT 'properties' AS table_name, COUNT(*) AS row_count FROM properties WHERE deleted_at IS NULL
UNION ALL
SELECT 'scenarios',   COUNT(*) FROM scenarios WHERE archived_at IS NULL
UNION ALL
SELECT 'team_members', COUNT(*) FROM team_members
UNION ALL
SELECT 'property_access', COUNT(*) FROM property_access;
-- Expected: properties = unique CSV addresses, scenarios = CSV data rows, team_members = 4, property_access = 1

-- ── 2. PROPERTIES LIST ────────────────────────────────────────────────────────
SELECT
  p.address,
  COUNT(s.id) AS scenario_count
FROM properties p
LEFT JOIN scenarios s ON s.property_id = p.id AND s.archived_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.address
ORDER BY p.address;

-- ── 3. SPOT CHECK — 5 LLEWELLYN PLACE ────────────────────────────────────────
SELECT
  s.scenario_name,
  s.scenario_description,
  s.bedrooms_or_units,
  s.inputs->>'propertyValue' AS property_value,
  s.inputs->>'taxesAnnual' AS taxes_annual,
  s.computed->>'cashOnCash' AS coc,
  s.computed->>'capRate' AS cap_rate,
  s.computed->>'dscr' AS dscr,
  s.bands->>'cashOnCash' AS band_coc,
  s.created_at
FROM scenarios s
JOIN properties p ON p.id = s.property_id
WHERE p.address ILIKE '%llewellyn%'
ORDER BY s.created_at;

-- ── 4. INVESTOR ACCESS CHECK ─────────────────────────────────────────────────
-- Should return exactly 1 row (5 Llewellyn Place only)
SELECT
  tm.email,
  p.address,
  pa.role,
  pa.access_approved_at
FROM property_access pa
JOIN team_members tm ON tm.user_id = pa.user_id
JOIN properties p ON p.id = pa.property_id
WHERE tm.global_role = 'investor'
ORDER BY p.address;

-- ── 5. VERIFY NO MISSING COMPUTED FIELDS ─────────────────────────────────────
SELECT
  p.address,
  s.scenario_name,
  s.computed->>'grossRentMonthly' AS gross_rent,
  s.computed->>'capRate' AS cap_rate,
  s.computed->>'cashOnCash' AS coc,
  s.computed->>'dscr' AS dscr
FROM scenarios s
JOIN properties p ON p.id = s.property_id
WHERE s.archived_at IS NULL
  AND (
    s.computed->>'capRate' IS NULL
    OR s.computed->>'cashOnCash' IS NULL
    OR s.computed->>'dscr' IS NULL
  );
-- Expected: 0 rows (all scenarios have computed KPIs)

-- ── 6. VERIFY TAXES STORED ANNUALLY ──────────────────────────────────────────
-- Should be annual values (monthly × 12), e.g., 97 Throop: $368.75/mo → $4,425 annual
SELECT
  p.address,
  s.scenario_name,
  (s.inputs->>'taxesAnnual')::numeric AS taxes_annual,
  (s.inputs->>'taxesAnnual')::numeric / 12 AS taxes_monthly_equiv
FROM scenarios s
JOIN properties p ON p.id = s.property_id
WHERE p.address = '97 Throop Avenue'
ORDER BY s.created_at;

-- ── 7. TEAM MEMBERS CHECK ────────────────────────────────────────────────────
SELECT user_id, global_role, email, created_at
FROM team_members
ORDER BY global_role, email;
