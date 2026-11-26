import { PAGE_SIZES, TASK_STATUSES, TaskStatusSchema, type Task, type TaskPage, type TaskStatus } from '@todo/shared';
import type { Command } from 'commander';
import { fetchProfile, signedIn, type Deps } from '../common/context.js';
import { parseDue } from '../common/due-parser.js';
import { CliError } from '../common/errors.js';
import { formatTask, formatTaskDetail } from '../common/format.js';
import { confirm } from '../common/io.js';

const refOf = (ref: string) => (ref.startsWith('#') ? ref.slice(1) : ref);

function statusOf(value: string | undefined): TaskStatus | undefined {
  if (value === undefined) return undefined;
  const parsed = TaskStatusSchema.safeParse(value.replace(/-/g, '_'));
  if (!parsed.success) throw new CliError(`Unknown status "${value}". Use one of: ${TASK_STATUSES.join(', ')}.`);
  return parsed.data;
}

function limitOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!(PAGE_SIZES as readonly number[]).includes(n)) throw new CliError(`--limit must be one of ${PAGE_SIZES.join(', ')}.`);
  return n;
}

/** Checks the words without a timezone, so a typo is reported before any request is sent. */
function checkDue(value: string | undefined, now: Date): void {
  if (value !== undefined) parseDue(value, 'UTC', now);
}

