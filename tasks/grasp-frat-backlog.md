# GRASP / FRAT Backlog

Issues to fix when working on GRASP.html (and mirror to FRAT.html where applicable).

## UI / UX
1. **Scenario dropdown** — remove "Add new scenario" option from the dropdown; it's redundant with the "+ New Scenario" button alongside it.
2. **New scenario button** — rename "+ New" to "+ New Scenario".
3. **New scenario defaults** — when creating a new scenario, pre-populate: property address, listing/Zillow URL, and taxes. All other fields default/blank.
4. **Suggested Gross Rent — CoC label** — floating point display bug: shows `CoC 7.000000000000001%` instead of `CoC 7%`. Fix with `toFixed` or `toPrecision` on the target value before rendering.

## Access control
5. **Investor read-only enforcement** — if an investor opens GRASP/FRAT for a property they are NOT assigned to in `property_access`, the page must be fully read-only: no editing field values, no creating/archiving scenarios. They get an exploratory view showing property details and scenario data only.
6. **User profile in nav** — user email + role badge should be visible in the GRASP/FRAT header nav, consistent with Index and Catalogue.

## Access management (from property page)
- On the founder's view of a property in GRASP/FRAT, show which investors have access to that property and allow granting/revoking access on the spot (inline, without navigating to Team.html).
