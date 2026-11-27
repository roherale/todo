# UC-OPS: health, logging, config and security headers

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-OPS-01 | `GET /health` returns `200` when the database answers a simple query, and `503` when it doesn't. It needs no auth. |
| UC-OPS-02 | Every response has an `X-Request-Id` header, and every problem+json body includes the same `requestId`. |
| UC-OPS-03 | The logs never contain the `Authorization` header, tokens, session cookies or session IDs, or task `title` and `notes`. A test captures the log output from a full create/update flow and checks for each of these. |
| UC-OPS-04 | Startup fails with a clear error naming the variable if a required environment variable is missing or invalid. Config is checked with Zod in `common/config.ts`. |
| UC-OPS-05 | Unhandled errors return `500` problem+json with no stack trace or internal message in the body. The details go only to the logs. |
| UC-OPS-06 | Responses include a `Content-Security-Policy` header containing `img-src 'self' https:`. |
| UC-OPS-07 | On `SIGTERM` the server stops accepting new connections, lets in-flight requests finish, closes the database pool, and exits with code 0. |
