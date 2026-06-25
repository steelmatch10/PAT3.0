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

## Future enhancement: Google Places address autocomplete
- Replace/augment the current `#fullAddress` free-text paste field (Smart Address Input,
  `parseFullAddress` in `app.js`) with a real autocomplete dropdown backed by the Google
  Maps Places API, instead of parsing whatever the user pastes.
- **Needs adaptation before use**: the prompt below assumes a component-based stack
  (TypeScript, React-style hooks/props, a bundler). PAT 3.0 is vanilla JS/HTML/CSS with no
  build step and no npm — the script-loader, debounce, parser, and UI pieces are all
  portable concepts but need a vanilla-JS rewrite (plain functions/closures in `app.js` or a
  new `assets/address-autocomplete.js`, no JSX/hooks/TS types).
- **Real scope decision, not just implementation**: introduces a new external dependency
  (Google Maps JavaScript API) and a billed, browser-restricted API key that doesn't exist
  in this project yet — needs its own `.env`/`supabase-config.js`-style gitignored config
  entry, referrer restrictions, and Google Cloud project setup before any code is written.
- Not scheduled — discretionary UX polish on a field that already works (parsing), not a
  blocker for Phase 2 (Vercel go-live) or anything else in the current roadmap. Revisit
  post-launch if address-entry friction turns out to matter in practice.

### Drafted build prompt (adapt to vanilla JS before using)
This was workshopped against a generic component-based stack template — treat the stack/file
placeholders as needing PAT 3.0-specific answers (vanilla JS, `app.js` + a new
`assets/address-autocomplete.js`, plain CSS matching `assets/styles.css` conventions, no
TypeScript) rather than following it verbatim.

Act as a senior frontend engineer. Build a production quality address autocomplete input field for my web application.

Context and stack:

* Tech stack: [INSERT EXACT STACK, for example Next.js 14 App Router with TypeScript and Tailwind, React with Vite, or Vanilla HTML/CSS/JS]
* File paths to modify: [INSERT FILES OR FOLDERS]
* Styling approach: [INSERT Tailwind, CSS Modules, plain CSS, shadcn/ui, etc.]
* API key location: [INSERT ENV VAR NAME, for example NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY]
* Do not hardcode the API key.
* Do not expose any secret server key.
* Use a browser Google Maps API key restricted by website referrer and restricted to the needed Google Maps APIs.

Goal:
Build a custom address autocomplete input, not Google's default autocomplete widget. The user types an address. The app fetches Google address predictions. The user selects one. The app returns a normalized address object.

Google API requirements:

* Use the Google Maps JavaScript API with the places library.
* Prefer the current Place Autocomplete Data API:

  * `google.maps.importLibrary("places")`
  * `AutocompleteSuggestion.fetchAutocompleteSuggestions`
  * `AutocompleteSessionToken`
  * `PlacePrediction.toPlace()`
  * `place.fetchFields()`
* Do not use legacy `AutocompleteService` or `PlacesService.getDetails` unless the current API is unavailable in this project. If legacy usage is necessary, explain why in comments before implementing it.
* Load the Google Maps JavaScript script safely.
* Prevent duplicate script tags.
* Return the same loading promise if the script is already loading.
* Handle script load failure with a clear error state.
* Use `libraries=places` and `loading=async`.

Cost optimization:

* Implement `AutocompleteSessionToken`.
* Create a new session token when the input receives focus or when the user starts a fresh search and no active token exists.
* Pass the active session token to every autocomplete prediction request.
* Use the same token through the selection flow.
* When the user selects a prediction, call `toPlace()` and then `fetchFields()` on the selected place.
* After successful selection and details fetch, discard the used token and prepare a new one for the next search.
* If the user clears the input, clear predictions and generate a fresh token.
* Never reuse a token across separate user searches.
* Do not call details fetch until the user selects a prediction.

Prediction request behavior:

* Debounce input changes by 300ms.
* Do not call Google for empty strings.
* Do not call Google for input shorter than 3 characters unless I specify otherwise.
* Cancel or ignore stale responses from older requests.
* Show a loading state while fetching.
* Show a helpful empty state if no predictions return.
* Prefer address results. Use address oriented filtering where supported.
* Bias results toward the United States with `region: "us"`, but do not restrict results to the US unless I explicitly request it.
* Support international address formats.

UI and UX requirements:

* Build a clean modern input field.
* Show a dropdown below the input.
* Show address suggestions as the user types.
* Include a loading spinner inside the input.
* Include a Clear X button inside the input when it has text.
* Support mouse click selection.
* Support keyboard navigation:

  * ArrowDown moves highlight down.
  * ArrowUp moves highlight up.
  * Enter selects the highlighted suggestion.
  * Escape closes the dropdown.
  * Tab keeps normal form behavior.
* Make the dropdown accessible:

  * Use appropriate combobox/listbox/option ARIA attributes.
  * Set `aria-expanded`.
  * Set `aria-activedescendant`.
  * Ensure screen reader friendly labels.
* Close the dropdown on outside click.
* Keep focus behavior smooth after selection and clear.

Data fetch on selection:

* Fetch only the fields needed.
* For the current API, request:

  * `addressComponents`
  * `formattedAddress`
  * `location`
  * `id`
* If using legacy fallback, request:

  * `address_components`
  * `formatted_address`
  * `geometry.location`
  * `place_id`
* Do not request expensive unrelated fields like photos, reviews, ratings, opening hours, phone numbers, or business metadata.

Normalize the selected address into this object shape:

```ts
type NormalizedAddress = {
  street_number: string;
  route: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  formatted_address: string;
  place_id: string;
  lat: number | null;
  lng: number | null;
  raw_components: unknown[];
};
```

Address parsing rules:

* `street_number`: component type `street_number`
* `route`: component type `route`
* `city`: first available value from `locality`, `postal_town`, `sublocality`, `sublocality_level_1`, `administrative_area_level_3`, `administrative_area_level_2`
* `state`: `administrative_area_level_1`, use `short_name` for US states and similar regions
* `zip_code`: `postal_code`, append `postal_code_suffix` with a hyphen when present
* `country`: component type `country`, use `short_name`
* Preserve `formatted_address`
* Preserve `place_id`
* Preserve `lat` and `lng` from geometry or location
* Preserve raw components for debugging and future mapping

Code quality:

* Use TypeScript if the project supports it.
* Split logic cleanly:

  * script loader
  * debounce hook or utility
  * Google Places service logic
  * address parser
  * UI component
* Add clear error handling.
* Add cleanup for timers and event listeners.
* Avoid memory leaks.
* Avoid global state except for the shared script loading promise.
* Keep the component reusable.
* Expose an `onAddressSelect(normalizedAddress)` callback.
* Expose optional props:

  * `value`
  * `onChange`
  * `placeholder`
  * `disabled`
  * `className`
  * `countryBias`
  * `minLength`
  * `debounceMs`

Testing and checks:

* Add basic tests for the address parser.
* Test US address parsing.
* Test international address parsing where city uses `postal_town` or administrative fallback.
* Test ZIP plus suffix parsing.
* Test missing components.
* Verify no Google request fires for empty input.
* Verify debounce behavior.
* Verify stale prediction responses do not overwrite newer results.
* Verify selecting an item calls `onAddressSelect`.

Output requirements:

* Provide full code without truncating sections.
* Tell me exactly where to place each file.
* Tell me exactly where to add my Google Maps API key.
* Include setup notes for enabling Google Maps JavaScript API and Places API in Google Cloud.
* Include notes for restricting the API key by website referrer and allowed APIs.
* Do not skip accessibility.
* Do not skip session token handling.
