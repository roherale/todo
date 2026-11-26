import { and, desc, eq, isNotNull, isNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Task, TaskStatus } from '@todo/shared';
import type { Executor } from '../../common/db.js';
import { uuidv7 } from '../../common/uuid7.js';
import { taskCounters, tasks } from './tasks.table.js';

export type TaskRef = { kind: 'id'; id: string } | { kind: 'number'; number: number };

export interface NewTask {
  title: string;
  notes: string | null;
  status: TaskStatus;
  dueAt: Date | null;
  dueAllDay: boolean;
  completedAt: Date | null;
}

export interface TaskChanges {
  title?: string;
  notes?: string | null;
  status?: TaskStatus;
  dueAt?: Date | null;
  dueAllDay?: boolean;
  completedAt?: Date | null;
}

export interface ListFilter {
  trashed: boolean;
  status?: TaskStatus;
  dueBefore?: Date;
  limit: number;
  /** Id of the last task of the previous page. */
  after?: string;
}

type Row = typeof tasks.$inferSelect;

function toTask(row: Row): Task {
  return {
    id: row.id,
    number: row.number,
    ownerId: row.ownerId,
    title: row.title,
    notes: row.notes,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    dueAllDay: row.dueAllDay,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function refCondition(ref: TaskRef): SQL {
  return ref.kind === 'id' ? eq(tasks.id, ref.id) : eq(tasks.number, ref.number);
}

/** Every method takes `ownerId` and puts it in the WHERE clause. */
export function createTasksRepository(db: NodePgDatabase) {
  return {
    async create(ownerId: string, data: NewTask): Promise<Task> {
      return db.transaction(async (tx) => {
        const [counter] = await tx
          .insert(taskCounters)
          .values({ ownerId, lastNumber: 1 })
          .onConflictDoUpdate({ target: taskCounters.ownerId, set: { lastNumber: sql`${taskCounters.lastNumber} + 1` } })
          .returning({ lastNumber: taskCounters.lastNumber });
        const [row] = await tx
          .insert(tasks)
          .values({ id: uuidv7(), ownerId, number: counter!.lastNumber, ...data })
          .returning();
        return toTask(row!);
      });
    },

    async find(ownerId: string, ref: TaskRef): Promise<Task | undefined> {
      const [row] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.ownerId, ownerId), refCondition(ref)));
      return row ? toTask(row) : undefined;
    },

    async update(ownerId: string, id: string, changes: TaskChanges): Promise<Task | undefined> {
      const [row] = await db
        .update(tasks)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
        .returning();
      return row ? toTask(row) : undefined;
    },

    async setDeletedAt(ownerId: string, id: string, deletedAt: Date | null): Promise<Task | undefined> {
      const [row] = await db
        .update(tasks)
        .set({ deletedAt, updatedAt: new Date() })
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
        .returning();
      return row ? toTask(row) : undefined;
    },

    async purge(ownerId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(tasks)
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id), isNotNull(tasks.deletedAt)))
        .returning({ id: tasks.id });
      return rows.length > 0;
    },

    async emptyTrash(ownerId: string): Promise<number> {
      const rows = await db
        .delete(tasks)
        .where(and(eq(tasks.ownerId, ownerId), isNotNull(tasks.deletedAt)))
        .returning({ id: tasks.id });
      return rows.length;
    },

    /** Every all-day task of one owner, trashed or not, with its stored due instant. */
    async allDayDue(ownerId: string, executor: Executor = db): Promise<{ id: string; dueAt: Date }[]> {
      const rows = await executor
        .select({ id: tasks.id, dueAt: tasks.dueAt })
        .from(tasks)
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.dueAllDay, true), isNotNull(tasks.dueAt)));
      return rows.flatMap((r) => (r.dueAt ? [{ id: r.id, dueAt: r.dueAt }] : []));
    },

    async setDueAt(ownerId: string, id: string, dueAt: Date, executor: Executor = db): Promise<void> {
      await executor
        .update(tasks)
        .set({ dueAt, updatedAt: new Date() })
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)));
    },

    /** Returns up to `limit + 1` rows so the caller can tell whether another page exists. */
    async list(ownerId: string, f: ListFilter): Promise<Task[]> {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.ownerId, ownerId),
            f.trashed ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt),
            f.status ? eq(tasks.status, f.status) : undefined,
            f.dueBefore
              ? and(lt(tasks.dueAt, f.dueBefore), f.status ? undefined : ne(tasks.status, 'completed'))
              : undefined,
            f.after ? lt(tasks.id, f.after) : undefined,
          ),
        )
        .orderBy(desc(tasks.id))
        .limit(f.limit + 1);
      return rows.map(toTask);
    },
  };
}

export type TasksRepository = ReturnType<typeof createTasksRepository>;
