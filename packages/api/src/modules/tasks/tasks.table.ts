import { boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { TASK_STATUSES } from '@todo/shared';
import { users } from '../users/index.js';

export const taskStatus = pgEnum('task_status', TASK_STATUSES);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    status: taskStatus('status').notNull().default('new'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    dueAllDay: boolean('due_all_day').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('tasks_owner_number_unique').on(t.ownerId, t.number), index('tasks_owner_id_idx').on(t.ownerId, t.id)],
);

/** Last number handed out to each owner. Separate from `tasks` so a purge never frees a number. */
export const taskCounters = pgTable('task_counters', {
  ownerId: uuid('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  lastNumber: integer('last_number').notNull(),
});
