# Maps Link Migration Plan

## Goal
Populate a `maps_link` column on the `properties` table using Google Maps URLs
extracted from the PAT 2.0 HTML export. Optionally resolve full addresses via
the Places API in a future pass.

## Phase 1 — Store Maps Links (no API needed)

### 1. Schema change
```sql
ALTER TABLE properties ADD COLUMN IF NOT EXISTS maps_link TEXT;
```
Also add to `01_schema.sql` source of truth.

### 2. Parser script (`migration/06_extract_maps_links.js`)
- Parse `migration/Property Analysis Tools/(Gauging Rental Asset Strength & Potential) GRASP.html`
- Extract all `href="https://www.google.com/maps/place/..."` + adjacent link text
- Deduplicate (same address appears multiple times for multi-scenario properties)
- Output: `migration/06_maps_links.sql` — one `UPDATE properties SET maps_link = '...' WHERE address ILIKE '...'` per unique address

### 3. Run generated SQL in Supabase SQL Editor

### 4. Frontend updates
- `assets/supabase-client.js` — add `maps_link` to `fetchProperties()` select
- `Catalogue.html / catalogue.js` — show "View on Maps ↗" link on cards
- `index.html` — show on property cards (approved section for investors)
- `GRASP.html` — show in property header

## Phase 2 — Full Address Enrichment (PAT 4.0, requires API)

Each Maps URL contains a place ID (`data=!4m2!3m1!19sChIJ...`).
The Places API `place/{id}` endpoint returns full formatted address.

Steps when ready:
1. Extract all place IDs from stored `maps_link` values
2. Call Places API (needs backend/edge function — can't expose key client-side)
3. `UPDATE properties SET address = <full_address> WHERE id = <uuid>`

Cost: ~$0.017 per lookup × 40 properties = ~$0.68 one-time.

## Notes
- `zillow_link` and `maps_link` are kept separate — both may be populated eventually
- Place IDs are stable identifiers; the Maps URLs will resolve correctly even if
  the street name in the URL slug is abbreviated
