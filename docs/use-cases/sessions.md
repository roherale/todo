# UC-SESSION: session lifetimes, storage and sign-out

**Status:** Approved (2026-11-26)

Time-based criteria are tested with a controllable clock. "Web" means a cookie session; "CLI" and "MCP" mean Bearer tokens from those clients.

## Lifetimes

| ID | Criterion |
|---|---|
| UC-SESSION-01 | A web session with no requests for **more than 1 hour** gets `401` on its next request, and its row is marked ended. At 59 minutes it still works. |
| UC-SESSION-02 | A web session older than **24 hours** gets `401` even if it has been active all along. |
| UC-SESSION-03 | A CLI or MCP session with no requests for **more than 24 hours** gets `401`. At 23h59m it still works. |
| UC-SESSION-04 | A CLI or MCP session older than **30 days** gets `401` even if it has been active all along. |
| UC-SESSION-05 | An MCP request rejected by UC-SESSION-03 or UC-SESSION-04 gets a `401` that includes the `WWW-Authenticate` header (UC-AUTH-06), so the AI client starts a new sign-in. |
| UC-SESSION-06 | After any expiry or sign-out, completing a **new** sign-in from the same client restores access. An ended session is never reactivated, and a new sign-in always creates a new session row. |
| UC-SESSION-07 | `lastSeenAt` is written at most once per minute per session, however many requests arrive in that minute. |

## Web activity

| ID | Criterion |
|---|---|
| UC-SESSION-08 | `POST /api/v1/session/heartbeat` accepts only a web cookie session (with the CSRF rules of UC-AUTH-10), returns `204`, and updates `lastSeenAt`. With a Bearer token it returns `403`. |
| UC-SESSION-09 | The web app sends a heartbeat at most once every 5 minutes, and only after a real interaction (key, click, scroll, or the tab regaining focus) since the last one. With no interaction, it sends none. A hidden tab never sends one. |
| UC-SESSION-10 | After 55 minutes without interaction, a dialog warns that you'll be signed out in 5 minutes. **Stay signed in** sends a heartbeat and closes it. Any other interaction also counts as activity. |
| UC-SESSION-11 | After 60 minutes without interaction, the app calls `POST /auth/logout` and shows the signed-out page. |

## Storage security

| ID | Criterion |
|---|---|
| UC-SESSION-12 | The web session cookie value is 32 random bytes, base64url-encoded. The database stores only its SHA-256 hash: the raw cookie value doesn't appear in any column. |
| UC-SESSION-13 | The WorkOS refresh token is stored only encrypted (AES-256-GCM) and is never in plain text. Encrypting the same token twice gives different ciphertexts. Decryption fails if the ciphertext, the IV, or the bound `userId` is altered. Each row records the key version used. |
| UC-SESSION-14 | CLI and MCP sessions are stored by `sha256(sid)` together with `client_id`. The raw `sid` doesn't appear in any column. |
| UC-SESSION-15 | The `sessions` table has exactly these columns: `id`, `userId`, `clientType`, `idHash`, `refreshTokenEnc`, `keyVersion`, `firstSeenAt`, `lastSeenAt`, `endedAt`. In particular, there is no IP address and no user agent. |
| UC-SESSION-16 | No API response body or header (except `Set-Cookie` at sign-in) ever contains a session ID, a cookie value, or any token. |
| UC-SESSION-17 | Startup fails if the session encryption key is missing or the wrong length (see UC-OPS-04). |

## Ending sessions

| ID | Criterion |
|---|---|
| UC-SESSION-18 | If WorkOS rejects a refresh, the session is ended and the request gets `401`. |
| UC-SESSION-19 | `POST /api/v1/sessions/end-all` (**Sign out everywhere**) accepts only a web cookie session with the CSRF rules, ends **all** of the caller's sessions (web, CLI and MCP), and returns `204`. Afterwards, every one of those sessions gets `401`, even with a JWT that hasn't expired. The web app asks for confirmation first, and cancelling sends no request. |
| UC-SESSION-20 | `end-all` never ends another user's sessions. User B's sessions are unaffected when user A calls it. |
| UC-SESSION-21 | Deleting an account deletes all of that user's session rows. |
| UC-SESSION-22 | When a user signs in, that user's ended and expired session rows are deleted. The deploy cleanup step deletes every ended or expired row. Rows for active sessions are never deleted by either. |
