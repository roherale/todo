import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '../src/modules/users/index.js';
import { buildTestApp, createUser, signer, testConfig, workosIdOf, bearer } from './helpers.js';

const ctx = buildTestApp(undefined, testConfig({ ALLOWED_SIGNUP_EMAILS: 'allowed@example.test, Test-A@Example.com' }));
afterAll(async () => {
  await ctx.database.pool.end();
});

let counter = 0;
const newSub = () => `test|signup-${Date.now()}-${counter++}`;
const headersFor = (sub: string, email?: string) => ({
  authorization: `Bearer ${signer.signToken({ sub, ...(email === undefined ? { email: undefined } : { email }) })}`,
});
const body = { displayName: 'Ana', timezone: 'America/Mexico_City' };
const signup = (sub: string, email: string | undefined, payload: object = body) =>
  request(ctx.app).post('/api/v1/profile').set(headersFor(sub, email)).send(payload);
const rowsFor = (sub: string) => ctx.database.db.select().from(users).where(eq(users.workosUserId, sub));

describe('sign-up', () => {
  it('UC-SIGNUP-01: creates one users row with the email from the token, never from the body', async () => {
    const sub = newSub();
    const res = await signup(sub, 'allowed@example.test', { ...body, avatarUrl: 'https://example.com/a.png' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'allowed@example.test', displayName: 'Ana', timezone: 'America/Mexico_City', avatarUrl: 'https://example.com/a.png', pageSize: 10 });
    expect(res.body).not.toHaveProperty('workosUserId');
    const rows = await rowsFor(sub);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('allowed@example.test');
    expect(res.body.id).toBe(rows[0]?.id);

    const sub2 = newSub();
    const sneaky = await signup(sub2, 'allowed@example.test', { ...body, email: 'other@example.test' });
    expect(sneaky.status).toBe(400);
    expect(await rowsFor(sub2)).toHaveLength(0);
  });

  it('UC-SIGNUP-02: an email outside the allowlist gets 403 signup-closed and no row', async () => {
    const sub = newSub();
    const res = await signup(sub, 'stranger@example.test');
    expect(res.status).toBe(403);
    expect(res.body.type).toMatch(/signup-closed$/);
    expect(await rowsFor(sub)).toHaveLength(0);
  });

  it('UC-SIGNUP-02: a token with no email also gets signup-closed', async () => {
    const sub = newSub();
    const res = await signup(sub, undefined);
    expect(res.status).toBe(403);
    expect(res.body.type).toMatch(/signup-closed$/);
    expect(await rowsFor(sub)).toHaveLength(0);
  });

  it('UC-SIGNUP-03: the allowlist check ignores case in both directions', async () => {
    const sub = newSub();
    const res = await signup(sub, 'test-a@example.com');
    expect(res.status).toBe(201);
    const sub2 = newSub();
    expect((await signup(sub2, 'ALLOWED@EXAMPLE.TEST')).status).toBe(201);
  });

  it('UC-SIGNUP-04: an invalid timezone, empty displayName or bad avatarUrl returns 400 and no row', async () => {
    const bad = [
      { ...body, timezone: 'Mars/Olympus' },
      { ...body, displayName: '' },
      { ...body, displayName: '   ' },
      { ...body, avatarUrl: 'http://example.com/a.png' },
      { ...body, avatarUrl: 'javascript:alert(1)' },
      { displayName: 'Ana' },
    ];
    for (const payload of bad) {
      const sub = newSub();
      const res = await signup(sub, 'allowed@example.test', payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
      expect(await rowsFor(sub)).toHaveLength(0);
    }
  });

  it('UC-SIGNUP-05: signing up twice returns 409 and leaves the existing row unchanged', async () => {
    const sub = newSub();
    expect((await signup(sub, 'allowed@example.test')).status).toBe(201);
    const before = await rowsFor(sub);
    const res = await signup(sub, 'allowed@example.test', { displayName: 'Someone Else', timezone: 'Asia/Tokyo' });
    expect(res.status).toBe(409);
    expect(await rowsFor(sub)).toEqual(before);
  });

  it('UC-SIGNUP-06: after sign-up the same token works on every route', async () => {
    const sub = newSub();
    const token = signer.signToken({ sub, email: 'allowed@example.test' });
    const auth = { authorization: `Bearer ${token}` };
    expect((await request(ctx.app).get('/api/v1/tasks').set(auth)).status).toBe(403);
    expect((await request(ctx.app).post('/api/v1/profile').set(auth).send(body)).status).toBe(201);
    for (const path of ['/api/v1/tasks', '/api/v1/trash', '/api/v1/profile']) {
      expect((await request(ctx.app).get(path).set(auth)).status, path).toBe(200);
    }
    const created = await request(ctx.app).post('/api/v1/tasks').set(auth).send({ title: 'first task' });
    expect(created.status).toBe(201);
  });
});

describe('profile', () => {
  it('UC-PROFILE-01: GET returns the caller\'s profile fields and never workosUserId', async () => {
    const id = await createUser(ctx.database, { timezone: 'Asia/Tokyo', pageSize: 50 });
    const res = await request(ctx.app).get('/api/v1/profile').set(bearer(id));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['avatarUrl', 'createdAt', 'displayName', 'email', 'id', 'pageSize', 'timezone', 'updatedAt'],
    );
    expect(res.body).toMatchObject({ id, timezone: 'Asia/Tokyo', pageSize: 50, avatarUrl: null });
    expect(JSON.stringify(res.body)).not.toContain(workosIdOf(id));
  });
});
