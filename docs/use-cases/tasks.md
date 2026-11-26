# UC-TASK: creating, reading, updating and listing tasks

**Status:** Approved (2026-11-26)

## Create

| ID | Criterion |
|---|---|
| UC-TASK-01 | `POST /api/v1/tasks` with a valid body returns `201` and the task, including `id` (UUIDv7) and `number`. `ownerId` is always the caller. |
| UC-TASK-02 | If `status` isn't given, it defaults to `new`. |
| UC-TASK-03 | `title` is required: 1–200 characters after trimming whitespace. A missing, empty or whitespace-only title, or one over 200 characters, returns `400`. |
| UC-TASK-04 | `notes` is optional, up to 10,000 characters. |
| UC-TASK-05 | `number` starts at 1 for each user and goes up by 1 with each task that user creates. It is never reused, even after tasks are purged. Two users each have their own task #1. |
| UC-TASK-06 | A body containing `id`, `ownerId`, `number`, `deletedAt`, `completedAt`, `createdAt`, `updatedAt` or any unknown field returns `400`. |

## Read and update

| ID | Criterion |
|---|---|
| UC-TASK-07 | `GET /api/v1/tasks/:ref` returns the task, where `:ref` is either the UUID or the number (`12`). An unknown ref returns `404`. |
| UC-TASK-08 | `PATCH /api/v1/tasks/:ref` updates any combination of `title`, `notes`, `status`, `dueAt` and `dueAllDay` in one request, and changes `updatedAt`. Setting `status` to `completed` may come with changes to any other field in the same request. |
| UC-TASK-17 | When `status` changes to `completed`, the server sets `completedAt` to the current time. When it changes from `completed` to any other status, `completedAt` is cleared. `completedAt` can't be set by clients (`400`). Apart from `completedAt` and `updatedAt`, the server never changes a field the request didn't include. |
| UC-TASK-18 | With `dueAllDay: true`, the date D in UC-TASK-14 is the calendar date written in the `dueAt` string. When a task that has a timed `dueAt` is switched to `dueAllDay: true` without a new `dueAt`, D is the local date of its current `dueAt` in the profile timezone. |
| UC-TASK-09 | `status` can change from any value in `new`, `queued`, `in_progress`, `paused`, `completed` to any other. All 20 transitions are tested. An unknown status returns `400`. |

## List

| ID | Criterion |
|---|---|
| UC-TASK-10 | `GET /api/v1/tasks` returns only the caller's tasks that are **not** in the trash. `?status=` filters by one status, and `?dueBefore=` returns tasks with `dueAt` before that instant. |
| UC-TASK-11 | The default order is **newest first**, by `id` descending. UUIDv7 is time-ordered, so this matches creation order. |
| UC-TASK-12 | Pagination: `limit` must be one of `10`, `25`, `50` or `100`, and any other value returns `400`. If `limit` is left out, it uses the caller's profile `pageSize`, or `10` if that isn't set. The response includes a `nextCursor`, and following it returns every task exactly once, with no duplicates or gaps. |

## Due dates

| ID | Criterion |
|---|---|
| UC-TASK-13 | `dueAt` must be ISO-8601 with an offset or `Z`. A time with no timezone, like `2026-11-28T15:00:00`, returns `400`. |
| UC-TASK-14 | With `dueAllDay: true` and a `dueAt` on local date D, the stored `dueAt` is D at 23:59:59 in the user's profile timezone, and responses return `dueAllDay: true`. |
| UC-TASK-15 | `dueAt: null` clears the due date and sets `dueAllDay` to `false`. |
| UC-TASK-16 | A task counts as overdue when `dueAt < now` and `status != completed`. `?dueBefore=X` returns tasks with `dueAt < X`, excluding completed tasks **unless `?status=` is also given**, in which case the status filter alone decides. For example, `?status=completed&dueBefore=X` lists completed tasks that were due before X. |
