# UC-ISO: users can never see or touch each other's data

**Status:** Approved (2026-11-26)

This is the core requirement of the project. These tests live in `packages/api/test/` and run against real Postgres, with users A and B each holding tasks, including tasks in the trash.

| ID | Criterion |
|---|---|
| UC-ISO-01 | User B gets `404` (never `403`, `200` or `204`) for every one of these on user A's task, whether it's referenced by UUID **or** by number: `GET`, `PATCH`, trash, restore and purge. After each attempt, A's task is byte-for-byte unchanged. |
| UC-ISO-02 | User B's `GET /api/v1/tasks` and `GET /api/v1/trash` never include any of A's tasks, whatever filters, limits or cursors are used. |
| UC-ISO-03 | User B emptying the trash never removes A's tasks from the trash. |
| UC-ISO-04 | Using number `1` as user B finds B's task #1, never A's task #1. |
| UC-ISO-05 | A cursor taken from user A's list, when sent by user B, returns no tasks from A. It returns either `400` or B's own tasks. |
| UC-ISO-06 | Every MCP tool that takes a task ref returns a "not found" tool error when user B uses it on user A's task. `list_tasks` and `list_trash` as B never return A's tasks. |
| UC-ISO-07 | A `PATCH` or `POST` body can never set or change `ownerId` (see UC-TASK-06). The owner is always the caller. |
| UC-ISO-08 | Every repository method requires an `ownerId` and includes it in the SQL `WHERE` clause. The mutation-testing suite must kill a mutant that removes the owner condition. |
