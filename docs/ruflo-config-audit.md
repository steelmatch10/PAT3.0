# Ruflo Config Audit Report

**Date Generated:** 2026-05-08
**Ruflo Repo Source:** `https://github.com/ruvnet/ruflo.git` ✅ Clone succeeded
**Ruflo Repo Commit (GitHub latest):** `b289c009e9d0154f809d206e12cbf60e30406c70`
> fix(witness): probe workspace packages for @noble/ed25519 (pnpm isolated linker)

**Ruflo Version in latest settings.json:** `3.6.11`
**Local Ruflo Copy Commit:** `01070ede81fa6fbae93d01c347bec1af5d6c17f0`
> fix: Tier A blockers #1596, #1567, #1556 (v3.5.80) (#1598)

**Note on local vs GitHub:** GitHub is ahead of the local copy (v3.6.11 vs v3.5.80).
The daemon/adr/ddd config blocks are **identical in both**. All analysis below uses the GitHub latest as authoritative.

**PAT3.0 Config Snapshot:** `PAT3.0/.claude/settings.json`

---

## 1. Daemon Workers

**Broken in Latest Ruflo?** No — the feature works correctly in Ruflo itself.
**Broken in PAT3.0?** Yes — the config is in a permanently non-running state.

**Reason:**
The authoritative Ruflo settings.json (GitHub `b289c009`) has:
```json
"daemon": {
  "autoStart": true,
  "workers": [
    "map", "audit", "optimize", "consolidate", "testgaps",
    "ultralearn", "deepdive", "document", "refactor", "benchmark"
  ],
  "schedules": {
    "audit":       { "interval": "1h",  "priority": "critical" },
    "optimize":    { "interval": "30m", "priority": "high" },
    "consolidate": { "interval": "2h",  "priority": "low" },
    "document":    { "interval": "1h",  "priority": "normal" },
    "deepdive":    { "interval": "4h",  "priority": "normal" },
    "ultralearn":  { "interval": "1h",  "priority": "normal" }
  }
}
```

PAT3.0 has `autoStart: false` with only 3 workers and 2 schedules — a truncated copy of the authoritative config with the kill switch left on. Workers are never started.

**Deprecation Status:** Not deprecated. Present and actively used in latest Ruflo.

**Full Subsystem Documentation:**
Source: `.claude/helpers/daemon-manager.sh` (lines 1–253)

The daemon subsystem manages **2 background processes** per the shell implementation:

1. **Swarm Monitor** (`swarm-monitor.sh`, default interval: 30s)
   — Polls the active agent swarm for activity, checks MCP server process presence, and logs swarm state to `.claude-flow/metrics/swarm-activity.json`.

2. **Metrics Daemon** (`metrics-db.mjs`, default interval: 60s)
   — Runs a SQLite-backed Node.js process ("10.5x faster than bash/JSON") that records session metrics over time.

CLI interface (from `daemon-manager.sh` help block):
```
Commands:
  start [swarm_interval] [metrics_interval]    Start all daemons
  stop                                         Stop all daemons
  restart [swarm_interval] [metrics_interval]  Restart all daemons
  status                                       Show daemon status
  start-swarm [interval]                       Start swarm monitor only
  start-metrics [interval]                     Start metrics daemon only
```

State is stored under `$PROJECT_ROOT/.claude-flow/pids/` and logs under `$PROJECT_ROOT/.claude-flow/logs/daemon.log`.

The `workers` array in settings.json (`map`, `audit`, `optimize`, etc.) is **not referenced by daemon-manager.sh**. These are consumed by the `npx ruflo` CLI for scheduling background task workers — a higher-level orchestration layer separate from the bash daemons.

