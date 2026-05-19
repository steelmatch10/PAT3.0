# PAT 3.0 — Supabase Schema & Data Migration Spec (UPDATED)

**Status:** Ready for implementation (v2 — Updated data model)  
**Target Platform:** Supabase PostgreSQL + Auth  
**Scope:** GRASP module only (Phase 1)  
**Frontend Update:** PAT3.0 vanilla JS to consume Supabase client

---

## 1. Database Schema (PostgreSQL)

### 1.1 Properties Table

```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core identification
  address TEXT NOT NULL,
  zillow_link TEXT,
  
  -- Metadata
  notes TEXT,
  
  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Soft delete
  deleted_at TIMESTAMP,
  
  CONSTRAINT address_unique UNIQUE(address)
);

CREATE INDEX idx_properties_created_by ON properties(created_by);
CREATE INDEX idx_properties_created_at ON properties(created_at);
```

**Note:** Properties are now purely the address + metadata. All financial and scenario-specific data lives in the `scenarios` table.

---

### 1.2 Scenarios Table (Analysis Module + Scenarios Combined)

```sql
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  -- Module identifier
  module TEXT NOT NULL CHECK (module IN ('GRASP', 'FRAT', 'PAPPY')),
  
  -- Scenario metadata
  scenario_name TEXT NOT NULL,
  scenario_description TEXT,
  
  -- Property characteristics (scenario-specific because they vary per scenario)
  bedrooms_or_units INT NOT NULL,
  calculate_per_bedroom BOOLEAN DEFAULT true,
  
  -- Data layer (both stored as JSONB for flexibility)
  inputs JSONB NOT NULL,
  computed JSONB NOT NULL,
  
  -- Bedroom/unit breakdown (only populated if calculate_per_bedroom = true)
  -- Structure: [ {bedroomIndex: 1, bedroomDesc: "Master", bedroomRent: 1200}, ... ]
  bedroom_details JSONB,
  
  -- Optional rating bands (GRASP only, but kept flexible)
  bands JSONB,
  
  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Soft delete for archive workflow
  archived_at TIMESTAMP,
  
  -- One canonical scenario per property/module/name combination
  UNIQUE(property_id, module, scenario_name)
);

CREATE INDEX idx_scenarios_property_id ON scenarios(property_id);
CREATE INDEX idx_scenarios_module ON scenarios(module);
CREATE INDEX idx_scenarios_created_at ON scenarios(created_at);
CREATE INDEX idx_scenarios_archived_at ON scenarios(archived_at);
```

**Key Changes:**
- Renamed from `analyses` to `scenarios` (clearer naming)
- Moved `bedrooms_or_units` and property characteristics into scenario (they vary per scenario)
- Added `calculate_per_bedroom` boolean flag
- Added `bedroom_details` JSONB for per-bedroom/unit breakdown (only used if flag is true)
- All financial inputs/outputs live here (inputs, computed, bands)

---

### 1.3 Access Control Table

```sql
CREATE TABLE property_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role for this property
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  
  -- Request flow (admin approves investor access)
  access_requested_at TIMESTAMP,
  access_approved_at TIMESTAMP,
  access_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- One access record per user per property
  UNIQUE(property_id, user_id)
);

CREATE INDEX idx_property_access_user_id ON property_access(user_id);
CREATE INDEX idx_property_access_approved_at ON property_access(access_approved_at);
```

---

### 1.4 Team Members Table

```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Global role (transcends individual property access)
  global_role TEXT NOT NULL CHECK (global_role IN ('founder', 'investor')),
  
  -- Metadata
  email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);
```

---

### 1.5 Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- PROPERTIES: Founders see all; investors see only properties they have access to
CREATE POLICY "founders_all_properties" ON properties
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE global_role = 'founder'
    )
  );

CREATE POLICY "investors_approved_properties" ON properties
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE global_role = 'investor'
    )
    AND id IN (
      SELECT property_id FROM property_access 
      WHERE user_id = auth.uid() 
      AND access_approved_at IS NOT NULL
    )
  );

