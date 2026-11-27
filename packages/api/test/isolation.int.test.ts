import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Task } from '@todo/shared';
import { bearer, buildTestApp, createUser } from './helpers.js';

const ctx = buildTestApp();
afterAll(async () => {
  await ctx.database.pool.end();
});

let A: string;
let B: string;
const as = (owner: string) => bearer(owner);
const app = () => request(ctx.app);

let aFirst: Task;
let aLive: Task;
let aTrashed: Task;
let bLive: Task;

async function createTask(owner: string, title: string): Promise<Task> {
  return (await app().post('/api/v1/tasks').set(as(owner)).send({ title })).body as Task;
}

beforeAll(async () => {
  A = await createUser(ctx.database);
  B = await createUser(ctx.database);
  // A's #1 is created first, so A's other tasks have numbers B does not use.
  aFirst = await createTask(A, 'a-first');
  aLive = await createTask(A, 'a-live');
  aTrashed = await createTask(A, 'a-trashed');
  await app().delete(`/api/v1/tasks/${aTrashed.id}`).set(as(A));
  aTrashed = (await app().get(`/api/v1/tasks/${aTrashed.id}`).set(as(A))).body as Task;
  bLive = await createTask(B, 'b-live');
});

const refsOf = (t: Task): (string | number)[] => [t.id, t.number];

describe('cross-user access', () => {
  it('UC-ISO-01: B gets 404 for GET, PATCH, trash, restore and purge on A\'s tasks, by UUID or number, and A\'s task is unchanged', async () => {
    // B owns number 1 only, so A's numbers 2 and 3 can only be B misses.
    for (const target of [aLive, aTrashed]) {
      for (const ref of refsOf(target)) {
        const attempts = [
          app().get(`/api/v1/tasks/${ref}`).set(as(B)),
          app().patch(`/api/v1/tasks/${ref}`).set(as(B)).send({ title: 'hacked' }),
          app().delete(`/api/v1/tasks/${ref}`).set(as(B)),
          app().post(`/api/v1/tasks/${ref}/restore`).set(as(B)),
          app().delete(`/api/v1/tasks/${ref}?permanent=true`).set(as(B)),
        ];
        for (const res of await Promise.all(attempts)) expect(res.status, `${ref}`).toBe(404);
      }
    }
    expect((await app().get(`/api/v1/tasks/${aLive.id}`).set(as(A))).body).toEqual(aLive);
    expect((await app().get(`/api/v1/tasks/${aTrashed.id}`).set(as(A))).body).toEqual(aTrashed);
  });

  it('UC-ISO-02: B\'s lists never include A\'s tasks, whatever the filters, limits or cursors', async () => {
    const aIds = new Set([aLive.id, aTrashed.id]);
    const urls = [
      '/api/v1/tasks',
      '/api/v1/tasks?status=new',
      '/api/v1/tasks?limit=100',
      '/api/v1/tasks?dueBefore=2999-01-01T00:00:00Z',
      '/api/v1/trash',
      '/api/v1/trash?limit=10&status=new',
    ];
    for (const url of urls) {
      const res = await app().get(url).set(as(B));
      expect(res.status, url).toBe(200);
      for (const t of res.body.items as Task[]) expect(aIds.has(t.id), url).toBe(false);
    }
  });

  it('UC-ISO-03: B emptying the trash does not remove A\'s trashed tasks', async () => {
    const res = await app().delete('/api/v1/trash').set(as(B));
    expect(res.body).toEqual({ deleted: 0 });
    expect((await app().get(`/api/v1/tasks/${aTrashed.id}`).set(as(A))).status).toBe(200);
  });

  it('UC-ISO-04: number 1 as B finds B\'s own #1, never A\'s', async () => {
    const res = await app().get('/api/v1/tasks/1').set(as(B));
    expect(res.body.id).toBe(bLive.id);
    expect(res.body.ownerId).toBe(B);
    expect(aFirst.number).toBe(1);
    expect(aFirst.id).not.toBe(bLive.id);
  });

  it('UC-ISO-05: a cursor from A\'s list, used by B, returns none of A\'s tasks', async () => {
    for (let i = 0; i < 12; i++) await createTask(A, `a-extra-${i}`);
    const page = await app().get('/api/v1/tasks?limit=10').set(as(A));
    const cursor = page.body.nextCursor as string;
    expect(cursor).toBeTruthy();
    const res = await app().get(`/api/v1/tasks?cursor=${cursor}`).set(as(B));
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      for (const t of res.body.items as Task[]) expect(t.ownerId).toBe(B);
    }
  });

  it('UC-ISO-07: a PATCH or POST can never set ownerId; the owner is always the caller', async () => {
    const post = await app().post('/api/v1/tasks').set(as(B)).send({ title: 'x', ownerId: A });
    expect(post.status).toBe(400);
    const patch = await app().patch(`/api/v1/tasks/${bLive.id}`).set(as(B)).send({ ownerId: A });
    expect(patch.status).toBe(400);
    const created = await createTask(B, 'owned by B');
    expect(created.ownerId).toBe(B);
  });
});
