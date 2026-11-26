# UC-CLI: the command line tool

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-CLI-01 | `todo login` opens the browser to WorkOS using PKCE, with a loopback redirect on a random port, and stores the refresh token in the OS keychain. No token is ever written to a file or printed. |
| UC-CLI-02 | `todo logout` removes the token from the keychain. After that, any command prints "Not logged in, run `todo login`" and exits with a non-zero code. |
| UC-CLI-03 | When the access token expires, the CLI refreshes it once using the stored refresh token and retries the command. If refreshing fails, it behaves as in UC-CLI-02. |
| UC-CLI-04 | If the API returns `signup-required`, the CLI prints the sign-up URL and exits with a non-zero code. |
| UC-CLI-05 | `todo ls [--status <s>] [--due-before <when>]`, `todo add <title> [--notes] [--due] [--status]`, `todo set <ref> [...]`, `todo rm <ref>`, `todo restore <ref>`, `todo trash` (lists the trash) and `todo profile` each call the matching API endpoint and print a readable result. |
| UC-CLI-06 | `--due` accepts `YYYY-MM-DD` (all-day), `YYYY-MM-DD HH:mm`, and relative words like `today`, `tomorrow`, `fri` and `fri 3pm`. It converts them to ISO-8601 with an offset using the **profile** timezone, not the machine's. Input it can't parse gives an error and sends no request. |
| UC-CLI-07 | `todo purge <ref>` and `todo trash --empty` ask for confirmation (`[y/N]`). Anything except `y` or `yes` cancels, and no request is sent. |
| UC-CLI-08 | `--yes` skips the confirmation prompt. |
| UC-CLI-09 | Without a TTY and without `--yes`, `purge` and `trash --empty` refuse to run and exit with a non-zero code. |
| UC-CLI-10 | API problem+json errors are printed as one clear line, plus the `requestId`. Raw JSON and stack traces are never printed. |
| UC-CLI-11 | There is no CLI command to edit the profile or delete the account. |
| UC-CLI-12 | `todo ls` and `todo trash` use the profile's `pageSize` when `--limit` isn't given. `--limit` accepts only 10, 25, 50 or 100. |