-- SCENARIOS: Founders can do anything; investors can read/write only for approved properties
CREATE POLICY "founders_all_scenarios" ON scenarios
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE global_role = 'founder'
    )
  );

CREATE POLICY "investors_approved_scenarios" ON scenarios
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE global_role = 'investor'
    )
    AND property_id IN (
      SELECT property_id FROM property_access 
      WHERE user_id = auth.uid() 
      AND access_approved_at IS NOT NULL
    )
  );

CREATE POLICY "investors_modify_approved_scenarios" ON scenarios
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE global_role = 'investor'
    )
    AND property_id IN (
      SELECT property_id FROM property_access 
      WHERE user_id = auth.uid() 
      AND access_approved_at IS NOT NULL
    )
  );

-- PROPERTY_ACCESS: Only admins can manage
CREATE POLICY "admin_property_access" ON property_access
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE global_role = 'founder'
    )
  );

-- TEAM_MEMBERS: Only admins can view/manage
CREATE POLICY "admin_team_members" ON team_members
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE global_role = 'founder'
    )
  );
```

---

## 2. Data Migration Plan

### 2.1 GRASP CSV → Supabase

**Source CSV Columns → Database Fields:**

| CSV Column | Target Field | Notes |
|---|---|---|
| Property Location (w/ Link) | properties.address | Deduplicate by address |
| Link portion | properties.zillow_link | Extract URL from "Property Location" column |
| Comments | scenarios.scenario_description | Parse for scenario name in migration step |
| Bedrooms/Unit | scenarios.bedrooms_or_units | Scenario-specific |
| All numeric inputs | scenarios.inputs (JSONB) | See Section 5.1 |
| All calculated values | scenarios.computed (JSONB) | See Section 5.2 |
| Rating bands | scenarios.bands (JSONB) | See Section 5.3 |

**Tax Field Change:**
- CSV currently has `Taxes` (appears to be annual from Zillow)
- Migrate to `taxesAnnual` in inputs (not `taxesMonthly`)
- Frontend will offer toggle to display as monthly (divide by 12) or annual

**Scenario Naming Logic:**
1. If "Comments" field contains "Case" (e.g., "Best Case Scenario") → use as scenario_name
2. If "Comments" contains property value or condition → create scenario name: `"{propertyValue}_{condition}"` (e.g., "650k_asking_price")
3. Fallback: Use address + row index as unique identifier

**Rent Field Removal:**
- Old: `rentPerUnitMonthly` stored in inputs
- New: Remove from inputs entirely
- Why: `grossRentMonthly` is calculated and stored in computed; bedroom breakdown provides granularity if needed

**New Field: Suggested Gross Rent**
- Old: `suggestedRentPerUnit` (with nested coc/cap objects)
- New: Rename to `suggestedGrossRent` (with same nested structure)
- This lives in `computed` JSONB

**Bedroom Details (For Future Use):**
- Currently: Leave blank during migration (scenarios migrated from CSV won't have per-bedroom breakdown)
- Why: CSV doesn't have per-bedroom data; scenarios will use `calculate_per_bedroom: false` during migration
- Frontend: Allow users to add per-bedroom details after property is imported

### 2.2 User Setup

**Team Members to Create (in Supabase Auth + team_members table):**

| Email | Role | Notes |
|-------|------|-------|
| dmalde1998@gmail.com | Founder | Primary owner (data migration runs as this user) |
| dan.daanish@gmail.com | Founder | Full access to all properties |
| jaydaslot4@gmail.com | Founder | Full access to all properties |
| vaishnav.udit27@gmail.com | Investor | Approved access to "5 Llewellyn Place" ONLY |

**Property Access to Set Up:**
- Investor (vaishnav.udit27@gmail.com) gets `access_requested_at = NOW()`, `access_approved_at = NOW()` for "5 Llewellyn Place" ONLY
- All other properties: investor has no access record (RLS blocks read/write)

---

## 3. Frontend Integration (PAT3.0 Updates)

### 3.1 Replace localStorage with Supabase Client

**Current flow (localStorage):**
```javascript
// OLD
const properties = JSON.parse(localStorage.getItem('pat-1.0.0'));
```

**New flow (Supabase):**
```javascript
// NEW
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fetch all properties (founders see all, investors see approved only)
const { data: properties } = await supabase
  .from('properties')
  .select('*')
  .is('deleted_at', null);

