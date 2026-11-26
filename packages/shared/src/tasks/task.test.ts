import { describe, expect, it } from 'vitest';
import { CreateTaskBodySchema, ListTasksQuerySchema, UpdateTaskBodySchema } from './task.js';

describe('task schemas', () => {
  it('UC-TASK-02: status defaults to new', () => {
    expect(CreateTaskBodySchema.parse({ title: 'x' }).status).toBe('new');
  });

  it('UC-TASK-03: trims the title and rejects empty, blank and over-long titles', () => {
    expect(CreateTaskBodySchema.parse({ title: '  hi  ' }).title).toBe('hi');
    for (const title of ['', '   ', 'a'.repeat(201)]) {
      expect(CreateTaskBodySchema.safeParse({ title }).success).toBe(false);
    }
    expect(CreateTaskBodySchema.safeParse({}).success).toBe(false);
    expect(CreateTaskBodySchema.safeParse({ title: 'a'.repeat(200) }).success).toBe(true);
  });

  it('UC-TASK-04: notes are optional and capped at 10,000 characters', () => {
    expect(CreateTaskBodySchema.safeParse({ title: 'x' }).success).toBe(true);
    expect(CreateTaskBodySchema.safeParse({ title: 'x', notes: 'n'.repeat(10_000) }).success).toBe(true);
    expect(CreateTaskBodySchema.safeParse({ title: 'x', notes: 'n'.repeat(10_001) }).success).toBe(false);
  });

  it('UC-TASK-06: read-only and unknown fields are rejected on create and update', () => {
    for (const field of ['id', 'ownerId', 'number', 'deletedAt', 'completedAt', 'createdAt', 'updatedAt', 'bogus']) {
      expect(CreateTaskBodySchema.safeParse({ title: 'x', [field]: 'v' }).success).toBe(false);
      expect(UpdateTaskBodySchema.safeParse({ [field]: 'v' }).success).toBe(false);
    }
  });

  it('UC-TASK-13: dueAt needs an offset or Z', () => {
    expect(CreateTaskBodySchema.safeParse({ title: 'x', dueAt: '2026-11-28T15:00:00' }).success).toBe(false);
    expect(CreateTaskBodySchema.safeParse({ title: 'x', dueAt: '2026-11-28T15:00:00Z' }).success).toBe(true);
    expect(CreateTaskBodySchema.safeParse({ title: 'x', dueAt: '2026-11-28T15:00:00-06:00' }).success).toBe(true);
  });

  it('UC-TASK-09: an unknown status is rejected', () => {
    expect(UpdateTaskBodySchema.safeParse({ status: 'done' }).success).toBe(false);
  });

  it('UC-TASK-12: limit must be 10, 25, 50 or 100', () => {
    for (const limit of ['10', '25', '50', '100']) {
      expect(ListTasksQuerySchema.safeParse({ limit }).success).toBe(true);
    }
    for (const limit of ['0', '5', '11', '101', 'abc']) {
      expect(ListTasksQuerySchema.safeParse({ limit }).success).toBe(false);
    }
  });
});
