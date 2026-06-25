# Bug Log — PAT 3.0

User-reported bugs, in the order they were raised. Each entry tracks root cause, fix, and
whether a Playwright test exists to guard against regression. This file is the input queue
for Phase 3B (Playwright test suite) — every entry without a ✅ in **Test status** is a gap
to close when that phase starts, and every new test added for an OLD entry should update its
status in place rather than being logged as a new entry.

**Status legend:** 🔴 No test yet · 🟡 Test planned/partial · ✅ Test in place

---

## B001 — Settings page spinner never hides
**Reported:** 2026-06-24, via Settings page (`settings.html`)
**Symptom:** "Loading…" text stayed visible at the top of the page indefinitely.
**Root cause:** `settings.html` copied the `<div class="spinner visible">` markup pattern from
`index.html` but never copied the matching CSS (`.spinner { display: none; }` /
`.spinner.visible { display: block; }`). The JS correctly toggled the class; there was no
rule to hide the element without it.
**Fix:** Added the missing CSS rule to `settings.html`'s own `<style>` block.
**Test status:** 🔴 No test yet. Playwright check: load `settings.html` as an authenticated
user, assert `#spinner` is not visible and `#settingsContent` is visible within N seconds.

## B002 — MFA enroll fails with "A factor with the friendly name \"\" already exists"
**Reported:** 2026-06-24, via Settings page MFA enrollment
**Symptom:** Clicking "Enroll" a second time (after an earlier abandoned/failed attempt)
threw a Supabase error and blocked all further enrollment.
**Root cause:** `patMfaEnroll()` called `auth.mfa.enroll({ factorType: 'totp' })` with no
`friendlyName`, so it always defaulted to `""`. A prior unverified factor with that same
empty name was never cleaned up, and Supabase rejects a second factor with a colliding name.
**Fix:** `patMfaEnroll()` now passes a unique `friendlyName` (`Authenticator ${Date.now()}`)
per attempt. `startEnroll()` in `settings.js` also proactively unenrolls any stale
`unverified` factor before starting a new enrollment, so old orphans self-heal.
**Test status:** 🔴 No test yet. Playwright check: simulate an abandoned enroll (start
enroll, navigate away without verifying), then start enroll again — assert no error and a
fresh QR renders. Requires a disposable Supabase test user, not a real account.

## B003 — TOTP QR code does not scan
**Reported:** 2026-06-24, via Settings page MFA enrollment (using Duo Mobile)
**Symptom:** The 6-digit manual code worked, but scanning the displayed QR code did not
register in the authenticator app.
**Root cause:** Supabase returns the QR as an SVG string with `width`/`height` attributes
but no `viewBox`. The page's CSS forced the SVG down to `180px` via `width`/`height`
properties — without a `viewBox`, this scales the raw pixel-rect grid non-uniformly instead
of scaling proportionally, corrupting the module alignment enough to break scans on at least
one real device/app (Duo Mobile).
**Fix:** `addSvgViewBox()` in `settings.js` injects a `viewBox` matching the SVG's native
width/height before insertion, making the CSS scale-down proportional and safe. Also redid
the surrounding panel layout/copy (labeled steps, a "Copy" button for the manual secret)
since the original presentation was visually disconnected from the rest of the page.
**Test status:** 🔴 No test yet — and likely can't be fully automated (Playwright can't scan
a QR with a real camera). Minimum viable Playwright check: assert the rendered `<svg>` has a
`viewBox` attribute matching its `width`/`height` after enrollment starts. Full confidence
still requires a manual device check whenever this code path changes.

## B004 — No push-notification MFA (Duo-style) support
**Reported:** 2026-06-24, via Settings page MFA enrollment (using Duo Mobile)
**Status:** Not a bug — feature gap, logged here per user instruction to capture all raised
issues in one place. TOTP (code-based) and push-notification MFA are different protocols;
Supabase Auth's `auth.mfa` API only supports TOTP and phone/SMS factors, not push approval.
Implementing Okta/Duo-style push would require a third-party MFA provider or a custom
push infrastructure (mobile app + push service) — out of scope for Supabase-native auth.
**Disposition:** Logged in `tasks/security-backlog.md` as a future enhancement, not scheduled.
**Test status:** N/A — no fix pending, nothing to test yet.

---

## Process note
See `CLAUDE.md` → Workflow Orchestration → "Bug Triage & Regression Loop" for the rule that
keeps this file current: every user-reported issue gets an entry here before or as part of
being fixed, and Phase 3B Playwright work must close out 🔴/🟡 entries by adding tests and
flipping them to ✅.
