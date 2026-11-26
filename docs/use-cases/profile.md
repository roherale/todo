# UC-PROFILE: viewing, editing and deleting the account

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-PROFILE-01 | `GET /api/v1/profile` returns the caller's `id`, `email`, `displayName`, `avatarUrl`, `timezone`, `pageSize`, `createdAt` and `updatedAt`. It does not return `workosUserId`. |
| UC-PROFILE-02 | `PATCH /api/v1/profile` updates any of `displayName`, `avatarUrl`, `timezone` and `pageSize` (one of 10, 25, 50, 100; default 10), returns the updated profile, and changes `updatedAt`. |
| UC-PROFILE-03 | `PATCH` with `avatarUrl: null` removes the avatar. |
| UC-PROFILE-04 | `PATCH` with `email`, `id`, `workosUserId` or any unknown field returns `400`, and nothing changes. |
| UC-PROFILE-05 | `avatarUrl` is accepted only if it's a valid absolute URL using `https:`, at most 2048 characters long. `http:`, `javascript:`, `data:`, relative URLs and longer strings are rejected with `400`. |
| UC-PROFILE-06 | The server never makes an HTTP request to `avatarUrl`. A test checks that no outbound request happens on sign-up, `PATCH` or `GET`. |
| UC-PROFILE-07 | After the `timezone` changes, every all-day task of that user still has the same local calendar date, at 23:59:59 in the new timezone. |
| UC-PROFILE-08 | `DELETE /api/v1/profile` with `{ "confirmEmail": "<the user's email>" }` returns `204`, and permanently removes the user and **all** of their tasks, including the trash. |
| UC-PROFILE-09 | `DELETE /api/v1/profile` with a missing or non-matching `confirmEmail` returns `400`, and nothing is deleted. |
| UC-PROFILE-10 | Deleting user A's account doesn't change any of user B's rows. |
| UC-PROFILE-11 | After deletion, user A's old token gets `signup-required` (UC-AUTH-04). |
| UC-PROFILE-12 | `PATCH /api/v1/profile` is accepted only from a web session (cookie). With a CLI or MCP Bearer token, it returns `403` and nothing changes. The same applies to `DELETE /api/v1/profile`. |
