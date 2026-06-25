# Security & Auth Backlog

Features deferred until a dedicated security pass (PAT 3.x or 4.0).

## Email change flow
- Changing primary email requires Supabase Auth-level verification — it sends confirmation to both old and new addresses before the change takes effect.
- Currently the profile widget has primary email as read-only. Do not change this until the full flow is implemented.
- **Couple with:** password reset / forgot password flow (see below).

## Password reset / forgot password
- Login page needs a "Forgot your password?" link that triggers `supabaseClient.auth.resetPasswordForEmail(email)`.
- After clicking the link in the email, user lands on a `/reset-password` page that calls `supabaseClient.auth.updateUser({ password: newPassword })`.
- Email change flow should be available from the same authenticated session after password is confirmed.

## Push-notification MFA (Okta/Duo-style)
- Raised by user 2026-06-24 after testing TOTP enrollment with Duo Mobile — TOTP worked, but
  no push notification was sent (expected; Duo's push approval is a different protocol).
- Supabase Auth's `auth.mfa` API supports TOTP and phone/SMS factors only — no push-approval
  primitive. Implementing Okta/Duo-style push would require either a third-party MFA
  provider/IdP swap, or custom infrastructure (companion mobile app + push service).
- Not scheduled. Revisit if/when the team needs that UX specifically — current TOTP support
  (`settings.html`, Phase 1B) covers the baseline MFA requirement.
- See `tasks/bug-log.md` → B004 for the full report.

## Notes
- Both flows require a hosted URL (not `file://`) for Supabase redirect links to work — ensure Live Server or a proper host is used during testing.
- Supabase project redirect URLs must be configured in Authentication → URL Configuration.
