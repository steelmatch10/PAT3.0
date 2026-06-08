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
- `created_at`, `updated_at`, `deleted_at` (soft delete)

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

## Project Status (updated 2026-06-07)

**Active branch:** `feat/property-archive-delete-flow`
**Last commit:** `91179d6` — address editing persistence, CLAUDE.md update, lessons file

### Completed
- Property Management Cut — replaces hardcoded 10% vacancy; per-property DB column, wired through `computeAll` and Supabase
- Smart Address Input — single paste-friendly `#fullAddress` field in GRASP and FRAT
- Suggested rent targets — `rentPerUnitForCoC`/`rentPerUnitForCap` denominators use `(1 - propertyManagementCut)`
- Zillow link persistence — `updatePropertyZillowLink()` called in both GRASP and FRAT update paths
- `parseFullAddress` city fallback bug fixed in both modules
- Address editing persistence — `updatePropertyAddress()` in `supabase-client.js`, called on save when address fields change
- **Phase 1A: Property archive/delete flow** — Zillow-style listing status, staged-deletion with 5-business-day Undo window, Archive/Delete modals in GRASP and FRAT, status badge + Undo banner in Catalogue. Migration 11 applied to Supabase.

### Open Items (priority order)
1. **Phase 1B (parallel):** Security — password change, MFA/OTP (`settings.html`, `supabase-client.js`)
2. **Phase 1B (parallel):** Investor-created scenario indicator — badge when investor creates scenario; needs `created_by` column check + UI
3. **Phase 2:** Go live on Vercel — after Phase 1B complete
4. **Phase 3A:** Stitch UI overhaul (existing project: "Real Estate Investment Portal", id `18231999868876344727`)
5. **Phase 3B:** Playwright tests — new session required; prompt saved in plan file
6. **Per-property schema migration** — move taxes/insurance/HOA/rate/loanLength from `scenarios.inputs` JSONB → `properties` table. Defer until after go-live.
7. **`computeAllGRASP()` / `computeAllFRAT()` split** — defer until after go-live.

### Key Design Decisions (non-obvious)
- `get_my_role()` is SECURITY DEFINER — do NOT remove this attribute
- Scenario dropdown in GRASP read-only mode stays ENABLED — investors can browse scenarios
- Investors can create new scenarios on properties they have been assigned/approved for
- Address fields are read-only for non-founders (`setAddressReadonly(true)` called on load)

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

### 9. Commit & Push Workflow
After completing any task that produces changes worth keeping:
1. Review `git diff` and `git status --short` to understand all changes
2. Choose a branch name: `fix/<short-description>`, `feat/<short-description>`, or `docs/<short-description>`
3. `git checkout -b <branch-name>` from the current branch
4. Stage all intentional changes (specific files — never `git add -A` blindly)
5. Commit with a concise message describing the *why*, not just the *what*
6. Push with `git push -u origin <branch-name>`