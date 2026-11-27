# UC-AUTH: tokens, OAuth discovery and the sign-up guard

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-AUTH-01 | A request to any `/api/v1/*` route with neither a valid web session cookie nor an `Authorization: Bearer` header returns `401` problem+json. |
| UC-AUTH-02 | A token with a bad signature, the wrong `iss`, the wrong `aud`, or an `exp` in the past returns `401`. Each of the four cases is tested separately. |
| UC-AUTH-03 | A token signed by the test-only signer is accepted **only** when the app is created in test mode. With production config it returns `401`. |
| UC-AUTH-04 | A valid token whose `sub` doesn't match any `users.workosUserId` gets `403` problem+json on every route except `POST /api/v1/profile`, with `type` ending in `signup-required` and a `signupUrl` field. |
| UC-AUTH-05 | A valid token for a signed-up user reaches the route handler, with `req.user` set to that user's `users` row. |
| UC-AUTH-06 | A request to `/mcp` without a valid token returns `401` with a `WWW-Authenticate` header containing `resource_metadata="<origin>/.well-known/oauth-protected-resource"`. |
| UC-AUTH-07 | `GET /.well-known/oauth-protected-resource` needs no auth and returns JSON with `resource` (this server's `/mcp` URL) and `authorization_servers` (the WorkOS AuthKit issuer). |
| UC-AUTH-08 | `/health`, `/.well-known/*`, the static web files, the `/auth/*` sign-in routes (`/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/pending-signup`), and `POST /api/v1/profile` with a valid pending-sign-up cookie (UC-SIGNUP-07) are the only routes that work without a session or token. |
| UC-AUTH-09 | Web sign-in: `GET /auth/login` redirects to the WorkOS authorization page. `GET /auth/callback` exchanges the code on the server and sets a `__Host-` session cookie with `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`. No token ever reaches the browser, either in a response body or in a readable cookie. |
| UC-AUTH-10 | A cookie-authenticated `POST`, `PATCH` or `DELETE` without the `X-Requested-With` header, or with an `Origin` other than the app's own, returns `403` and changes nothing. |
| UC-AUTH-11 | `POST /auth/logout` ends the session on the server, clears the cookie, and signs out of WorkOS. The old cookie then gets `401`. |
| UC-AUTH-12 | A new session ID is issued on every sign-in. A session ID set before sign-in is never accepted afterwards (session-fixation protection). |
| UC-AUTH-13 | A Bearer token whose `sub_profile` claim is `ai_agent` returns `401` on `/api/v1/*` and on `/mcp` (with the discovery challenge there). Tokens with no `sub_profile`, or with any other value, are not affected. |
