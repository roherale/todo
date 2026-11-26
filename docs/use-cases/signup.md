# UC-SIGNUP: creating an account

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-SIGNUP-01 | `POST /api/v1/profile` with a valid token, an allowlisted email, `displayName`, `timezone` and an optional `avatarUrl` returns `201` and creates one `users` row. Its `email` is taken from the token or WorkOS, never from the request body. |
| UC-SIGNUP-02 | If the token's email isn't in `ALLOWED_SIGNUP_EMAILS`, the API returns `403` problem+json with `type` ending in `signup-closed`, and creates no row. |
| UC-SIGNUP-03 | The allowlist check ignores case: `Test-A@Example.com` matches `test-a@example.com`. |
| UC-SIGNUP-04 | An invalid `timezone` (not an IANA zone), an empty `displayName`, or an invalid `avatarUrl` (see UC-PROFILE-05) returns `400` and creates no row. |
| UC-SIGNUP-05 | Signing up when a profile already exists for the token's `sub` returns `409`, and the existing row is unchanged. |
| UC-SIGNUP-06 | After a successful sign-up, the same token works on every route (no `signup-required`). |
