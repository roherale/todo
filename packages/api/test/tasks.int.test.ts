import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { TASK_STATUSES, type Task, type TaskStatus } from '@todo/shared';
import { bearer, buildTestApp, createUser, setProfile } from './helpers.js';

const ctx = buildTestApp();
afterAll(async () => {
  await ctx.database.pool.end();
});

const as = (owner: string, extra: Record<string, string> = {}) => bearer(owner, extra);
const newOwner = (profile: { timezone?: string; pageSize?: number } = {}) => createUser(ctx.database, profile);

async function create(owner: string, body: object = { title: 'task' }, extra: Record<string, string> = {}) {
  return request(ctx.app).post('/api/v1/tasks').set(as(owner, extra)).send(body);
}
async function createTask(owner: string, body: object = { title: 'task' }, extra: Record<string, string> = {}): Promise<Task> {
  const res = await create(owner, body, extra);
  expect(res.status).toBe(201);
  return res.body as Task;
}
const patch = (owner: string, ref: string | number, body: object, extra: Record<string, string> = {}) =>
  request(ctx.app).patch(`/api/v1/tasks/${ref}`).set(as(owner, extra)).send(body);

describe('create', () => {
  it('UC-TASK-01: returns 201 with a UUIDv7 id, a number, and the caller as owner', async () => {
    const owner = await newOwner();
    const res = await create(owner, { title: 'Buy milk' });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(res.body.number).toBe(1);
    expect(res.body.ownerId).toBe(owner);
    expect(res.body.title).toBe('Buy milk');
  });

  it('UC-TASK-02: status defaults to new', async () => {
    const task = await createTask(await newOwner());
    expect(task.status).toBe('new');
  });

  it('UC-TASK-03: bad titles return 400', async () => {
    const owner = await newOwner();
    for (const title of [undefined, '', '   ', 'a'.repeat(201)]) {
      expect((await create(owner, { title })).status).toBe(400);
    }
    const trimmed = await createTask(owner, { title: '  padded  ' });
    expect(trimmed.title).toBe('padded');
  });

  it('UC-TASK-04: notes are optional, up to 10,000 characters', async () => {
    const owner = await newOwner();
    expect((await createTask(owner, { title: 'x', notes: 'n'.repeat(10_000) })).notes).toHaveLength(10_000);
    expect((await create(owner, { title: 'x', notes: 'n'.repeat(10_001) })).status).toBe(400);
    expect((await createTask(owner)).notes).toBeNull();
  });

  it('UC-TASK-05: numbers go 1, 2, 3 per user and each user has their own #1', async () => {
    const a = await newOwner();
    const b = await newOwner();
    const numbers = [(await createTask(a)).number, (await createTask(a)).number, (await createTask(a)).number];
    expect(numbers).toEqual([1, 2, 3]);
    expect((await createTask(b)).number).toBe(1);
  });

  it('UC-TASK-05: concurrent creates by one user get distinct consecutive numbers', async () => {
    const owner = await newOwner();
    const results = await Promise.all(Array.from({ length: 8 }, () => createTask(owner)));
    expect(results.map((t) => t.number).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('UC-TASK-06: read-only and unknown fields return 400', async () => {
    const owner = await newOwner();
    const fields = ['id', 'ownerId', 'number', 'deletedAt', 'completedAt', 'createdAt', 'updatedAt', 'bogus'];
    for (const field of fields) {
      const res = await create(owner, { title: 'x', [field]: field === 'number' ? 5 : 'v' });
      expect(res.status, field).toBe(400);
    }
  });
});

describe('overdue filter with status', () => {
  it('UC-TASK-16: with ?status= also given, the status filter alone decides, so completed tasks can be listed', async () => {
    const owner = await newOwner();
    const done = await createTask(owner, { title: 'done', dueAt: '2020-01-01T00:00:00Z', status: 'completed' });
    await createTask(owner, { title: 'open', dueAt: '2020-01-01T00:00:00Z' });
    await createTask(owner, { title: 'done later', dueAt: '2999-01-01T00:00:00Z', status: 'completed' });
    const res = await request(ctx.app)
      .get('/api/v1/tasks?status=completed&dueBefore=2021-01-01T00:00:00Z')
      .set(as(owner));
    expect(res.body.items.map((t: Task) => t.id)).toEqual([done.id]);
  });

  it('UC-TASK-16: ?status=queued&dueBefore=X returns only queued tasks due before X', async () => {
    const owner = await newOwner();
    const queued = await createTask(owner, { title: 'q', dueAt: '2020-01-01T00:00:00Z', status: 'queued' });
    await createTask(owner, { title: 'n', dueAt: '2020-01-01T00:00:00Z' });
    const res = await request(ctx.app).get('/api/v1/tasks?status=queued&dueBefore=2021-01-01T00:00:00Z').set(as(owner));
    expect(res.body.items.map((t: Task) => t.id)).toEqual([queued.id]);
  });
});

describe('all-day date source', () => {
  it('UC-TASK-18: D is the date written in the dueAt string, whatever its offset', async () => {
    const owner = await newOwner({ timezone: 'Asia/Tokyo' });
    const tz = {};
    const task = await createTask(owner, { title: 'x', dueAt: '2026-11-28T23:30:00-06:00', dueAllDay: true }, tz);
    expect(task.dueAt).toBe('2026-11-28T14:59:59.000Z');
  });

  it('UC-TASK-18: switching a timed task to all-day without a new dueAt uses its local date in the profile timezone', async () => {
    const owner = await newOwner({ timezone: 'Asia/Tokyo' });
    const tz = {};
    const task = await createTask(owner, { title: 'x', dueAt: '2026-11-28T20:00:00Z' }, tz);
    const res = await patch(owner, task.id, { dueAllDay: true }, tz);
    expect(res.body).toMatchObject({ dueAt: '2026-11-29T14:59:59.000Z', dueAllDay: true });
  });
});

describe('create edge cases', () => {
  it('UC-TASK-17: creating a task already completed sets completedAt, otherwise it stays empty', async () => {
    const owner = await newOwner();
    expect((await createTask(owner, { title: 'x', status: 'completed' })).completedAt).not.toBeNull();
    expect((await createTask(owner, { title: 'x', status: 'queued' })).completedAt).toBeNull();
  });

  it('UC-TASK-14: dueAllDay without a dueAt returns 400 on create', async () => {
    expect((await create((await newOwner()), { title: 'x', dueAllDay: true })).status).toBe(400);
  });
});

describe('read and update', () => {
  it('UC-TASK-07: GET finds a task by UUID or by number; unknown refs return 404', async () => {
    const owner = await newOwner();
    const task = await createTask(owner, { title: 'find me' });
    const byId = await request(ctx.app).get(`/api/v1/tasks/${task.id}`).set(as(owner));
    const byNumber = await request(ctx.app).get(`/api/v1/tasks/${task.number}`).set(as(owner));
    expect(byId.body).toEqual(task);
    expect(byNumber.body).toEqual(task);
    for (const ref of ['999', randomUUID(), 'not-a-ref']) {
      expect((await request(ctx.app).get(`/api/v1/tasks/${ref}`).set(as(owner))).status).toBe(404);
    }
  });

  it('UC-TASK-08: PATCH changes any combination of fields at once and updates updatedAt', async () => {
    const owner = await newOwner();
    const task = await createTask(owner, { title: 'before' });
    await new Promise((r) => setTimeout(r, 5));
    const res = await patch(owner, task.number, {
      title: 'after',
      notes: 'some notes',
      status: 'in_progress',
      dueAt: '2026-12-01T10:00:00Z',
      dueAllDay: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'after', notes: 'some notes', status: 'in_progress', dueAt: '2026-12-01T10:00:00.000Z' });
    expect(res.body.updatedAt > task.updatedAt).toBe(true);
  });

  it('UC-TASK-08: completing can come with other field changes in the same request', async () => {
    const owner = await newOwner();
    const task = await createTask(owner);
    const res = await patch(owner, task.id, { status: 'completed', title: 'done title', notes: 'wrapped up' });
    expect(res.body).toMatchObject({ status: 'completed', title: 'done title', notes: 'wrapped up' });
  });

  it('UC-TASK-17: completedAt is set on completing, cleared when leaving completed, and untouched otherwise', async () => {
    const owner = await newOwner();
    const task = await createTask(owner);
    const done = (await patch(owner, task.id, { status: 'completed' })).body as Task;
    expect(done.completedAt).not.toBeNull();
    const renamed = (await patch(owner, task.id, { title: 'renamed' })).body as Task;
    expect(renamed.completedAt).toBe(done.completedAt);
    const reopened = (await patch(owner, task.id, { status: 'paused' })).body as Task;
    expect(reopened.completedAt).toBeNull();
    expect(reopened.title).toBe('renamed');
  });

  it('UC-TASK-17: clients cannot set completedAt, and a PATCH leaves fields it did not include alone', async () => {
    const owner = await newOwner();
    const task = await createTask(owner, { title: 'keep', notes: 'keep notes', dueAt: '2026-12-01T10:00:00Z' });
    expect((await patch(owner, task.id, { completedAt: '2026-12-01T10:00:00Z' })).status).toBe(400);
    const res = (await patch(owner, task.id, { status: 'queued' })).body as Task;
    expect(res).toMatchObject({ title: 'keep', notes: 'keep notes', dueAt: task.dueAt, dueAllDay: false });
  });

  const pairs = TASK_STATUSES.flatMap((from) => TASK_STATUSES.filter((to) => to !== from).map((to) => [from, to] as const));
  it.each(pairs)('UC-TASK-09: status can change from %s to %s', async (from: TaskStatus, to: TaskStatus) => {
    const owner = await newOwner();
    const task = await createTask(owner, { title: 'x', status: from });
    const res = await patch(owner, task.id, { status: to });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(to);
  });

  it('UC-TASK-09: there are exactly 20 transitions, and an unknown status returns 400', async () => {
    expect(pairs).toHaveLength(20);
    const owner = await newOwner();
    const task = await createTask(owner);
    expect((await patch(owner, task.id, { status: 'done' })).status).toBe(400);
  });
});

describe('list', () => {
  it('UC-TASK-10: lists only non-trashed tasks, filtered by status and dueBefore', async () => {
    const owner = await newOwner();
    const queued = await createTask(owner, { title: 'q', status: 'queued', dueAt: '2026-01-01T00:00:00Z' });
    const later = await createTask(owner, { title: 'later', dueAt: '2027-01-01T00:00:00Z' });
    const gone = await createTask(owner, { title: 'gone' });
    await request(ctx.app).delete(`/api/v1/tasks/${gone.id}`).set(as(owner));

    const all = await request(ctx.app).get('/api/v1/tasks').set(as(owner));
    expect(all.body.items.map((t: Task) => t.id).sort()).toEqual([queued.id, later.id].sort());

    const byStatus = await request(ctx.app).get('/api/v1/tasks?status=queued').set(as(owner));
    expect(byStatus.body.items.map((t: Task) => t.id)).toEqual([queued.id]);

    const before = await request(ctx.app).get('/api/v1/tasks?dueBefore=2026-06-01T00:00:00Z').set(as(owner));
    expect(before.body.items.map((t: Task) => t.id)).toEqual([queued.id]);
  });

  it('UC-TASK-11: newest first', async () => {
    const owner = await newOwner();
    const first = await createTask(owner, { title: '1' });
    const second = await createTask(owner, { title: '2' });
    const third = await createTask(owner, { title: '3' });
    const res = await request(ctx.app).get('/api/v1/tasks').set(as(owner));
    expect(res.body.items.map((t: Task) => t.id)).toEqual([third.id, second.id, first.id]);
  });

  it('UC-TASK-12: an invalid limit returns 400', async () => {
    const owner = await newOwner();
    for (const limit of ['0', '5', '30', '101', 'x']) {
      expect((await request(ctx.app).get(`/api/v1/tasks?limit=${limit}`).set(as(owner))).status, limit).toBe(400);
    }
  });

  it('UC-TASK-12: limit defaults to the profile page size, or 10', async () => {
    const owner = await newOwner();
    for (let i = 0; i < 12; i++) await createTask(owner, { title: `t${i}` });
    const dflt = await request(ctx.app).get('/api/v1/tasks').set(as(owner));
    expect(dflt.body.items).toHaveLength(10);
    await setProfile(ctx.database, owner, { pageSize: 25 });
    const profile = await request(ctx.app).get('/api/v1/tasks').set(as(owner));
    expect(profile.body.items).toHaveLength(12);
    expect(profile.body.nextCursor).toBeNull();
  });

  it('UC-TASK-12: following nextCursor returns every task exactly once', async () => {
    const owner = await newOwner();
    const created: string[] = [];
    for (let i = 0; i < 27; i++) created.push((await createTask(owner, { title: `t${i}` })).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const url: string = `/api/v1/tasks?limit=10${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await request(ctx.app).get(url).set(as(owner));
      seen.push(...res.body.items.map((t: Task) => t.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual([...created].reverse());
  });

  it('UC-TASK-12: a malformed cursor returns 400', async () => {
    const res = await request(ctx.app).get('/api/v1/tasks?cursor=garbage').set(as(await newOwner()));
    expect(res.status).toBe(400);
  });
});

describe('due dates', () => {
  it('UC-TASK-13: a dueAt without an offset returns 400, with an offset it is stored', async () => {
    const owner = await newOwner();
    expect((await create(owner, { title: 'x', dueAt: '2026-11-28T15:00:00' })).status).toBe(400);
    const task = await createTask(owner, { title: 'x', dueAt: '2026-11-28T15:00:00-06:00' });
    expect(task.dueAt).toBe('2026-11-28T21:00:00.000Z');
  });

  it('UC-TASK-14: an all-day due is stored as 23:59:59 on that date in the profile timezone', async () => {
    const owner = await newOwner({ timezone: 'America/Mexico_City' });
    const task = await createTask(owner, { title: 'x', dueAt: '2026-11-28T00:00:00-06:00', dueAllDay: true });
    expect(task.dueAt).toBe('2026-11-29T05:59:59.000Z');
    expect(task.dueAllDay).toBe(true);
  });

  it('UC-TASK-14: turning on dueAllDay for an existing due time keeps its local date', async () => {
    const owner = await newOwner({ timezone: 'America/Mexico_City' });
    const tz = {};
    const task = await createTask(owner, { title: 'x', dueAt: '2026-11-28T15:00:00-06:00' }, tz);
    const res = await patch(owner, task.id, { dueAllDay: true }, tz);
    expect(res.body).toMatchObject({ dueAt: '2026-11-29T05:59:59.000Z', dueAllDay: true });
    expect((await patch(owner, (await createTask(owner)).id, { dueAllDay: true })).status).toBe(400);
  });

  it('UC-TASK-15: dueAt null clears the due date and dueAllDay', async () => {
    const owner = await newOwner();
    const task = await createTask(owner, { title: 'x', dueAt: '2026-11-28T00:00:00Z', dueAllDay: true });
    const res = await patch(owner, task.id, { dueAt: null });
    expect(res.body).toMatchObject({ dueAt: null, dueAllDay: false });
  });

  it('UC-TASK-16: overdue means dueAt in the past and not completed; dueBefore uses that comparison', async () => {
    const owner = await newOwner();
    const open = await createTask(owner, { title: 'open', dueAt: '2020-01-01T00:00:00Z' });
    await createTask(owner, { title: 'done', dueAt: '2020-01-01T00:00:00Z', status: 'completed' });
    await createTask(owner, { title: 'future', dueAt: '2999-01-01T00:00:00Z' });
    const res = await request(ctx.app).get(`/api/v1/tasks?dueBefore=${new Date().toISOString()}`).set(as(owner));
    expect(res.body.items.map((t: Task) => t.id)).toEqual([open.id]);
  });
});

describe('logging', () => {
  it('UC-OPS-03: a full create, update and trash flow logs no titles, notes or auth headers', async () => {
    const owner = await newOwner();
    const headers = { ...as(owner), authorization: 'Bearer flow-secret-token', cookie: '__Host-s=flow-cookie-secret' };
    const created = await request(ctx.app).post('/api/v1/tasks').set(headers).send({ title: 'flow-title-xyz', notes: 'flow-notes-xyz' });
    await request(ctx.app).patch(`/api/v1/tasks/${created.body.id}`).set(headers).send({ title: 'flow-title-2-xyz' });
    await request(ctx.app).delete(`/api/v1/tasks/${created.body.id}`).set(headers);
    const logs = ctx.logs.lines.join('');
    expect(logs).toContain('/api/v1/tasks');
    for (const secret of ['flow-title-xyz', 'flow-title-2-xyz', 'flow-notes-xyz', 'flow-secret-token', 'flow-cookie-secret', owner]) {
      expect(logs).not.toContain(secret);
    }
  });
});