**Correct Config Block (from GitHub `b289c009`):**
```json
"daemon": {
  "autoStart": true,
  "workers": [
    "map", "audit", "optimize", "consolidate", "testgaps",
    "ultralearn", "deepdive", "document", "refactor", "benchmark"
  ],
  "schedules": {
    "audit":       { "interval": "1h",  "priority": "critical" },
    "optimize":    { "interval": "30m", "priority": "high" },
    "consolidate": { "interval": "2h",  "priority": "low" },
    "document":    { "interval": "1h",  "priority": "normal" },
    "deepdive":    { "interval": "4h",  "priority": "normal" },
    "ultralearn":  { "interval": "1h",  "priority": "normal" }
  }
}
```

**Relevance to PAT3.0:** No.
The daemon subsystem monitors active swarm agents, collects swarm metrics, and coordinates with the `npx ruflo` MCP CLI. PAT3.0 has no swarm agents running, no MCP server, and no code analysis pipeline. The SQLite metrics daemon would run but collect nothing meaningful. The swarm monitor would show 0 agents every 30 seconds.

**Recommended Action for PAT3.0:**
Remove the `daemon` block entirely from `.claude/settings.json`. There is nothing for it to monitor in this project.

---

## 2. ADR Tracking

**Broken in Latest Ruflo?** No — the config syntax is correct and used in the authoritative source.
**Broken in PAT3.0?** Partially — the config is syntactically valid, but the target directory `docs/adr` does not exist, so `adr-compliance.sh` would fail if triggered.

**Reason:**
The authoritative config (GitHub `b289c009`) is:
```json
"adr": {
  "autoGenerate": true,
  "directory": "/docs/adr",
  "template": "madr"
}
```
This is **byte-for-byte identical** to the PAT3.0 config. The syntax is not wrong. The issue is that `/docs/adr` is a Ruflo-internal path that refers to **Ruflo's own ADR directory** — it only has meaning inside the Ruflo project repo, not inside an arbitrary project that installed Ruflo.

**Deprecation Status:** Not deprecated. Present and actively used in latest Ruflo.

**Full Subsystem Documentation:**
Source: `.claude/helpers/adr-compliance.sh` (lines 1–187)

The ADR subsystem tracks compliance with **10 specific Ruflo V3 Architecture Decision Records**:

```
ADR-001: agentic-flow as core foundation
ADR-002: Domain-Driven Design structure
ADR-003: Single coordination engine
ADR-004: Plugin-based architecture
ADR-005: MCP-first API design
ADR-006: Unified memory service
ADR-007: Event sourcing for state
ADR-008: Vitest over Jest
ADR-009: Hybrid memory backend
ADR-010: Remove Deno support
```

Each ADR is scored 0–100 by inspecting the project for specific code patterns (e.g., ADR-001 checks `package.json` for `agentic-flow` dependency; ADR-008 checks for `vitest` and absence of `jest`). Results are written to `.claude-flow/metrics/adr-compliance.json`. Runs are throttled to once every 15 minutes.

**Crucially:** The check functions (`check_adr_001`, `check_adr_002`, etc.) grep for patterns in `$PROJECT_ROOT/v3` and `$PROJECT_ROOT/src` — paths that don't exist in PAT3.0. All checks would score 0 for every ADR.

**Correct Config Block (from GitHub `b289c009`):**
```json
"adr": {
  "autoGenerate": true,
  "directory": "/docs/adr",
  "template": "madr"
}
```

**Relevance to PAT3.0:** No.
The 10 ADRs being tracked are exclusively about Ruflo/claude-flow's own architecture: whether `agentic-flow` is the core dependency, whether DDD structure is implemented, whether Vitest is used instead of Jest. None of these apply to a vanilla HTML/JS/CSS app with no TypeScript, no package.json dependencies, and no Node.js architecture.

**Recommended Action for PAT3.0:**
Remove the `adr` block from `.claude/settings.json`. Creating `docs/adr` would make the script runnable but all compliance scores would be 0 — misleading noise.

---

## 3. DDD Tracking

**Broken in Latest Ruflo?** No — the config syntax is correct and used in the authoritative source.
**Broken in PAT3.0?** Partially — the config is syntactically valid, but the target directory `docs/ddd` does not exist, and the tracked domains are Ruflo-internal.

