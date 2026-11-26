# UC-TRASH: soft delete, restore, purge and empty trash

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-TRASH-01 | `DELETE /api/v1/tasks/:ref` sets `deletedAt` and returns `204`. The task no longer appears in `GET /api/v1/tasks`. |
| UC-TRASH-02 | `GET /api/v1/trash` lists only the caller's tasks that are in the trash, with the same pagination as UC-TASK-12. |
| UC-TRASH-03 | `DELETE /api/v1/tasks/:ref?permanent=true` on a task that's **not** in the trash returns `409`, and the task is unchanged. |
| UC-TRASH-04 | `POST /api/v1/tasks/:ref/restore` clears `deletedAt`. The task has exactly the `status` it had before it was trashed. Tested from every one of the 5 statuses. |
| UC-TRASH-05 | Restoring a task that isn't in the trash returns `409`. |
| UC-TRASH-06 | `PATCH` on a task that's in the trash returns `409`, and nothing changes. |
| UC-TRASH-07 | `DELETE /api/v1/tasks/:ref?permanent=true` on a task in the trash returns `204` and removes the row. A later `GET`, restore or purge of that ref returns `404`. |
| UC-TRASH-08 | After a purge, the next task the user creates still gets the next number. The purged number is not reused (UC-TASK-05). |
| UC-TRASH-09 | `DELETE /api/v1/trash` permanently removes **only** the caller's tasks that are in the trash. Their tasks outside the trash are unchanged. It returns `{ "deleted": <count> }`. |
| UC-TRASH-10 | Emptying an empty trash succeeds with `deleted: 0`. |
