# UC-MCP: the MCP server and its tools

**Status:** Approved (2026-11-26)

| ID | Criterion |
|---|---|
| UC-MCP-01 | `tools/list` returns exactly these tools: `list_tasks`, `get_task`, `list_trash`, `get_profile`, `create_task`, `update_task`, `trash_task`, `restore_task`, `purge_task`, `empty_trash`. In particular, there is no tool to update the profile or delete the account. |
| UC-MCP-02 | `list_tasks`, `get_task`, `list_trash` and `get_profile` have `readOnlyHint: true`. `purge_task` and `empty_trash` have `destructiveHint: true`. |
| UC-MCP-03 | The server is stateless. Two separate requests work without any `Mcp-Session-Id`, and no session is stored between them. |
| UC-MCP-04 | Each tool calls the same service method as the matching REST endpoint, with the same results and errors. For example, `create_task` with an empty title gives a validation error, matching UC-TASK-03. |
| UC-MCP-05 | Tools accept a task ref as a UUID, a number, or `#<number>`. |
| UC-MCP-06 | `purge_task` and `empty_trash` called without `confirm: true` return a tool error and delete nothing. |
| UC-MCP-07 | `purge_task` on a task that isn't in the trash returns a tool error and leaves the task unchanged, matching UC-TRASH-03. |
| UC-MCP-08 | If the caller hasn't signed up, every tool returns an error result whose text contains the sign-up URL. |
| UC-MCP-09 | The descriptions of `create_task` and `update_task` tell the model to call `get_profile` for the user's timezone, and to send `dueAt` with an offset. |
| UC-MCP-10 | `get_profile` returns `displayName`, `email` and `timezone`, and never `workosUserId`. |
