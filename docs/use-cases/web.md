# UC-WEB: the Angular app

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-WEB-01 | A visitor who isn't logged in is sent to `/auth/login`. After logging in, API calls use the session cookie, and the interceptor adds `X-Requested-With` to every request that changes something. The app never reads or stores a token. |
| UC-WEB-02 | Any API response of `signup-required` redirects to `/signup`. |
| UC-WEB-03 | The sign-up form pre-fills `displayName` from WorkOS and `timezone` from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`). It validates with the shared Zod schema before submitting. |
| UC-WEB-04 | A `signup-closed` response shows a "sign-ups are closed" message. |
| UC-WEB-05 | The task list shows tasks that aren't in the trash, newest first, with status, number and due date, and can be filtered by status. Tasks can be created, edited and trashed. |
| UC-WEB-11 | The list has a page-size selector offering 10, 25, 50 and 100, which starts at the profile's `pageSize`. Changing it saves the new value to the profile, so it's kept across reloads, sign-ins and devices. |
| UC-WEB-06 | Due dates are shown in the **profile** timezone. All-day tasks show only the date. Overdue tasks are visibly marked. |
| UC-WEB-07 | The trash view lists tasks in the trash and lets you restore one. **Delete permanently** and **Empty trash** each open a confirmation dialog, and cancelling sends no request. |
| UC-WEB-08 | The profile page edits `displayName`, `avatarUrl` and `timezone`. `email` is shown read-only. |
| UC-WEB-09 | **Delete account** opens a dialog whose confirm button stays disabled until the typed text exactly matches the user's email. |
| UC-WEB-10 | The avatar is rendered with `referrerpolicy="no-referrer"`. If it fails to load, or there's no `avatarUrl`, the user's initials are shown. |
| UC-WEB-12 | The profile page has a **Sign out everywhere** button that opens a confirmation dialog and then calls UC-SESSION-19. |
