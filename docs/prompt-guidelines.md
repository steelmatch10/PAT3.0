# Prompt Guidelines — PAT 3.0

## Naming Convention
`<purpose>-v<major>.<minor>.<patch>.md`

- **purpose**: lowercase, hyphen-separated description of what the prompt does
- **major**: breaking change to intent or output structure
- **minor**: new constraint or format, backwards compatible
- **patch**: wording fix only, no behavior change

Examples:
- `property-summary-v1.0.0.md`
- `catalogue-export-v2.1.3.md`

---

## Directory Rules

| Location | What goes here |
|---|---|
| `prompts/active/` | Prompts currently in use |
| `prompts/archive/` | Superseded versions |
| `prompts/templates/` | Reusable skeletons |
| `evaluations/` | Test cases and run logs |
| `docs/` | Guidelines and governance (this file) |

---

## Lifecycle

1. **Create** — copy `base-prompt-template.md`, fill it out, place in `active/`
2. **Test** — add test cases to `evaluations/test-cases.md`, run them
3. **Log** — record results in `evaluations/results-log.md`
4. **Iterate** — if failing, use `/prompt-optimizer`, bump version, re-test
5. **Archive** — move to `archive/` when retired; note reason in results-log

---

## Quality Bar

A prompt is ready for `active/` when it meets all criteria:
- [ ] Intent is clear to an unfamiliar reader
- [ ] Output format is specified or exemplified
- [ ] At least 2 test cases pass (including one edge case)
- [ ] No filler phrases or redundant context
- [ ] Constraints are listed, not implied

---

## Review Process
- Prompt changes follow the same PR process as code changes
- Reviewer checks: naming, version bump, test cases updated, results logged
- No prompt goes to `active/` without at least one passing evaluation run
