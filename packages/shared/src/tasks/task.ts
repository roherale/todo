import { z } from 'zod';

export const TASK_STATUSES = ['new', 'queued', 'in_progress', 'paused', 'completed'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** ISO-8601 with an offset or `Z`. A time with no timezone is rejected. */
export const DueAtSchema = z.iso.datetime({ offset: true });

const TitleSchema = z.string().trim().min(1).max(200);
const NotesSchema = z.string().max(10_000);

/** Unknown or read-only fields (id, ownerId, number, ...) are rejected by `.strict()`. */
export const CreateTaskBodySchema = z
  .object({
    title: TitleSchema,
    notes: NotesSchema.optional(),
    status: TaskStatusSchema.default('new'),
    dueAt: DueAtSchema.nullish(),
    dueAllDay: z.boolean().optional(),
  })
  .strict();
export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;

export const UpdateTaskBodySchema = z
  .object({
    title: TitleSchema,
    notes: NotesSchema.nullable(),
    status: TaskStatusSchema,
    dueAt: DueAtSchema.nullable(),
    dueAllDay: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;

export const ListTasksQuerySchema = z
  .object({
    status: TaskStatusSchema.optional(),
    dueBefore: DueAtSchema.optional(),
    limit: z.coerce
      .number()
      .refine((n): n is (typeof PAGE_SIZES)[number] => (PAGE_SIZES as readonly number[]).includes(n), {
        message: 'limit must be one of 10, 25, 50, 100',
      })
      .optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

export const TaskSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  ownerId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: TaskStatusSchema,
  dueAt: z.string().nullable(),
  dueAllDay: z.boolean(),
  deletedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

export interface TaskPage {
  items: Task[];
  nextCursor: string | null;
}
