import type { McpTool } from '../../common/mcp-tool.js';

/** Read-only: there is no tool to edit the profile or delete the account. */
export function createUsersMcpTools(): McpTool[] {
  return [
    {
      name: 'get_profile',
      title: 'Get the profile',
      description: "Returns the user's displayName, email and timezone. Call this before creating or updating a task with a due time.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
      run: (_args, user) => Promise.resolve({ displayName: user.displayName, email: user.email, timezone: user.timezone }),
    },
  ];
}
