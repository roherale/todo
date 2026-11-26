import { CreateTaskBodySchema, ListTasksQuerySchema, UpdateTaskBodySchema } from '@todo/shared';
import { z } from 'zod';
import { HttpError } from '../../common/errors.js';
import type { McpTool, McpUser } from '../../common/mcp-tool.js';
import { parseOrBadRequest } from '../../common/validate.js';
import type { TasksService } from './tasks.service.js';

const owner = (user: McpUser) => ({ id: user.id, timezone: user.timezone, pageSize: user.pageSize });

/** `12`, `#12` and a UUID all name a task. */
const refShape = z.union([z.string(), z.number()]).describe('The task: its UUID, its number such as 12, or #12');
function refOf(args: Record<string, unknown>): string {
  const raw = String(args['ref'] ?? '').trim();
  return raw.startsWith('#') ? raw.slice(1) : raw;
}

function requireConfirm(args: Record<string, unknown>, what: string): void {
  if (args['confirm'] !== true) {
    throw new HttpError(400, 'Confirmation required', `${what} cannot be undone. Call again with confirm: true to go ahead.`);
  }
}

const TIME_HELP =
  "Call get_profile first to learn the user's timezone. Send dueAt as an ISO-8601 time with an offset or Z (for example 2026-11-28T15:00:00-06:00).";

const listFilters = {
  status: z.string().optional().describe('new, queued, in_progress, paused or completed'),
  dueBefore: z.string().optional().describe('ISO-8601 time with an offset; with no status, completed tasks are left out'),
  limit: z.number().optional().describe('10, 25, 50 or 100; defaults to the user\'s page size'),
  cursor: z.string().optional().describe('nextCursor from the previous page'),
};

export function createTasksMcpTools(service: TasksService): McpTool[] {
  return [
    {
      name: 'list_tasks',
      title: 'List tasks',
      description: 'Lists the tasks that are not in the trash, newest first. Returns a page and a nextCursor.',
      annotations: { readOnlyHint: true },
      inputSchema: listFilters,
      run: (args, user) => service.list(owner(user), parseOrBadRequest(ListTasksQuerySchema, args)),
    },
    {
      name: 'get_task',
      title: 'Get a task',
      description: 'Returns one task by UUID, number or #number.',
      annotations: { readOnlyHint: true },
      inputSchema: { ref: refShape },
      run: (args, user) => service.get(owner(user), refOf(args)),
    },
    {
      name: 'list_trash',
      title: 'List the trash',
      description: 'Lists the tasks in the trash, newest first.',
      annotations: { readOnlyHint: true },
      inputSchema: { limit: listFilters.limit, cursor: listFilters.cursor },
      run: (args, user) => service.listTrash(owner(user), parseOrBadRequest(ListTasksQuerySchema, args)),
    },
    {
      name: 'create_task',
      title: 'Create a task',
      description: `Creates a task. ${TIME_HELP} Use dueAllDay: true with a date for tasks due on a whole day.`,
      annotations: {},
      inputSchema: {
        title: z.string(),
        notes: z.string().optional(),
        status: z.string().optional(),
        dueAt: z.string().optional(),
        dueAllDay: z.boolean().optional(),
      },
      run: (args, user) => service.create(owner(user), parseOrBadRequest(CreateTaskBodySchema, args)),
    },
    {
      name: 'update_task',
      title: 'Update a task',
      description: `Changes any of title, notes, status, dueAt and dueAllDay of a task that is not in the trash. Set dueAt to null to clear it. ${TIME_HELP}`,
      annotations: { idempotentHint: true },
      inputSchema: {
        ref: refShape,
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        status: z.string().optional(),
        dueAt: z.string().nullable().optional(),
        dueAllDay: z.boolean().optional(),
      },
      run: (args, user) => {
        const changes = { ...args };
        delete changes['ref'];
        return service.update(owner(user), refOf(args), parseOrBadRequest(UpdateTaskBodySchema, changes));
      },
    },
    {
      name: 'trash_task',
      title: 'Move a task to the trash',
      description: 'Moves a task to the trash. It can be restored.',
      annotations: { idempotentHint: true },
      inputSchema: { ref: refShape },
      run: async (args, user) => {
        await service.trash(owner(user), refOf(args));
        return { trashed: true };
      },
    },
    {
      name: 'restore_task',
      title: 'Restore a task from the trash',
      description: 'Restores a task from the trash with the status it had.',
      annotations: {},
      inputSchema: { ref: refShape },
      run: (args, user) => service.restore(owner(user), refOf(args)),
    },
    {
      name: 'purge_task',
      title: 'Delete a task permanently',
      description: 'Permanently deletes a task that is already in the trash. Requires confirm: true. This cannot be undone.',
      annotations: { destructiveHint: true },
      inputSchema: { ref: refShape, confirm: z.unknown().optional() },
      run: async (args, user) => {
        requireConfirm(args, 'Deleting a task permanently');
        await service.purge(owner(user), refOf(args));
        return { deleted: true };
      },
    },
    {
      name: 'empty_trash',
      title: 'Empty the trash',
      description: 'Permanently deletes every task in the trash. Requires confirm: true. This cannot be undone.',
      annotations: { destructiveHint: true },
      inputSchema: { confirm: z.unknown().optional() },
      run: (args, user) => {
        requireConfirm(args, 'Emptying the trash');
        return service.emptyTrash(owner(user));
      },
    },
  ];
}