export function registerTasks(program: Command, deps: Deps): void {
  const print = (lines: string[]) => lines.forEach((l) => deps.io.out(l));

  program
    .command('ls')
    .description('List your tasks, newest first')
    .option('--status <status>', `only this status (${TASK_STATUSES.join(', ')})`)
    .option('--due-before <when>', 'only tasks due before this date, e.g. 2026-12-01 or "fri 3pm"')
    .option('--limit <n>', `how many to show: ${PAGE_SIZES.join(', ')} (default: your profile page size)`)
    .option('--cursor <cursor>', 'continue from the cursor printed at the end of a page')
    .action(async (opts: { status?: string; dueBefore?: string; limit?: string; cursor?: string }) => {
      const status = statusOf(opts.status);
      const limit = limitOf(opts.limit);
      checkDue(opts.dueBefore, deps.now());
      const client = await signedIn(deps);
      const profile = await fetchProfile(client);
      const page = await client.request<TaskPage>('GET', '/api/v1/tasks', {
        query: {
          limit: limit ?? profile.pageSize,
          status,
          dueBefore: opts.dueBefore ? parseDue(opts.dueBefore, profile.timezone, deps.now()).dueAt : undefined,
          cursor: opts.cursor,
        },
      });
      if (page.items.length === 0) deps.io.out('No tasks.');
      for (const task of page.items) deps.io.out(formatTask(task, profile.timezone, deps.now()));
      if (page.nextCursor) deps.io.out(`More: todo ls --cursor ${page.nextCursor}`);
    });

  program
    .command('add')
    .description('Add a task')
    .argument('<title>', 'what needs doing')
    .option('--notes <text>', 'longer notes')
    .option('--due <when>', 'YYYY-MM-DD (all day), "YYYY-MM-DD HH:mm", today, tomorrow, fri, "fri 3pm"')
    .option('--status <status>', `starting status (${TASK_STATUSES.join(', ')})`)
    .action(async (title: string, opts: { notes?: string; due?: string; status?: string }) => {
      const status = statusOf(opts.status);
      checkDue(opts.due, deps.now());
      const client = await signedIn(deps);
      const profile = opts.due ? await fetchProfile(client) : undefined;
      const due = opts.due && profile ? parseDue(opts.due, profile.timezone, deps.now()) : undefined;
      const task = await client.request<Task>('POST', '/api/v1/tasks', {
        body: { title, ...(opts.notes ? { notes: opts.notes } : {}), ...(status ? { status } : {}), ...(due ?? {}) },
      });
      deps.io.out('Added:');
      print(formatTaskDetail(task, profile?.timezone ?? 'UTC', deps.now()));
    });

  program
    .command('set')
    .description('Change a task')
    .argument('<ref>', 'the task number, #number or id')
    .option('--title <text>', 'new title')
    .option('--notes <text>', 'new notes')
    .option('--due <when>', 'new due date or time')
    .option('--clear-due', 'remove the due date')
    .option('--status <status>', `new status (${TASK_STATUSES.join(', ')})`)
    .action(async (ref: string, opts: { title?: string; notes?: string; due?: string; clearDue?: boolean; status?: string }) => {
      const status = statusOf(opts.status);
      checkDue(opts.due, deps.now());
      if (opts.due && opts.clearDue) throw new CliError('Use either --due or --clear-due, not both.');
      if (opts.title === undefined && opts.notes === undefined && opts.due === undefined && !opts.clearDue && !status) {
        throw new CliError('Nothing to change. Give at least one of --title, --notes, --due, --clear-due, --status.');
      }
      const client = await signedIn(deps);
      const profile = await fetchProfile(client);
      const due = opts.due ? parseDue(opts.due, profile.timezone, deps.now()) : undefined;
      const task = await client.request<Task>('PATCH', `/api/v1/tasks/${refOf(ref)}`, {
        body: {
          ...(opts.title === undefined ? {} : { title: opts.title }),
          ...(opts.notes === undefined ? {} : { notes: opts.notes }),
          ...(status ? { status } : {}),
          ...(due ?? {}),
          ...(opts.clearDue ? { dueAt: null } : {}),
        },
      });
      deps.io.out('Updated:');
      print(formatTaskDetail(task, profile.timezone, deps.now()));
    });

  program
    .command('rm')
    .description('Move a task to the trash')
    .argument('<ref>', 'the task number, #number or id')
    .action(async (ref: string) => {
      const client = await signedIn(deps);
      await client.request('DELETE', `/api/v1/tasks/${refOf(ref)}`);
      deps.io.out(`Moved ${ref.startsWith('#') ? ref : `#${ref}`} to the trash. Restore it with: todo restore ${refOf(ref)}`);
    });

  program
    .command('restore')
    .description('Bring a task back from the trash')
    .argument('<ref>', 'the task number, #number or id')
    .action(async (ref: string) => {
      const client = await signedIn(deps);
      const profile = await fetchProfile(client);
      const task = await client.request<Task>('POST', `/api/v1/tasks/${refOf(ref)}/restore`);
      deps.io.out('Restored:');
      print(formatTaskDetail(task, profile.timezone, deps.now()));
    });

  program
    .command('trash')
    .description('List the tasks in the trash, or empty it with --empty')
    .option('--empty', 'permanently delete everything in the trash')
    .option('--yes', 'do not ask for confirmation')
    .option('--limit <n>', `how many to show: ${PAGE_SIZES.join(', ')} (default: your profile page size)`)
    .option('--cursor <cursor>', 'continue from the cursor printed at the end of a page')
    .action(async (opts: { empty?: boolean; yes?: boolean; limit?: string; cursor?: string }) => {
      const limit = limitOf(opts.limit);
      const client = await signedIn(deps);
      if (opts.empty) {
        if (!(await confirm(deps.io, 'Permanently delete everything in the trash?', Boolean(opts.yes)))) {
          deps.io.out('Cancelled.');
          return;
        }
        const result = await client.request<{ deleted: number }>('DELETE', '/api/v1/trash');
        deps.io.out(`Deleted ${result.deleted} ${result.deleted === 1 ? 'task' : 'tasks'} permanently.`);
        return;
      }
      const profile = await fetchProfile(client);
      const page = await client.request<TaskPage>('GET', '/api/v1/trash', {
        query: { limit: limit ?? profile.pageSize, cursor: opts.cursor },
      });
      if (page.items.length === 0) deps.io.out('The trash is empty.');
      for (const task of page.items) deps.io.out(formatTask(task, profile.timezone, deps.now()));
      if (page.nextCursor) deps.io.out(`More: todo trash --cursor ${page.nextCursor}`);
    });

  program
    .command('purge')
    .description('Permanently delete a task that is in the trash')
    .argument('<ref>', 'the task number, #number or id')
    .option('--yes', 'do not ask for confirmation')
    .action(async (ref: string, opts: { yes?: boolean }) => {
      const client = await signedIn(deps);
      if (!(await confirm(deps.io, `Permanently delete ${ref.startsWith('#') ? ref : `#${ref}`}? This cannot be undone.`, Boolean(opts.yes)))) {
        deps.io.out('Cancelled.');
        return;
      }
      await client.request('DELETE', `/api/v1/tasks/${refOf(ref)}`, { query: { permanent: 'true' } });
      deps.io.out(`Deleted ${ref.startsWith('#') ? ref : `#${ref}`} permanently.`);
    });
}
