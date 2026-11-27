# UC-SIGNUP: creating an account

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-SIGNUP-01 | `POST /api/v1/profile` with a valid token, an allowlisted email, `displayName`, `timezone` and an optional `avatarUrl` returns `201` and creates one `users` row. Its `email` is taken from the token or WorkOS, never from the request body. |
| UC-SIGNUP-02 | If the token's email isn't in `ALLOWED_SIGNUP_EMAILS`, the API returns `403` problem+json with `type` ending in `signup-closed`, and creates no row. |
| UC-SIGNUP-03 | The allowlist check ignores case: `Test-A@Example.com` matches `test-a@example.com`. |
| UC-SIGNUP-04 | An invalid `timezone` (not an IANA zone), a `displayName` that's empty or over 100 characters after trimming, or an invalid `avatarUrl` (see UC-PROFILE-05) returns `400` and creates no row. |
| UC-SIGNUP-05 | Signing up when a profile already exists for the token's `sub` returns `409`, and the existing row is unchanged. |
| UC-SIGNUP-06 | After a successful sign-up, the same token works on every route (no `signup-required`). |
| UC-SIGNUP-07 | When `/auth/callback` signs in an identity that has no users row, no session row is created. Instead, the server sets a sealed (AES-256-GCM), `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` pending-sign-up cookie that holds only the WorkOS `sub`, `email` and display name (from the WorkOS profile, if any), never a token, expires after 15 minutes, and redirects to `/signup`. Only `POST /api/v1/profile` and `GET /auth/pending-signup` accept it, and the POST follows the CSRF rules of UC-AUTH-10. A tampered or expired cookie gets `401`. On success, the cookie is cleared and the response redirects to `/auth/login`, so a normal session is created. |
| UC-SIGNUP-08 | `GET /auth/pending-signup` with a valid pending-sign-up cookie returns only `{ "email", "displayName" }`. `displayName` is the WorkOS display name, or `null` if there isn't one. Without a valid cookie it returns `401`. It never returns the `sub` or any token. |
