# Use cases and acceptance criteria

> **Status: APPROVED by the owner on 2026-11-26.** Any later change to a criterion needs the owner's approval.

## How this works

- Every criterion has a stable ID, `UC-<AREA>-<NN>`.
- IDs are never reused. A removed criterion is struck through and marked `Withdrawn`.
- Every criterion needs at least one test whose name starts with its ID, e.g. `it('UC-TRASH-03: …')`. A CI script fails the build if any criterion has no test.
- Changing a criterion after approval requires the owner's approval. Changing a test to match new behaviour without that approval is not allowed.
- "User A" and "user B" are two signed-up users. Unless a criterion says otherwise, every request is authenticated as user A.

## Files

| File | Area | Review status |
|---|---|---|
| [auth.md](auth.md) | `UC-AUTH`: tokens, OAuth discovery, sign-up guard | Approved |
| [signup.md](signup.md) | `UC-SIGNUP`: creating an account | Approved |
| [profile.md](profile.md) | `UC-PROFILE`: viewing, editing and deleting the account | Approved |
| [tasks.md](tasks.md) | `UC-TASK`: creating, reading, updating and listing tasks; due dates | Approved |
| [trash.md](trash.md) | `UC-TRASH`: soft delete, restore, purge, empty trash | Approved |
| [isolation.md](isolation.md) | `UC-ISO`: users can never see or touch each other's data | Approved |
| [mcp.md](mcp.md) | `UC-MCP`: the MCP server and its tools | Approved |
| [cli.md](cli.md) | `UC-CLI`: the command line tool | Approved |
| [web.md](web.md) | `UC-WEB`: the Angular app | Approved |
| [ops.md](ops.md) | `UC-OPS`: health, logging, config, security headers | Approved |
| [deploy.md](deploy.md) | `UC-DEPLOY`: pipeline, image, rollback | Approved |
| [sessions.md](sessions.md) | `UC-SESSION`: lifetimes, web activity, secure storage, sign out everywhere | Approved |

## Details proposed during drafting (all approved 2026-11-26)

These details filled gaps in the design. The owner approved all of them together with the use cases.

| # | Proposed detail | Criteria |
|---|---|---|
| P1 | A new task's default status is `new` | UC-TASK-02 |
| P2 | `title` is 1–200 characters after trimming; `notes` is at most 10,000 characters | UC-TASK-03, UC-TASK-04 |
| P3 | ~~Settled by the owner: newest first; page sizes 10, 25, 50 or 100, default 10, saved in the profile.~~ | UC-TASK-11, UC-TASK-12 |
| P4 | A task in the trash can't be updated (`409`); restore it first | UC-TRASH-06 |
| P5 | Restoring a task that isn't in the trash returns `409` | UC-TRASH-05 |
| P6 | Unknown or read-only fields in request bodies (e.g. `email`, `ownerId`, `number`) are rejected with `400`, not silently ignored | UC-TASK-06, UC-PROFILE-04 |
| P7 | **All-day due dates and timezone changes:** an all-day task stored as 23:59:59 in the *old* timezone would move when you change your timezone. Proposed: when the timezone changes, all-day `dueAt` values are recalculated so they stay on the same calendar date. | UC-PROFILE-07 |
| P8 | `DELETE /api/v1/trash` returns the number of tasks removed | UC-TRASH-09 |
| P9 | In a non-interactive terminal (no TTY), the CLI refuses `purge` and `trash --empty` unless `--yes` is given | UC-CLI-09 |
| P10 | Signing up a second time returns `409` | UC-SIGNUP-05 |
| P11 | The allowlist comparison is case-insensitive | UC-SIGNUP-03 |
| P12 | ~~Settled by the owner (Q82): completing can come with other field changes, and the server sets `completedAt`.~~ | UC-TASK-08, UC-TASK-17 |
