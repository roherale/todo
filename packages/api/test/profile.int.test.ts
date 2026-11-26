import http from 'node:http';
import https from 'node:https';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { sessions } from '../src/modules/sessions/index.js';
import { tasks } from '../src/modules/tasks/tasks.table.js';
import { users } from '../src/modules/users/index.js';
import {
  COOKIE_NAME,
  WEB_HEADERS,
  bearer,
  buildTestApp,
  createUser,
  createWebSession,
  emailOf,
  signer,
  testConfig,
  workosIdOf,
} from './helpers.js';

const ctx = buildTestApp(undefined, testConfig({ ALLOWED_SIGNUP_EMAILS: 'avatar-user@example.test' }));
afterAll(async () => {
  await ctx.database.pool.end();
});

const app = () => request(ctx.app);

function isLoopback(target: unknown): boolean {
  const host =
    typeof target === 'string' || target instanceof URL
      ? new URL(target).hostname
      : String((target as { hostname?: string; host?: string } | undefined)?.hostname ?? (target as { host?: string } | undefined)?.host ?? '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]' || host === '';
}
const web = (cookie: string) => ({ cookie: `${COOKIE_NAME}=${cookie}`, ...WEB_HEADERS });
const profileOf = async (id: string) => (await app().get('/api/v1/profile').set(bearer(id))).body;

async function webUser(profile: { timezone?: string; pageSize?: number } = {}) {
  const id = await createUser(ctx.database, profile);
  const cookie = await createWebSession(ctx.database, id);
  return { id, cookie };
}

describe('editing the profile', () => {
  it('UC-PROFILE-02: PATCH updates displayName, avatarUrl, timezone and pageSize, returns the profile, and changes updatedAt', async () => {
    const { id, cookie } = await webUser();
    const before = await profileOf(id);
    await new Promise((r) => setTimeout(r, 5));
    const res = await app()
      .patch('/api/v1/profile')
      .set(web(cookie))
      .send({ displayName: 'New Name', avatarUrl: 'https://example.com/me.png', timezone: 'Asia/Tokyo', pageSize: 50 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, displayName: 'New Name', avatarUrl: 'https://example.com/me.png', timezone: 'Asia/Tokyo', pageSize: 50 });
    expect(res.body).not.toHaveProperty('workosUserId');
    expect(res.body.updatedAt > before.updatedAt).toBe(true);
    expect(await profileOf(id)).toEqual(res.body);
  });

  it('UC-PROFILE-02: pageSize accepts 10, 25, 50 and 100 only, and defaults to 10', async () => {
    const { id, cookie } = await webUser();
    expect((await profileOf(id)).pageSize).toBe(10);
    for (const pageSize of [10, 25, 50, 100]) {
      expect((await app().patch('/api/v1/profile').set(web(cookie)).send({ pageSize })).status).toBe(200);
    }
    for (const pageSize of [0, 5, 11, 101, '10']) {
      expect((await app().patch('/api/v1/profile').set(web(cookie)).send({ pageSize })).status, String(pageSize)).toBe(400);
    }
    expect((await profileOf(id)).pageSize).toBe(100);
  });

  it('UC-PROFILE-02: the saved page size is the default limit for the task list', async () => {
    const { id, cookie } = await webUser();
    for (let i = 0; i < 12; i++) await app().post('/api/v1/tasks').set(bearer(id)).send({ title: `t${i}` });
    await app().patch('/api/v1/profile').set(web(cookie)).send({ pageSize: 25 });
    expect((await app().get('/api/v1/tasks').set(bearer(id))).body.items).toHaveLength(12);
  });

  it('UC-PROFILE-03: avatarUrl null removes the avatar', async () => {
    const { id, cookie } = await webUser();
    await app().patch('/api/v1/profile').set(web(cookie)).send({ avatarUrl: 'https://example.com/a.png' });
    const res = await app().patch('/api/v1/profile').set(web(cookie)).send({ avatarUrl: null });
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeNull();
    expect((await profileOf(id)).avatarUrl).toBeNull();
  });

  it('UC-PROFILE-04: email, id, workosUserId and unknown fields return 400 and change nothing', async () => {
    const { id, cookie } = await webUser();
    const before = await profileOf(id);
    for (const field of ['email', 'id', 'workosUserId', 'createdAt', 'bogus']) {
      const res = await app().patch('/api/v1/profile').set(web(cookie)).send({ displayName: 'Changed', [field]: 'x' });
      expect(res.status, field).toBe(400);
    }
    expect(await profileOf(id)).toEqual(before);
  });

  it('UC-PROFILE-05: avatarUrl must be an absolute https URL of at most 2048 characters', async () => {
    const { id, cookie } = await webUser();
    const bad = ['http://example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/a.png', 'a.png', `https://example.com/${'a'.repeat(2048)}`];
    for (const avatarUrl of bad) {
      expect((await app().patch('/api/v1/profile').set(web(cookie)).send({ avatarUrl })).status, avatarUrl).toBe(400);
    }
    expect((await profileOf(id)).avatarUrl).toBeNull();
    const ok = await app().patch('/api/v1/profile').set(web(cookie)).send({ avatarUrl: `https://e.com/${'a'.repeat(2033)}` });
    expect(ok.status).toBe(200);
  });

  it('UC-PROFILE-06: the server makes no outbound HTTP request to avatarUrl on sign-up, PATCH or GET', async () => {
    const spies = [
      vi.spyOn(globalThis, 'fetch'),
      vi.spyOn(http, 'request'),
      vi.spyOn(http, 'get'),
      vi.spyOn(https, 'request'),
      vi.spyOn(https, 'get'),
    ];
    try {
      const sub = `test|avatar-${Date.now()}`;
      const token = signer.signToken({ sub, email: 'avatar-user@example.test' });
      const avatarUrl = 'https://avatar.invalid/pic.png';
      const signup = await app()
        .post('/api/v1/profile')
        .set('authorization', `Bearer ${token}`)
        .send({ displayName: 'Avatar', timezone: 'UTC', avatarUrl });
      expect(signup.status).toBe(201);
      expect(signup.body.avatarUrl).toBe(avatarUrl);
      const cookie = await createWebSession(ctx.database, signup.body.id);
      const patch = await app().patch('/api/v1/profile').set(web(cookie)).send({ avatarUrl: 'https://avatar.invalid/other.png' });
      expect(patch.status).toBe(200);
      expect((await app().get('/api/v1/profile').set('authorization', `Bearer ${token}`)).status).toBe(200);
      // The test client itself talks to the app over loopback; anything else is an outbound request.
      for (const spy of spies) expect((spy.mock.calls as unknown[][]).filter((args) => !isLoopback(args[0]))).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('UC-PROFILE-07: after a timezone change every all-day task keeps its calendar date at 23:59:59 in the new zone', async () => {
    const { id, cookie } = await webUser({ timezone: 'America/Mexico_City' });
    const make = async (body: object) => (await app().post('/api/v1/tasks').set(bearer(id)).send(body)).body;
    const allDay = await make({ title: 'all day', dueAt: '2026-11-28T00:00:00-06:00', dueAllDay: true });
    const trashed = await make({ title: 'trashed all day', dueAt: '2026-12-25T00:00:00-06:00', dueAllDay: true });
    await app().delete(`/api/v1/tasks/${trashed.id}`).set(bearer(id));
    const timed = await make({ title: 'timed', dueAt: '2026-11-28T15:00:00Z' });
    expect(allDay.dueAt).toBe('2026-11-29T05:59:59.000Z');

    const res = await app().patch('/api/v1/profile').set(web(cookie)).send({ timezone: 'Asia/Tokyo' });
    expect(res.status).toBe(200);
    const get = async (taskId: string) => (await app().get(`/api/v1/tasks/${taskId}`).set(bearer(id))).body;
    expect((await get(allDay.id)).dueAt).toBe('2026-11-28T14:59:59.000Z');
    expect((await get(trashed.id)).dueAt).toBe('2026-12-25T14:59:59.000Z');
    expect((await get(timed.id)).dueAt).toBe('2026-11-28T15:00:00.000Z');
    expect((await get(allDay.id)).dueAllDay).toBe(true);

    await app().patch('/api/v1/profile').set(web(cookie)).send({ timezone: 'America/Los_Angeles' });
    expect((await get(allDay.id)).dueAt).toBe('2026-11-29T07:59:59.000Z');
  });

  it('UC-PROFILE-07: changing other fields, or setting the same timezone, leaves due dates alone', async () => {
    const { id, cookie } = await webUser({ timezone: 'UTC' });
    const task = (await app().post('/api/v1/tasks').set(bearer(id)).send({ title: 'x', dueAt: '2026-11-28T00:00:00Z', dueAllDay: true })).body;
    await app().patch('/api/v1/profile').set(web(cookie)).send({ displayName: 'Other', timezone: 'UTC' });
    expect((await app().get(`/api/v1/tasks/${task.id}`).set(bearer(id))).body.dueAt).toBe('2026-11-28T23:59:59.000Z');
  });
});

describe('web-only', () => {
  it('UC-PROFILE-12: PATCH and DELETE with a Bearer token return 403 and change nothing', async () => {
    const id = await createUser(ctx.database);
    const before = await profileOf(id);
    const patch = await app().patch('/api/v1/profile').set(bearer(id)).send({ displayName: 'Hacked' });
    const del = await app().delete('/api/v1/profile').set(bearer(id)).send({ confirmEmail: emailOf(id) });
    expect([patch.status, del.status]).toEqual([403, 403]);
    expect(await profileOf(id)).toEqual(before);
    expect(await ctx.database.db.select().from(users).where(eq(users.id, id))).toHaveLength(1);
  });

  it('UC-PROFILE-12: a cookie request without the CSRF header is also refused', async () => {
    const { id, cookie } = await webUser();
    const res = await app().patch('/api/v1/profile').set({ cookie: `${COOKIE_NAME}=${cookie}` }).send({ displayName: 'x' });
    expect(res.status).toBe(403);
    expect((await profileOf(id)).displayName).toBe('Test User');
  });
});

describe('deleting the account', () => {
  async function withData(id: string) {
    const make = async (title: string) => (await app().post('/api/v1/tasks').set(bearer(id)).send({ title })).body;
    const live = await make('live');
    const trashed = await make('trashed');
    await app().delete(`/api/v1/tasks/${trashed.id}`).set(bearer(id));
    return { live, trashed };
  }
  const count = async (id: string) => ({
    users: (await ctx.database.db.select().from(users).where(eq(users.id, id))).length,
    tasks: (await ctx.database.db.select().from(tasks).where(eq(tasks.ownerId, id))).length,
    sessions: (await ctx.database.db.select().from(sessions).where(eq(sessions.userId, id))).length,
  });

  it('UC-PROFILE-08: DELETE with the right confirmEmail returns 204 and removes the user and all their tasks, trash included', async () => {
    const { id, cookie } = await webUser();
    await withData(id);
    expect((await count(id)).tasks).toBe(2);
    const res = await app().delete('/api/v1/profile').set(web(cookie)).send({ confirmEmail: emailOf(id) });
    expect(res.status).toBe(204);
    expect(await count(id)).toEqual({ users: 0, tasks: 0, sessions: 0 });
  });

  it('UC-PROFILE-08: confirmEmail matches ignoring case and surrounding spaces', async () => {
    const { id, cookie } = await webUser();
    const res = await app().delete('/api/v1/profile').set(web(cookie)).send({ confirmEmail: `  ${emailOf(id).toUpperCase()} ` });
    expect(res.status).toBe(204);
  });

  it('UC-PROFILE-09: a missing or non-matching confirmEmail returns 400 and deletes nothing', async () => {
    const { id, cookie } = await webUser();
    await withData(id);
    const before = await count(id);
    for (const body of [{}, { confirmEmail: '' }, { confirmEmail: 'someone@else.test' }, { confirmEmail: emailOf(id), extra: 1 }, { confirmEmail: 5 }]) {
      const res = await app().delete('/api/v1/profile').set(web(cookie)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await count(id)).toEqual(before);
  });

  it('UC-PROFILE-10: deleting user A leaves every row of user B unchanged', async () => {
    const a = await webUser();
    const b = await webUser();
    await withData(a.id);
    await withData(b.id);
    const rowsOf = async (id: string) => ({
      user: await ctx.database.db.select().from(users).where(eq(users.id, id)),
      tasks: await ctx.database.db.select().from(tasks).where(eq(tasks.ownerId, id)),
      sessions: await ctx.database.db.select().from(sessions).where(eq(sessions.userId, id)),
    });
    const beforeB = await rowsOf(b.id);
    await app().delete('/api/v1/profile').set(web(a.cookie)).send({ confirmEmail: emailOf(a.id) });
    expect(await rowsOf(b.id)).toEqual(beforeB);
    expect((await count(a.id)).users).toBe(0);
  });

  it('UC-PROFILE-11: after deletion, the old token gets signup-required', async () => {
    const { id, cookie } = await webUser();
    await app().delete('/api/v1/profile').set(web(cookie)).send({ confirmEmail: emailOf(id) });
    const token = signer.signToken({ sub: workosIdOf(id), email: emailOf(id) });
    const res = await app().get('/api/v1/tasks').set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.type).toMatch(/signup-required$/);
  });

  it('UC-SESSION-21: deleting an account deletes all of that user\'s session rows', async () => {
    const { id, cookie } = await webUser();
    await createWebSession(ctx.database, id);
    await app().get('/api/v1/tasks').set(bearer(id));
    expect((await count(id)).sessions).toBeGreaterThanOrEqual(3);
    await app().delete('/api/v1/profile').set(web(cookie)).send({ confirmEmail: emailOf(id) });
    expect((await count(id)).sessions).toBe(0);
  });
});
