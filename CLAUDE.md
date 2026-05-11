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
- Client-side persistence via **browser LocalStorage**

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
LocalStorage key: `pat-1.0.0`

```json
{
  "schemaVersion": "pat-1.0.0",
  "properties": [
    {
      "id": "string",
      "module": "GRASP | FRAT",
      "inputs": {},
      "computed": {},
      "bands": {},
      "source": { "address": "string" },
      "updatedAt": "ISO timestamp",
      "pinned": false
    }
  ]
}
```

## Key Patterns
- **Shared utilities** live in `assets/app.js`: LocalStorage read/write, address normalization, duplicate detection, currency/percentage formatting, toast notifications, modal confirmations.
- **Module logic** (`grasp.js`, `frat.js`) handles form state, calculation, KPI banding, and saving to the catalogue.
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