# PAT 3.0 — Claude Code Context

## Tier & Ruflo Configuration

**Project Tier:** 30% (parallel work, architecture, code review)
**project_tier: 30%**

**Ruflo Source:** `~/.claude/ruflo/.agents/skills/` (global, always up-to-date)

**Available Skills at 30%:**
- swarm-orchestration (parallel task execution)
- sparc-methodology (feature architecture)
- stream-chain (multi-step analysis)
- github-code-review (PR review + swarm coordination)
- github-release-management (versioning, releases)
- pair-programming (AI-assisted development)
- verification-quality (testing and verification)
- agentdb-memory-patterns (session memory reference)
- hooks-automation (hook system documentation)

**Escalation Rules:**
- Escalate to 50% if: (Reserved; not yet defined)
- Escalate to 70% if: (None planned for PAT3.0)
- Escalate to 100% if: A task cannot be solved at current tier despite trying

**Escalation Logging:**
When escalating, log in `.claude/escalation-log.md`:
- Current tier and reason for escalation
- Skill(s) accessed at higher tier
- Outcome (success/failure)

---

## Project Overview
**Property Analysis Tool 3.0** for Busch Investment Group. A client-side web app that helps investment professionals evaluate real estate properties using two analysis methodologies:

- **GRASP** — rental/income property analysis (mortgage, cash-on-cash return, cap rate, DSCR)
- **FRAT** — fix-and-flip analysis (acquisition + rehab costs, ARV, ROI, holding period)

Analyzed properties are saved to a searchable catalogue with export/import support.

## Architecture
- Pure **vanilla JS / HTML / CSS** — no framework, no bundler, no build step
- **No npm dependencies** — open any `.html` file directly in a browser to run locally
- Persistence via **Supabase** (PostgreSQL); `assets/supabase-client.js` owns all DB calls
- `assets/supabase-config.js` and `.env` are gitignored — never commit them

## File Map

| File | Role |
|------|------|
| `index.html` | Landing / home page |
| `GRASP.html` | GRASP analysis page |
| `FRAT.html` | FRAT analysis page |
| `Catalogue.html` | Saved property catalogue |
| `assets/app.js` | Shared utilities (storage, address parsing, formatting, toast/modal UI) |
| `assets/grasp.js` | GRASP module: form logic, KPI calculations, suggestions |
| `assets/frat.js` | FRAT module: form logic, ROI/profit calculations |
| `assets/catalogue.js` | Catalogue page: search, filter, pin, bulk delete, export/import |
| `assets/styles.css` | Global styles and dark-mode CSS variables |

## Data Layer
Supabase PostgreSQL. Two primary tables:

**`properties`** — one row per physical property
- `id`, `street`, `city`, `state`, `zip` (NOT NULL, UNIQUE on street+zip)
- `zillow_link`, `notes`, `pinned`, `income_efficiency`, `property_management_cut`
- `listing_status` (Zillow-style: For Sale, Pending, Sold, Off Market, Not Listed)
- `archived_at`, `archive_reason` — set via Archive Property modal (migration 12)
- `created_at`, `updated_at`, `deleted_at` (dormant soft-delete column, no longer written to)

**`scenarios`** — one or more per property (multi-scenario support)
- `id`, `property_id` (FK), `module` (GRASP | FRAT)
- `inputs` (JSONB — all form fields), `name`, `description`
- `archived_at`, `created_at`, `updated_at`

Key non-obvious schema facts:
- `property_management_cut` replaces the old hardcoded 10% vacancy factor — it's per-property and covers PM + vacancy combined
- `income_efficiency` is the DSCR lending factor (default 0.80) — per-property, user-adjustable
- `taxesAnnual` stored in `inputs` JSONB as annual value; divide by 12 before passing to `computeAll()`
- `miscRateAnnual` stored in `inputs` as decimal (0.01 = 1%); form displays as percentage

## Formula Reference
- **`migration/Formulas.md`** — authoritative PAT 2.0 formula spec for both GRASP and FRAT. Read this before touching any calculation in `app.js` or `frat.js`.
- Key non-obvious facts:
  - GRASP NOI **and cash flow** both use **90% of gross rent** (10% vacancy factor applies to all income metrics)
  - GRASP DSCR = **(NOI × incomeEfficiency)** / (mortgage × 12) — `incomeEfficiency` is the per-property lending factor (default 0.80)
  - FRAT totalPurchaseCap = down + closing only (flipping cost is **financed into the loan**, not upfront cash)
  - Misc cost is read per-scenario from `inputs` JSONB; `CONSTANTS.MISC_RATE_ANNUAL` is only a fallback default
  - `closingCosts` in GRASP auto-calculates at 2.5% of property value; `dataset.autoCalc` flag controls this

## Key Patterns
- **Shared utilities** live in `assets/app.js`: address normalization, duplicate detection, currency/percentage formatting, toast notifications, modal confirmations.
- **DB calls** live in `assets/supabase-client.js` — narrow single-purpose functions per field/operation (e.g. `updatePropertyZillowLink`, `updatePropertyAddress`).
- **Module logic** (`grasp.js`, `frat.js`) handles form state, calculation, KPI banding, and saving via Supabase.
- **Page controllers** are self-contained — each JS file owns its page's event listeners and DOM updates.
- GRASP auto-saves form state and view mode (monthly/annual) to LocalStorage between sessions.

