# Lessons — PAT 3.0

## L001 — Post-task artifact cleanup
After every task, scan the project root (and subdirs) for files you did not intentionally create — especially empty or stray files with no extension, `.txt` artifacts, or other debris.

Steps:
1. `find . -type f -name "*.txt" ! -path "*/node_modules/*" ! -path "*/.git/*"` — delete any found
2. `git status --short` — review all untracked (`??`) files; delete anything not intentionally created
3. Only the three intentional changes (modified source files) should remain

**Why:** The hooks or shell environment occasionally drops zero-byte or oddly-named artifacts during tool execution. If left, they show up as untracked noise in git and accumulate across sessions.
