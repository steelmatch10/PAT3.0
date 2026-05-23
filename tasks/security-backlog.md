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

## Notes
- Both flows require a hosted URL (not `file://`) for Supabase redirect links to work — ensure Live Server or a proper host is used during testing.
- Supabase project redirect URLs must be configured in Authentication → URL Configuration.