## Running Locally
No setup required. Open any `.html` file in a browser:
```
index.html       → home
GRASP.html       → rental analysis
FRAT.html        → fix-and-flip analysis
Catalogue.html   → saved properties
```

---

## Project Status (updated 2026-06-24)

**Active branch:** `main`
**Last commit (pending):** Phase 1B — security settings (password change + TOTP MFA + AAL2 step-up) and investor-created scenario badge

### Completed
- Property Management Cut — replaces hardcoded 10% vacancy; per-property DB column, wired through `computeAll` and Supabase
- Smart Address Input — single paste-friendly `#fullAddress` field in GRASP and FRAT
- Suggested rent targets — `rentPerUnitForCoC`/`rentPerUnitForCap` denominators use `(1 - propertyManagementCut)`
- Zillow link persistence — `updatePropertyZillowLink()` called in both GRASP and FRAT update paths
- `parseFullAddress` city fallback bug fixed in both modules
- Address editing persistence — `updatePropertyAddress()` in `supabase-client.js`, called on save when address fields change
- **Phase 1A: Property archive/delete flow** — Archive Property modal (reason required, optional listing status), true hard-delete flow via "Erase Property from Database" with type-to-confirm. See migration 12.
- **Archive UI polish** — themed `.btn-archive`, rebuilt modals, `createStyledDropdown()` in `app.js`.
- **Phase 1B-A: Security settings** — new `settings.html` + `assets/settings.js`. Password change requires re-entering the current password (`patReauthenticate()` calls `signInWithPassword` again before `patUpdatePassword()` calls `updateUser()`) — closes a session-hijack gap where any valid session alone could change the password. Optional self-enrolled TOTP MFA: enroll → QR code + manual secret → 6-digit verify → enrolled; unenroll requires typing "REMOVE" in a confirm modal (reuses the `showEraseConfirmModal` pattern's UX, not its code). **Empirically confirmed via a disposable Supabase test user that Supabase does NOT auto-gate sign-in at AAL2 for MFA-enrolled users** — a plain `signInWithPassword` still returns a fully usable AAL1 session even with a verified TOTP factor on file. Built `mfa-challenge.html` (new file) as the missing step-up screen and wired the gate centrally into `initAuth()` in `supabase-client.js` (checks `auth.mfa.getAuthenticatorAssuranceLevel()`; redirects to the challenge page with a `returnTo` param if `nextLevel === 'aal2'` and not yet satisfied). Every page using `initAuth()` (index, Catalogue, Team, GRASP, FRAT, Settings) is covered automatically. Added Settings nav link to all 5 pages.
- **Phase 1B-B: Investor-created scenario badge** — `scenarios.created_by` (existed in schema, was never written to) now populates automatically via a **database column default** (`DEFAULT auth.uid()`, migration 13) rather than client-side code — simpler and unspoofable. Migration 13 also tightens the investor INSERT RLS policy to `WITH CHECK (created_by = auth.uid() AND ...)`, closing a real vulnerability where an investor could otherwise have written an arbitrary `created_by` (including a founder's id) since the prior policy only checked `property_id`/role. Verified end-to-end against a fully disposable test user/property/scenario: confirmed real inserts populate `created_by` correctly, and confirmed a spoofing attempt (`created_by` set to a different user's id) is rejected with a 403 RLS violation. `fetchInvestorCreatorIds()` in `supabase-client.js` resolves a Set of investor user-ids; `renderScenarioSelect()` in both `grasp.js`/`frat.js` (parity-verified byte-identical) appends `" (Investor)"` to the dropdown label, and Catalogue's `fetchProperties()` exposes `has_investor_created_scenario` per property for a founder-only card badge in `catalogue.js`. **Documented limitation, not a bug**: badge reflects the creator's CURRENT `global_role`, not their role at scenario-creation time — if an investor is later promoted/demoted/removed, their historical scenarios' badge status follows their current status. Pre-migration scenarios have `created_by = NULL` and will never show the badge (no recoverable historical data).
- **Plan was pressure-tested by an LLM council (5 advisors + peer review + chairman) before implementation** — caught the AAL2 sequencing gap and the `created_by` spoofing vector before any code was written. See `migration/13_scenarios_created_by_check.sql` for the resulting fix.

### Open Items (priority order)
1. **Archived → unarchived restore flow** — explicitly deferred by user; build later.
2. **Phase 1B follow-up (not yet built, intentionally deferred):** session/device list ("where am I logged in"), step-up auth gating specific destructive actions (hard delete, archive, export) behind AAL2, full activity/audit trail beyond the single investor-created badge. Named but not scoped — do not build until requested.
3. **Phase 2:** Go live on Vercel — after Phase 1B complete
4. **Phase 3A:** Stitch UI overhaul (existing project: "Real Estate Investment Portal", id `18231999868876344727`)
5. **Phase 3B:** Playwright tests — new session required; prompt saved in plan file. **Must close out every 🔴/🟡 entry in `tasks/bug-log.md`** (see Workflow Orchestration → "Bug Triage & Regression Loop") in addition to net-new coverage.
6. **Per-property schema migration** — move taxes/insurance/HOA/rate/loanLength from `scenarios.inputs` JSONB → `properties` table. Defer until after go-live.
7. **`computeAllGRASP()` / `computeAllFRAT()` split** — defer until after go-live.

### Key Design Decisions (non-obvious)
- `get_my_role()` is SECURITY DEFINER — do NOT remove this attribute
- Scenario dropdown in GRASP read-only mode stays ENABLED — investors can browse scenarios
- Investors can create new scenarios on properties they have been assigned/approved for
- Address fields are read-only for non-founders (`setAddressReadonly(true)` called on load)
- Archiving a property is currently one-way for this session (no unarchive UI yet — see Open Items)
- "Erase Property from Database" is a TRUE hard delete (cascades to scenarios), irreversible, type-to-confirm — distinct from the dormant `deleted_at` soft-delete column which nothing writes to anymore
- `createStyledDropdown()` in `app.js` is a reusable themed-dropdown helper — consider adopting it for other `<select>` elements if their native popups look out of place
- Supabase does NOT enforce AAL2 at sign-in for MFA-enrolled users by default — confirmed empirically (see Phase 1B-A above). Any future auth work must NOT assume Supabase blocks AAL1 sessions; the app-level gate in `initAuth()` is the only thing currently enforcing it.
- `scenarios.created_by` has a DB-level `DEFAULT auth.uid()` (migration 13) — never set it explicitly from client code; let the database populate it. The investor INSERT policy also requires `created_by = auth.uid()`, so attempting to override it from the client will fail RLS, not silently succeed.
- Password change requires re-entering the current password (`patReauthenticate()`) before `patUpdatePassword()` — do not remove this step; it's what prevents a hijacked/unattended session from silently locking out the real account owner.

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project context
- **After every task:**
  1. Scan the project root for empty or stray files (`.txt`, no-extension artifacts) and delete them
  2. Run `git status --short` and delete any untracked files you did not intentionally create
  3. Update the **Project Status** section in `CLAUDE.md` — mark completed items, update open items list, note the last commit/branch

### 8. GRASP/FRAT Parity Rule
- **GRASP and FRAT are both part of PAT.** Any bug fix, formula change, or UX improvement requested for one module must be evaluated for applicability to the other — even if the user only mentions one.
- They share `supabase-client.js` and `app.js` but have independent JS files (`grasp.js`, `frat.js`) and HTML files.
- Goal: migrate to `computeAllGRASP()` and `computeAllFRAT()` as separate functions in `app.js`, each with their own independent calculation flow, so changes to one don't silently break the other.
- Until that migration happens: whenever touching a calculation in `grasp.js`, explicitly check whether `frat.js` has the equivalent and whether it needs the same change.

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Cost Control — API Usage
- **Default to local Ollama models** for all tasks (qwen2.5-coder:14b for code, deepseek-r1:14b for reasoning, llama3.1:8b for general tasks)
- **NEVER route a request to Anthropic's API** (claude-sonnet-4-6 or any cloud model) without explicit user permission first
- Before any action that would incur API cost: stop, describe what you're about to do and why, and wait for approval
- If unsure whether something costs money — assume it does and ask

### 7. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### 8. Bug Triage & Regression Loop
Every time the user reports a bug (or you discover one during review), before or while fixing it:
1. **Log it in `tasks/bug-log.md`** — next sequential `B0xx` entry with: what was reported,
   the verbatim symptom, the root cause once found, the fix applied, and a **Test status**
   (🔴 no test / 🟡 planned / ✅ test in place). Use the existing entries as the format template.
2. If the report isn't actually a bug (a missing feature, a design limitation, a third-party
   constraint), still log it in `tasks/bug-log.md` with `Status: Not a bug` and cross-reference
   the appropriate backlog file (e.g. `tasks/security-backlog.md`) for the real disposition.
3. **Do not mark a bug-log entry's Test status as ✅ until a Playwright test actually exists**
   for it. Until Phase 3B's Playwright suite exists, new entries default to 🔴.
4. Once Phase 3B (Playwright) is underway: treat `tasks/bug-log.md` as the test backlog —
   every 🔴/🟡 entry needs a corresponding test added or updated, then flip its status to ✅
   in the same change that adds the test. Do not silently let entries go stale.
5. This is a recursive loop by design — as the app grows, this file is both the bug history
   and the live checklist of what regression coverage is missing. Treat gaps in it as
   technical debt, not paperwork.

### 9. Commit & Push Workflow
After completing any task that produces changes worth keeping:
1. Review `git diff` and `git status --short` to understand all changes
2. Choose a branch name: `fix/<short-description>`, `feat/<short-description>`, or `docs/<short-description>`
3. `git checkout -b <branch-name>` from the current branch
4. Stage all intentional changes (specific files — never `git add -A` blindly)
5. Commit with a concise message describing the *why*, not just the *what*
6. Push with `git push -u origin <branch-name>`