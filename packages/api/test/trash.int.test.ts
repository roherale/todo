import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { TASK_STATUSES, type Task, type TaskStatus } from '@todo/shared';
import { buildTestApp } from './helpers.js';

const ctx = buildTestApp();
afterAll(async () => {
  await ctx.database.pool.end();
});

const as = (owner: string) => ({ 'x-test-owner': owner });
const newOwner = () => randomUUID();
const app = () => request(ctx.app);

async function createTask(owner: string, body: object = { title: 'task' }): Promise<Task> {
  const res = await app().post('/api/v1/tasks').set(as(owner)).send(body);
  expect(res.status).toBe(201);
  return res.body as Task;
}
const trash = (owner: string, ref: string | number) => app().delete(`/api/v1/tasks/${ref}`).set(as(owner));
const purge = (owner: string, ref: string | number) => app().delete(`/api/v1/tasks/${ref}?permanent=true`).set(as(owner));
const restore = (owner: string, ref: string | number) => app().post(`/api/v1/tasks/${ref}/restore`).set(as(owner));
const get = (owner: string, ref: string | number) => app().get(`/api/v1/tasks/${ref}`).set(as(owner));

describe('trash', () => {
  it('UC-TRASH-01: DELETE sets deletedAt, returns 204 and hides the task from the list', async () => {
    const owner = newOwner();
    const task = await createTask(owner);
    expect((await trash(owner, task.id)).status).toBe(204);
    expect((await get(owner, task.id)).body.deletedAt).not.toBeNull();
    const list = await app().get('/api/v1/tasks').set(as(owner));
    expect(list.body.items).toEqual([]);
  });

  it('UC-TRASH-02: the trash lists only the caller\'s trashed tasks, paginated', async () => {
    const owner = newOwner();
    const other = newOwner();
    const kept = await createTask(owner, { title: 'kept' });
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const t = await createTask(owner, { title: `t${i}` });
      await trash(owner, t.id);
      ids.push(t.id);
    }
    const otherTask = await createTask(other);
    await trash(other, otherTask.id);

    const first = await app().get('/api/v1/trash?limit=10').set(as(owner));
    expect(first.body.items).toHaveLength(10);
    const second = await app().get(`/api/v1/trash?limit=10&cursor=${first.body.nextCursor}`).set(as(owner));
    const seen = [...first.body.items, ...second.body.items].map((t: Task) => t.id);
    expect(seen).toEqual([...ids].reverse());
    expect(second.body.nextCursor).toBeNull();
    expect(seen).not.toContain(kept.id);
    expect(seen).not.toContain(otherTask.id);
  });

  it('UC-TRASH-03: a permanent delete of a task not in the trash returns 409 and changes nothing', async () => {
    const owner = newOwner();
    const task = await createTask(owner);
    const res = await purge(owner, task.id);
    expect(res.status).toBe(409);
    expect((await get(owner, task.id)).body).toEqual(task);
  });

  it.each(TASK_STATUSES)('UC-TRASH-04: restoring from %s keeps exactly that status', async (status: TaskStatus) => {
    const owner = newOwner();
    const task = await createTask(owner, { title: 'x', status });
    await trash(owner, task.id);
    const res = await restore(owner, task.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(status);
    expect(res.body.deletedAt).toBeNull();
  });

  it('UC-TRASH-05: restoring a task that is not in the trash returns 409', async () => {
    const owner = newOwner();
    const task = await createTask(owner);
    expect((await restore(owner, task.id)).status).toBe(409);
  });

  it('UC-TRASH-06: PATCH on a trashed task returns 409 and changes nothing', async () => {
    const owner = newOwner();
    const task = await createTask(owner, { title: 'before' });
    await trash(owner, task.id);
    const before = (await get(owner, task.id)).body;
    const res = await app().patch(`/api/v1/tasks/${task.id}`).set(as(owner)).send({ title: 'after' });
    expect(res.status).toBe(409);
    expect((await get(owner, task.id)).body).toEqual(before);
  });

  it('UC-TRASH-07: purging a trashed task returns 204, removes it, and later requests return 404', async () => {
    const owner = newOwner();
    const task = await createTask(owner);
    await trash(owner, task.id);
    expect((await purge(owner, task.id)).status).toBe(204);
    expect((await get(owner, task.id)).status).toBe(404);
    expect((await restore(owner, task.id)).status).toBe(404);
    expect((await purge(owner, task.id)).status).toBe(404);
  });

  it('UC-TRASH-08: a purged number is not reused', async () => {
    const owner = newOwner();
    const first = await createTask(owner);
    const second = await createTask(owner);
    await trash(owner, second.id);
    await purge(owner, second.id);
    expect(first.number).toBe(1);
    expect((await createTask(owner)).number).toBe(3);
  });

  it('UC-TRASH-09: emptying the trash removes only the caller\'s trashed tasks and returns the count', async () => {
    const a = newOwner();
    const b = newOwner();
    const live = await createTask(a, { title: 'live' });
    for (let i = 0; i < 3; i++) await trash(a, (await createTask(a)).id);
    const bTrashed = await createTask(b);
    await trash(b, bTrashed.id);

    const res = await app().delete('/api/v1/trash').set(as(a));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3 });
    expect((await get(a, live.id)).body).toEqual(live);
    expect((await app().get('/api/v1/trash').set(as(a))).body.items).toEqual([]);
    expect((await get(b, bTrashed.id)).status).toBe(200);
  });

  it('UC-TRASH-10: emptying an empty trash succeeds with deleted 0', async () => {
    const res = await app().delete('/api/v1/trash').set(as(newOwner()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 0 });
  });

  it('UC-TRASH-03: a permanent flag that is not true or false returns 400 and changes nothing', async () => {
    const owner = newOwner();
    const task = await createTask(owner);
    const res = await app().delete(`/api/v1/tasks/${task.id}?permanent=maybe`).set(as(owner));
    expect(res.status).toBe(400);
    expect((await get(owner, task.id)).body).toEqual(task);
  });

  it('UC-TRASH-01: trashing a task that is already in the trash succeeds without changing it', async () => {
    const owner = newOwner();
    const task = await createTask(owner);
    await trash(owner, task.id);
    const before = (await get(owner, task.id)).body;
    expect((await trash(owner, task.id)).status).toBe(204);
    expect((await get(owner, task.id)).body).toEqual(before);
  });
});
