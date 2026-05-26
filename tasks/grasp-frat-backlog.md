# GRASP / FRAT Backlog

Issues to fix when working on GRASP.html (and mirror to FRAT.html where applicable).

## UI / UX
1. ~~**Scenario dropdown** — remove "Add new scenario" option from the dropdown; it's redundant with the "+ New Scenario" button alongside it.~~ *(done — commit 8d2aa87)*
2. ~~**New scenario button** — rename "+ New" to "+ New Scenario".~~ *(done — commit f0ad5cd)*
3. ~~**New scenario defaults** — when creating a new scenario, pre-populate: property address, listing/Zillow URL, and taxes. All other fields default/blank.~~ *(done — commit db78da9)*
4. ~~**Suggested Gross Rent — CoC label** — floating point display bug: shows `CoC 7.000000000000001%` instead of `CoC 7%`. Fix with `toFixed` or `toPrecision` on the target value before rendering.~~ *(done — commit 30a153d)*

## Bug Fixes
5. ~~**GRASP property location blank on open** — opening a GRASP property from Catalogue left the Property Location field empty. `loadScenarioIntoForm()` now reads `currentProperty.address` / `zillow_link`.~~ *(done — commit a956963)*
6. ~~**FRAT fields blank on open** — opening a FRAT property from Catalogue showed a blank form. FRAT was LocalStorage-only; migrated to Supabase (`fetchScenarios` + `fetchProperty`). Save path also migrated: `updateScenario` / `createProperty` + `createScenario`.~~ *(done — commit a956963)*
7. ~~**Save button always enabled** — Save button should be disabled when form matches the last-saved snapshot (no changes). Added snapshot-based dirty tracking to both GRASP and FRAT.~~ *(done — commit a956963)*
8. ~~**Address column split** — `address TEXT` replaced with `street`, `city`, `state`, `zip` across DB + all JS/HTML files. Stale `address` references cleaned up in `catalogue.js`, `index.html`, `team.js`, `grasp.js`, `frat.js`.~~ *(done — session 2026-05-26)*
9. ~~**Catalogue empty** — `catalogue.js` queried old `address` column. Fixed to use `street, city, state, zip`.~~ *(done — session 2026-05-26)*
10. ~~**GRASP address locked for founders** — hardcoded `readonly` removed; JS-controlled `setAddressReadonly()` guards non-founders only.~~ *(done — session 2026-05-26)*
11. ~~**Investor scenario browsing broken** — `scenarioSelect` was being bulk-disabled with all inputs. Fixed by re-enabling it immediately after the bulk-disable.~~ *(done — session 2026-05-26)*
12. ~~**Capital Required on GRASP/FRAT** — added Capital Required block to KPI panel on both pages. GRASP uses `closingCosts` per-scenario, not the old flat constant.~~ *(done — session 2026-05-26)*
13. ~~**KPI hover highlight color** — changed from border/outline on wrapper to label text color only (`#e8d5b0` cream).~~ *(done — session 2026-05-26)*
14. ~~**FRAT `computeFRAT` used `CONSTANTS.CLOSING_COSTS = 0`** — closing was always $0 in FRAT Capital Required and supplemental. Fixed: closing now computed as 5% of acquisition value (matching primer spec).~~ *(done — session 2026-05-26)*
15. ~~**FRAT `hardResetForm` referenced `els.address`** — dead ref; caused silent partial reset. Fixed to use `els.addrStreet/City/State/Zip`.~~ *(done — session 2026-05-26)*
16. ~~**FRAT `watched` array contained `"address"`** — no `els.address` element; silently skipped. Removed stale entry.~~ *(done — session 2026-05-26)*

17. ~~**FRAT missing scenario management** — no scenario selector bar, no Scenario Name/Description fields, no multi-scenario support. Added scenario bar (dropdown + New Scenario + Archive), Scenario section in form, `renderScenarioSelect`/`loadScenarioIntoForm`/`clearFormForNew` helpers, and updated save handler to create/update named scenarios properly.~~ *(done — session 2026-05-26)*

## Access control
18. **Investor read-only enforcement** — if an investor opens GRASP/FRAT for a property they are NOT assigned to in `property_access`, the page must be fully read-only: no editing field values, no creating/archiving scenarios. They get an exploratory view showing property details and scenario data only.
18. ~~**User profile in nav** — user email + role badge should be visible in the GRASP/FRAT header nav, consistent with Index and Catalogue.~~ *(done — commit 1db5292)*

## Access management (from property page)
- On the founder's view of a property in GRASP/FRAT, show which investors have access to that property and allow granting/revoking access on the spot (inline, without navigating to Team.html).