**Reason:**
The authoritative config (GitHub `b289c009`) is:
```json
"ddd": {
  "trackDomains": true,
  "validateBoundedContexts": true,
  "directory": "/docs/ddd"
}
```
This is **byte-for-byte identical** to the PAT3.0 config. The syntax is not wrong. Same issue as ADR: the `/docs/ddd` path refers to Ruflo's own DDD documentation directory, and the 5 tracked domains are hard-coded Ruflo internals.

**Deprecation Status:** Not deprecated. Present and actively used in latest Ruflo.

**Full Subsystem Documentation:**
Source: `.claude/helpers/ddd-tracker.sh` (lines 1–145)

The DDD subsystem tracks implementation progress across **5 hard-coded Ruflo V3 target domains** (line 17):
```bash
DOMAINS=("agent-lifecycle" "task-execution" "memory-management" "coordination" "shared-kernel")
```

For each domain, it looks for the directory at:
- `$PROJECT_ROOT/v3/@claude-flow/$domain` OR
- `$PROJECT_ROOT/src/domains/$domain`

Each domain is scored 0–100 across 8 criteria:
1. Domain directory exists (20 pts)
2. `domain/` subdirectory (15 pts)
3. `application/` subdirectory (15 pts)
4. `infrastructure/` subdirectory (15 pts)
5. `api/` subdirectory (10 pts)
6. `.test.ts` or `.spec.ts` files present (15 pts)
7. `index.ts` present (10 pts)

It also counts DDD artifact types (entities, value objects, aggregates, repositories, services, domain events) by grepping `*.ts` files.

Results are written to `.claude-flow/metrics/ddd-progress.json` and merged into `v3-progress.json`. Runs are throttled to once every 10 minutes.

**In PAT3.0:** Neither `v3/@claude-flow/` nor `src/domains/` exist. Every domain would score 0. The TypeScript grep would find nothing. All output would be zeros.

**Correct Config Block (from GitHub `b289c009`):**
```json
"ddd": {
  "trackDomains": true,
  "validateBoundedContexts": true,
  "directory": "/docs/ddd"
}
```

**Relevance to PAT3.0:** No.
PAT3.0 is 4 HTML files + 5 vanilla JS/CSS files with no TypeScript, no Node.js, no bounded contexts, and no DDD structure. The tracker's entire heuristic (looking for `.ts` files in `v3/@claude-flow/$domain`) produces nothing but zeros.

**Recommended Action for PAT3.0:**
Remove the `ddd` block from `.claude/settings.json`.

---

## Summary

| Config | Broken in Ruflo Latest? | Broken in PAT3.0? | Deprecated? | Relevant to PAT3.0? |
|--------|------------------------|-------------------|-------------|----------------------|
| `claudeFlow.daemon` | No | Yes (autoStart: false + truncated workers) | No | No |
| `claudeFlow.adr` | No | Partially (directory missing; all scores → 0) | No | No |
| `claudeFlow.ddd` | No | Partially (directory missing; all scores → 0) | No | No |

- **Configs broken in Ruflo latest:** 0
- **Configs deprecated in Ruflo latest:** 0
- **Configs safe to remove from PAT3.0:** 3 (all three)

**Root cause pattern:** All three blocks were copy-pasted from the Ruflo reference config during project setup. They are self-referential — they track Ruflo's own development process and only make sense inside the Ruflo repo. PAT3.0 is not Ruflo, so these blocks produce no benefit and generate false "broken" signals in audits.

---

## Next Steps

Execute in this order (all edits to `.claude/settings.json`):

1. Remove the `claudeFlow.daemon` block entirely
2. Remove the `claudeFlow.adr` block entirely
3. Remove the `claudeFlow.ddd` block entirely
4. Optionally clean up `$TEMP\ruflo-audit` (the cloned repo): `Remove-Item -Recurse -Force "$env:TEMP\ruflo-audit"`

No directory creation required. No migrations needed. These are pure deletions.
