import type { CreateTaskBody, ListTasksQuery, Task, TaskPage, UpdateTaskBody } from '@todo/shared';
import { endOfLocalDay, localDate } from '../../common/due.js';
import { HttpError } from '../../common/errors.js';
import type { TaskChanges, TaskRef, TasksRepository } from './tasks.repository.js';

/** The caller, as the service needs to know them. */
export interface Owner {
  id: string;
  timezone: string;
  pageSize?: number | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^[1-9]\d{0,8}$/;
const DEFAULT_PAGE_SIZE = 10;

function parseRef(ref: string): TaskRef {
  if (UUID.test(ref)) return { kind: 'id', id: ref.toLowerCase() };
  if (NUMBER.test(ref)) return { kind: 'number', number: Number(ref) };
  throw new HttpError(404, 'Not Found');
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!UUID.test(id)) throw new HttpError(400, 'Bad Request', 'cursor: invalid');
  return id;
}

export function createTasksService(repo: TasksRepository, now: () => Date = () => new Date()) {
  async function mustFind(owner: Owner, ref: string): Promise<Task> {
    const task = await repo.find(owner.id, parseRef(ref));
    if (!task) throw new HttpError(404, 'Not Found');
    return task;
  }

  /** The stored `dueAt`, given what the client sent and the user's timezone. */
  function resolveDue(owner: Owner, dueAt: string | null, allDay: boolean): { dueAt: Date | null; dueAllDay: boolean } {
    if (dueAt === null) return { dueAt: null, dueAllDay: false };
    if (!allDay) return { dueAt: new Date(dueAt), dueAllDay: false };
    return { dueAt: endOfLocalDay(dueAt.slice(0, 10), owner.timezone), dueAllDay: true };
  }

  async function page(owner: Owner, query: ListTasksQuery, trashed: boolean): Promise<TaskPage> {
    const limit = query.limit ?? owner.pageSize ?? DEFAULT_PAGE_SIZE;
    const rows = await repo.list(owner.id, {
      trashed,
      limit,
      ...(query.status ? { status: query.status } : {}),
      ...(query.dueBefore ? { dueBefore: new Date(query.dueBefore) } : {}),
      ...(query.cursor ? { after: decodeCursor(query.cursor) } : {}),
    });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.id) : null };
  }

  return {
    async create(owner: Owner, body: CreateTaskBody): Promise<Task> {
      if (body.dueAllDay && !body.dueAt) throw new HttpError(400, 'Bad Request', 'dueAllDay: requires dueAt');
      const due = resolveDue(owner, body.dueAt ?? null, body.dueAllDay ?? false);
      return repo.create(owner.id, {
        title: body.title,
        notes: body.notes ?? null,
        status: body.status,
        completedAt: body.status === 'completed' ? now() : null,
        ...due,
      });
    },

    get: (owner: Owner, ref: string) => mustFind(owner, ref),

    async update(owner: Owner, ref: string, body: UpdateTaskBody): Promise<Task> {
      const current = await mustFind(owner, ref);
      if (current.deletedAt) throw new HttpError(409, 'Conflict', 'The task is in the trash; restore it first');

      const changes: TaskChanges = {};
      if (body.title !== undefined) changes.title = body.title;
      if (body.notes !== undefined) changes.notes = body.notes;

      if (body.status !== undefined && body.status !== current.status) {
        changes.status = body.status;
        changes.completedAt = body.status === 'completed' ? now() : null;
      }

      if (body.dueAt !== undefined || body.dueAllDay !== undefined) {
        const allDay = body.dueAt === null ? false : (body.dueAllDay ?? current.dueAllDay);
        let source: string | null;
        if (body.dueAt !== undefined) source = body.dueAt;
        else if (current.dueAt && allDay) source = localDate(new Date(current.dueAt), owner.timezone);
        else source = current.dueAt;
        if (allDay && source === null) throw new HttpError(400, 'Bad Request', 'dueAllDay: requires dueAt');
        const due = resolveDue(owner, source, allDay);
        changes.dueAt = due.dueAt;
        changes.dueAllDay = due.dueAllDay;
      }

      const updated = await repo.update(owner.id, current.id, changes);
      if (!updated) throw new HttpError(404, 'Not Found');
      return updated;
    },

    list: (owner: Owner, query: ListTasksQuery) => page(owner, query, false),
    listTrash: (owner: Owner, query: ListTasksQuery) => page(owner, query, true),

    async trash(owner: Owner, ref: string): Promise<void> {
      const current = await mustFind(owner, ref);
      if (current.deletedAt) return;
      await repo.setDeletedAt(owner.id, current.id, now());
    },

    async restore(owner: Owner, ref: string): Promise<Task> {
      const current = await mustFind(owner, ref);
      if (!current.deletedAt) throw new HttpError(409, 'Conflict', 'The task is not in the trash');
      const restored = await repo.setDeletedAt(owner.id, current.id, null);
      if (!restored) throw new HttpError(404, 'Not Found');
      return restored;
    },

    async purge(owner: Owner, ref: string): Promise<void> {
      const current = await mustFind(owner, ref);
      if (!current.deletedAt) throw new HttpError(409, 'Conflict', 'Only a task in the trash can be deleted permanently');
      if (!(await repo.purge(owner.id, current.id))) throw new HttpError(404, 'Not Found');
    },

    async emptyTrash(owner: Owner): Promise<{ deleted: number }> {
      return { deleted: await repo.emptyTrash(owner.id) };
    },
  };
}

export type TasksService = ReturnType<typeof createTasksService>;