// Fetch scenarios for one property
const { data: scenarios } = await supabase
  .from('scenarios')
  .select('*')
  .eq('property_id', propertyId)
  .is('archived_at', null)
  .order('created_at', { ascending: false });

// Create new scenario
await supabase
  .from('scenarios')
  .insert({
    property_id: propertyId,
    module: 'GRASP',
    scenario_name: 'New Scenario',
    bedrooms_or_units: 8,
    calculate_per_bedroom: false,
    inputs: {...},
    computed: {...}
  });
```

### 3.2 UI Changes Needed

**Login Page:**
- Email/password form (Supabase Auth)
- Link to sign up (if first-time user)

**Properties List:**
- Show only properties user has access to (RLS handles filtering)
- "Request Access" button visible only for investors (for properties they don't have access to)

**Property Detail View:**
- Scenario list (tabs or dropdown, one scenario per tab)
- "Create New Scenario" button
- For each scenario, show:
  - Scenario name + description
  - Bedrooms/units count
  - All inputs (formatted for readability)
  - All computed values (formatted with bands for color-coding if present)
  - "Edit" button (founders only, or investors for approved properties)
  - "Archive" button (instead of delete)

**Edit Scenario Form:**
- Input fields matching GRASP inputs (see Section 5.1)
- Tax field:
  - Store as `taxesAnnual` internally
  - Display toggle: "Show as Annual / Monthly"
  - If user enters value in monthly view, multiply by 12 for storage
- Bedroom/Unit Controls:
  - Dropdown: "Calculate per Bedroom/Unit?" (true/false)
  - If false: Simple text input for average rent
  - If true: 
    - Text input for "Average Rent per Bedroom/Unit" (auto-populates all bedrooms if changed)
    - Table of bedrooms with columns: Bedroom Index | Description | Rent
    - Validation: Must have entries for all bedroom indices (1 to bedrooms_or_units)
    - Empty rent values treated as $0 in calculations
- On save: Recalculate all `computed` fields using GRASP formulas

**Archive/Soft Delete:**
- "Archive Scenario" button instead of delete
- Show "Archived scenarios" toggle to view/restore
- Background job (Phase 2): Auto-delete archived scenarios >30 days old

### 3.3 Login Flow

```
1. User lands on PAT3.0
2. Check if authenticated (supabase.auth.getSession())
3. If not: Show login form
4. On login: Fetch user's team_members record to determine global_role
5. Fetch all accessible properties based on role + property_access RLS
6. Render property list
```

---

## 4. Implementation Order (for Claude Code)

**Phase A: Infrastructure** (30 min)
1. Create Supabase project + PostgreSQL database
2. Run schema SQL (tables + RLS policies)
   - Note: Update index names from `idx_analyses_*` to `idx_scenarios_*`
3. Set up Supabase Auth (enable email/password)

**Phase B: Data Migration** (60 min)
1. Write CSV parsing script
2. Seed properties + scenarios tables
   - Migrate address → properties table
   - Migrate all scenario data (inputs, computed, bands) → scenarios table
   - Set `bedrooms_or_units` and `calculate_per_bedroom: false` for all migrated scenarios
   - Rename `rentPerUnitMonthly` → removed (use grossRentMonthly instead)
   - Rename `taxesMonthly` → `taxesAnnual`
   - Rename `suggestedRentPerUnit` → `suggestedGrossRent`
3. Create team_members records + set up property_access
4. Validate data integrity

**Phase C: Frontend** (120 min)
1. Install Supabase client library
2. Replace localStorage calls with Supabase client calls
3. Add login/logout UI
4. Update properties list to use Supabase
5. Update property detail to use Supabase (view scenarios)
6. Add scenario form with:
   - Tax annual/monthly toggle
   - Bedroom/unit breakdown controls
   - All GRASP input fields
7. Test with investor account (verify RLS)

**Phase D: Deployment** (30 min)
1. Deploy frontend to Vercel
2. Share login credentials with team
3. Test end-to-end

---

## 5. GRASP Data Structure Details

### 5.1 GRASP Inputs (UPDATED)

```json
{
  "propertyValue": 680000,
  "percentDownPct": 5,
  "rateAprPct": 7,
  "loanLengthYears": 30,
  "taxesAnnual": 10500,
  "insuranceMonthly": 0,
  "hoaMonthly": 0,
  "estImprovementCost": 53000,
  "closingCosts": 15000,
  "miscRateAnnual": 0.01
}
```

**Changes:**
- Removed: `rentPerUnitMonthly` (use bedroom_details or calculated grossRentMonthly instead)
- Removed: `comments` (moved to scenario_description)
- Changed: `taxesMonthly` → `taxesAnnual` (store annually, display toggle on frontend)
- Removed: `bedroomsOrUnits` (moved to top-level scenario field)

---

### 5.2 GRASP Computed (UPDATED)

```json
{
  "mortgageMonthly": 4297.85,
  "grossRentMonthly": 8100,
  "operatingExpensesMonthly": 1441.67,
  "ownershipCostMonthly": 5739.52,
  "annualCashFlow": 28325.75,
  "noiAnnual": 79900,
  "capRate": 0.1175,
  "cashOnCash": 0.2777034369971548,
  "dscr": 1.5492227398130702,
  "dscrGuidance": {
    "priceForDSCR1_5": 596967.1624079697,
    "priceForDSCR1_2": 746208.9530099623
  },
  "suggestedGrossRent": {
    "coc": {
      "pct7": 9482.34,
      "pct5": 9247.81,
      "pct3": 9013.27
    },
    "cap": {
      "pct12": 12361.00,
      "pct8": 8962.50,
      "pct5": 6412.50
    }
  }
}
```

**Changes:**
- Renamed: `suggestedRentPerUnit` → `suggestedGrossRent`
- Note: If using per-bedroom breakdown, `suggestedGrossRent` is the sum across all bedrooms

---

### 5.3 GRASP Bands

```json
{
  "capRate": "Good",
  "cashOnCash": "Great",
  "dscr": "Great"
}
```

---

### 5.4 Bedroom Details (Optional, When calculate_per_bedroom = true)

```json
[
  {
    "bedroomIndex": 1,
    "bedroomDesc": "Master Suite",
    "bedroomRent": 1200
  },
  {
    "bedroomIndex": 2,
    "bedroomDesc": "Secondary Bedroom",
    "bedroomRent": 1000
  },
  {
    "bedroomIndex": 3,
    "bedroomDesc": "Secondary Bedroom",
    "bedroomRent": 900
  }
]
```

**Rules:**
- Must have entry for every index from 1 to `bedrooms_or_units`
- Empty/null rent values treated as $0
- Sum of all bedroomRent values = inputs for gross rent calculation
- If user edits average rent field, auto-populate all entries with that value (but keep descriptions)

---

## 6. Next Steps

1. **You:** Review this updated spec and confirm all changes align with your vision
2. **You:** Provide clarification on any edge cases (e.g., what if CSV doesn't have Zillow link?)
3. **Claude Code:** Execute Phase A → B → C → D

---

## 7. Future Phases (Backlog)

- **Phase 2:** Add FRAT module (flip analysis)
- **Phase 3:** Add PAPPY module (post-acquisition performance)
- **Phase 4:** Side-by-side scenario comparison UI
- **Phase 5:** Auto-delete archived scenarios (background job)
- **Phase 6:** Investor request access flow (UI + notifications)
- **Phase 7:** Tool rebranding (UPDAT → PAPPY in UI)
- **Phase 8:** PDF export with backend processing
