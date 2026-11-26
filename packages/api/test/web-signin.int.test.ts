import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { PENDING_COOKIE, SESSION_COOKIE, type IdentityProvider } from '../src/modules/auth/index.js';
import { decryptForUser, encryptForUser, sessions, sha256 } from '../src/modules/sessions/index.js';
import { users } from '../src/modules/users/index.js';
import {
  WEB_HEADERS,
  buildTestApp,
  createClock,
  createUser,
  createWebSession,
  emailOf,
  signer,
  testConfig,
  workosIdOf,
} from './helpers.js';

const MIN = 60_000;
const KEY = Buffer.alloc(32, 5);
const config = testConfig({
  SESSION_ENCRYPTION_KEY: KEY.toString('base64'),
  WORKOS_CLIENT_ID: 'web-client',
  CLI_CLIENT_ID: 'cli-client',
  ALLOWED_SIGNUP_EMAILS: 'new-person@example.test',
});

/** A stand-in for the external identity provider: the one boundary this API does not own. */
function fakeProvider(identities: Record<string, { sub: string; email: string }>) {
  const calls = { refresh: [] as string[], exchange: [] as string[] };
  const provider: IdentityProvider = {
    authorizationUrl: (state) => `https://auth.example.test/authorize?state=${state}`,
    exchangeCode(code) {
      calls.exchange.push(code);
      const identity = identities[code];
      if (!identity) return Promise.reject(new Error('bad code'));
      return Promise.resolve({ ...identity, refreshToken: `refresh-for-${code}` });
    },
    refresh(token) {
      calls.refresh.push(token);
      return Promise.resolve(`${token}+`);
    },
    logoutUrl: (token) => Promise.resolve(`https://auth.example.test/logout?for=${token.length}`),
  };
  return { provider, calls };
}

const pools: { end: () => Promise<void> }[] = [];
afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
});

function setup(identities: Record<string, { sub: string; email: string }> = {}) {
  const clock = createClock(new Date('2026-12-01T10:00:00Z'));
  const { provider, calls } = fakeProvider(identities);
  const ctx = buildTestApp(undefined, config, { clock, provider });
  pools.push(ctx.database.pool);
  return { clock, calls, ...ctx };
}

const cookiesOf = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
const cookieNamed = (res: request.Response, name: string) => cookiesOf(res).find((c) => c.startsWith(`${name}=`));
const valueOf = (setCookie: string) => setCookie.split(';')[0]!.split('=').slice(1).join('=');

async function login(s: ReturnType<typeof setup>) {
  const res = await request(s.app).get('/auth/login');
  const stateCookie = cookieNamed(res, '__Host-oauth-state')!;
  const state = new URL(res.headers['location'] as string).searchParams.get('state')!;
  return { res, stateCookie: valueOf(stateCookie), state };
}

async function callback(s: ReturnType<typeof setup>, code: string, extraCookies = '') {
  const { stateCookie, state } = await login(s);
  return request(s.app)
    .get(`/auth/callback?code=${code}&state=${state}`)
    .set('cookie', `__Host-oauth-state=${stateCookie}${extraCookies}`);
}

describe('web sign-in', () => {
  it('UC-AUTH-09: /auth/login redirects to the identity provider with a state that is also set in a cookie', async () => {
    const s = setup();
    const { res, stateCookie, state } = await login(s);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^https:\/\/auth\.example\.test\/authorize\?state=/);
    expect(stateCookie).toBe(state);
    const attrs = cookieNamed(res, '__Host-oauth-state')!;
    expect(attrs).toMatch(/HttpOnly/);
    expect(attrs).toMatch(/Secure/);
  });

  it('UC-AUTH-09: the callback sets a __Host- session cookie with the required attributes, and no token reaches the browser', async () => {
    const userId = await createUser((await Promise.resolve(setup())).database);
    const s = setup({ code1: { sub: workosIdOf(userId), email: emailOf(userId) } });
    const res = await callback(s, 'code1');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/');
    const session = cookieNamed(res, SESSION_COOKIE)!;
    expect(session).toMatch(/; Path=\//);
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/Secure/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).not.toMatch(/Domain=/);
    const dump = JSON.stringify(res.body) + res.text + JSON.stringify(res.headers['location']);
    expect(dump).not.toContain('refresh-for-code1');
    for (const c of cookiesOf(res)) expect(c).not.toContain('refresh-for-code1');

    // The cookie works, and the refresh token is stored encrypted.
    const me = await request(s.app).get('/api/v1/profile').set('cookie', `${SESSION_COOKIE}=${valueOf(session)}`);
    expect(me.status).toBe(200);
    const [row] = await s.database.db.select().from(sessions).where(eq(sessions.idHash, sha256(valueOf(session))));
    expect(JSON.stringify(row)).not.toContain('refresh-for-code1');
    expect(decryptForUser(row!.refreshTokenEnc!, userId, { key: KEY, version: 1 })).toBe('refresh-for-code1');
  });

  it('UC-AUTH-09: a callback with the wrong state, no state cookie or a refused code signs nobody in', async () => {
    const s = setup({});
    const { stateCookie } = await login(s);
    const wrongState = await request(s.app).get('/auth/callback?code=x&state=nope').set('cookie', `__Host-oauth-state=${stateCookie}`);
    expect(wrongState.status).toBe(400);
    const noCookie = await request(s.app).get('/auth/callback?code=x&state=nope');
    expect(noCookie.status).toBe(400);
    const badCode = await callback(s, 'unknown-code');
    expect(badCode.status).toBe(401);
    expect(cookieNamed(badCode, SESSION_COOKIE)).toBeUndefined();
  });

  it('UC-AUTH-11: logout ends the session, clears the cookie, returns the provider sign-out URL, and the old cookie gets 401', async () => {
    const userId = await createUser(setup().database);
    const s = setup({ c: { sub: workosIdOf(userId), email: emailOf(userId) } });
    const signedIn = await callback(s, 'c');
    const cookie = `${SESSION_COOKIE}=${valueOf(cookieNamed(signedIn, SESSION_COOKIE)!)}`;
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', cookie)).status).toBe(200);

    const noCsrf = await request(s.app).post('/auth/logout').set('cookie', cookie);
    expect(noCsrf.status).toBe(403);
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', cookie)).status).toBe(200);

    const out = await request(s.app).post('/auth/logout').set('cookie', cookie).set(WEB_HEADERS);
    expect(out.status).toBe(200);
    expect(out.body.logoutUrl).toMatch(/^https:\/\/auth\.example\.test\/logout/);
    expect(cookieNamed(out, SESSION_COOKIE)).toMatch(/Max-Age=0/);
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', cookie)).status).toBe(401);
  });

  it('UC-AUTH-11: logging out with no session is a harmless 204 that still clears the cookie', async () => {
    const s = setup();
    const res = await request(s.app).post('/auth/logout').set(WEB_HEADERS);
    expect(res.status).toBe(204);
    expect(cookieNamed(res, SESSION_COOKIE)).toMatch(/Max-Age=0/);
  });

  it('UC-AUTH-12: every sign-in gets a new session id, and an id set before sign-in is never accepted', async () => {
    const userId = await createUser(setup().database);
    const s = setup({ c: { sub: workosIdOf(userId), email: emailOf(userId) } });
    const planted = 'attacker-chosen-value';
    const first = await callback(s, 'c', `; ${SESSION_COOKIE}=${planted}`);
    const second = await callback(s, 'c');
    const a = valueOf(cookieNamed(first, SESSION_COOKIE)!);
    const b = valueOf(cookieNamed(second, SESSION_COOKIE)!);
    expect(a).not.toBe(planted);
    expect(a).not.toBe(b);
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', `${SESSION_COOKIE}=${planted}`)).status).toBe(401);
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', `${SESSION_COOKIE}=${a}`)).status).toBe(200);
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', `${SESSION_COOKIE}=${b}`)).status).toBe(200);
  });
});

describe('pending sign-up', () => {
  const identity = () => ({ sub: `workos|${randomUUID()}`, email: 'new-person@example.test' });

  it('UC-SIGNUP-07: a callback for an identity with no users row creates no session row and sets a sealed pending cookie', async () => {
    const who = identity();
    const s = setup({ fresh: who });
    const res = await callback(s, 'fresh');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/signup');
    expect(cookieNamed(res, SESSION_COOKIE)).toBeUndefined();
    const pending = cookieNamed(res, PENDING_COOKIE)!;
    expect(pending).toMatch(/HttpOnly/);
    expect(pending).toMatch(/Secure/);
    expect(pending).toMatch(/SameSite=Lax/);
    expect(pending).toMatch(/Max-Age=900/);
    const value = valueOf(pending);
    expect(value).not.toContain(who.sub);
    expect(value).not.toContain(who.email);
    expect(value).not.toContain('refresh-for-fresh');
    expect(await s.database.db.select().from(users).where(eq(users.workosUserId, who.sub))).toHaveLength(0);
  });

  it('UC-SIGNUP-07: only POST /api/v1/profile accepts the cookie, under the CSRF rules', async () => {
    const who = identity();
    const s = setup({ fresh: who });
    const value = valueOf(cookieNamed(await callback(s, 'fresh'), PENDING_COOKIE)!);
    const cookie = `${PENDING_COOKIE}=${value}`;
    const body = { displayName: 'New Person', timezone: 'America/Mexico_City' };

    expect((await request(s.app).get('/api/v1/profile').set('cookie', cookie)).status).toBe(401);
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', cookie)).status).toBe(401);
    expect((await request(s.app).post('/api/v1/tasks').set('cookie', cookie).set(WEB_HEADERS).send({ title: 'x' })).status).toBe(401);
    expect((await request(s.app).post('/api/v1/profile').set('cookie', cookie).send(body)).status).toBe(403);
    expect(
      (await request(s.app).post('/api/v1/profile').set('cookie', cookie).set({ 'x-requested-with': 'x', origin: 'https://evil.example' }).send(body)).status,
    ).toBe(403);
    expect(await s.database.db.select().from(users).where(eq(users.workosUserId, who.sub))).toHaveLength(0);

    const ok = await request(s.app).post('/api/v1/profile').set('cookie', cookie).set(WEB_HEADERS).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.email).toBe(who.email);
  });

  it('UC-SIGNUP-07: on success the cookie is cleared and the response sends the browser back to /auth/login', async () => {
    const who = identity();
    const s = setup({ fresh: who });
    const value = valueOf(cookieNamed(await callback(s, 'fresh'), PENDING_COOKIE)!);
    const ok = await request(s.app)
      .post('/api/v1/profile')
      .set('cookie', `${PENDING_COOKIE}=${value}`)
      .set(WEB_HEADERS)
      .send({ displayName: 'New Person', timezone: 'UTC' });
    expect(ok.status).toBe(201);
    expect(ok.headers['location']).toBe('/auth/login');
    expect(cookieNamed(ok, PENDING_COOKIE)).toMatch(/Max-Age=0/);
  });

  it('UC-SIGNUP-07: the second sign-in, now with a users row, creates a normal session with a refresh token', async () => {
    const who = identity();
    const s = setup({ fresh: who });
    const value = valueOf(cookieNamed(await callback(s, 'fresh'), PENDING_COOKIE)!);
    await request(s.app).post('/api/v1/profile').set('cookie', `${PENDING_COOKIE}=${value}`).set(WEB_HEADERS).send({ displayName: 'N', timezone: 'UTC' });
    const again = await callback(s, 'fresh');
    expect(again.headers['location']).toBe('/');
    const session = valueOf(cookieNamed(again, SESSION_COOKIE)!);
    const [row] = await s.database.db.select().from(sessions).where(eq(sessions.idHash, sha256(session)));
    expect(row?.refreshTokenEnc).toBeTruthy();
  });

  it('UC-SIGNUP-07: a tampered or expired cookie gets 401, and a cookie cannot be reused as a session', async () => {
    const who = identity();
    const s = setup({ fresh: who });
    const value = valueOf(cookieNamed(await callback(s, 'fresh'), PENDING_COOKIE)!);
    const body = { displayName: 'New Person', timezone: 'UTC' };
    const post = (cookieValue: string) =>
      request(s.app).post('/api/v1/profile').set('cookie', `${PENDING_COOKIE}=${cookieValue}`).set(WEB_HEADERS).send(body);

    const raw = Buffer.from(value, 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] as number) ^ 1;
    expect((await post(raw.toString('base64'))).status).toBe(401);
    expect((await post('not-a-sealed-value')).status).toBe(401);

    s.clock.advance(16 * MIN);
    expect((await post(value)).status).toBe(401);
    expect(await s.database.db.select().from(users).where(eq(users.workosUserId, who.sub))).toHaveLength(0);
  });

  it('UC-SIGNUP-07: a not-allowlisted identity gets signup-closed even with a valid pending cookie', async () => {
    const who = { sub: `workos|${randomUUID()}`, email: 'stranger@example.test' };
    const s = setup({ fresh: who });
    const value = valueOf(cookieNamed(await callback(s, 'fresh'), PENDING_COOKIE)!);
    const res = await request(s.app)
      .post('/api/v1/profile')
      .set('cookie', `${PENDING_COOKIE}=${value}`)
      .set(WEB_HEADERS)
      .send({ displayName: 'S', timezone: 'UTC' });
    expect(res.status).toBe(403);
    expect(res.body.type).toMatch(/signup-closed$/);
  });
});

describe('refresh and client types', () => {
  it('UC-SESSION-23: the refresh token is used at most once every 15 minutes, rotated, and refreshedAt is updated', async () => {
    const s = setup();
    const userId = await createUser(s.database);
    const cookie = await createWebSession(s.database, userId, { now: s.clock.now(), refreshToken: 'rt-0', key: KEY });
    const get = () => request(s.app).get('/api/v1/tasks').set('cookie', `${SESSION_COOKIE}=${cookie}`);
    const refreshedAt = async () =>
      (await s.database.db.select().from(sessions).where(eq(sessions.userId, userId)))[0]!.refreshedAt!.getTime();

    s.clock.advance(14 * MIN);
    expect((await get()).status).toBe(200);
    expect(s.calls.refresh).toEqual([]);

    s.clock.advance(1 * MIN);
    expect((await get()).status).toBe(200);
    expect(s.calls.refresh).toEqual(['rt-0']);
    expect(await refreshedAt()).toBe(s.clock.now().getTime());
    const [row] = await s.database.db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(decryptForUser(row!.refreshTokenEnc!, userId, { key: KEY, version: 1 })).toBe('rt-0+');

    s.clock.advance(5 * MIN);
    await get();
    expect(s.calls.refresh).toEqual(['rt-0']);
    s.clock.advance(10 * MIN);
    await get();
    expect(s.calls.refresh).toEqual(['rt-0', 'rt-0+']);
  });

  it('UC-SESSION-23: Bearer sessions never refresh', async () => {
    const s = setup();
    const userId = await createUser(s.database);
    const token = signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId), clientId: 'some-mcp' });
    await request(s.app).get('/api/v1/tasks').set('authorization', `Bearer ${token}`);
    s.clock.advance(20 * MIN);
    await request(s.app).get('/api/v1/tasks').set('authorization', `Bearer ${token}`);
    expect(s.calls.refresh).toEqual([]);
  });

  it('UC-SESSION-24: a CLI client id gives a cli session, another gives mcp, and the web client id gets 401', async () => {
    const s = setup();
    const userId = await createUser(s.database);
    const as = (clientId: string) => ({
      authorization: `Bearer ${signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId), clientId })}`,
    });
    expect((await request(s.app).get('/api/v1/tasks').set(as('cli-client'))).status).toBe(200);
    expect((await request(s.app).get('/api/v1/tasks').set(as('claude'))).status).toBe(200);
    expect((await request(s.app).get('/api/v1/tasks').set(as('web-client'))).status).toBe(401);
    const types = (await s.database.db.select().from(sessions).where(eq(sessions.userId, userId))).map((r) => r.clientType).sort();
    expect(types).toEqual(['cli', 'mcp']);
  });

  it('UC-SESSION-14: the same sid from two different clients gives two different sessions', async () => {
    const s = setup();
    const userId = await createUser(s.database);
    const sid = `shared-${randomUUID()}`;
    const as = (clientId: string) => ({
      authorization: `Bearer ${signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId), clientId, sid })}`,
    });
    await request(s.app).get('/api/v1/tasks').set(as('claude'));
    await request(s.app).get('/api/v1/tasks').set(as('gemini'));
    expect(await s.database.db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(2);
  });
});

describe('edge cases', () => {
  it('UC-AUTH-11: signing out a session whose refresh token cannot be decrypted still ends it, with no sign-out URL', async () => {
    const s = setup();
    const userId = await createUser(s.database);
    const cookie = await createWebSession(s.database, userId, { now: s.clock.now(), refreshToken: 'rt', key: Buffer.alloc(32, 1) });
    const res = await request(s.app).post('/auth/logout').set('cookie', `${SESSION_COOKIE}=${cookie}`).set(WEB_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ logoutUrl: null });
    expect((await request(s.app).get('/api/v1/tasks').set('cookie', `${SESSION_COOKIE}=${cookie}`)).status).toBe(401);
  });

  it('UC-AUTH-11: signing out with a cookie that matches no session is a harmless 204', async () => {
    const s = setup();
    const res = await request(s.app).post('/auth/logout').set('cookie', `${SESSION_COOKIE}=unknown-value`).set(WEB_HEADERS);
    expect(res.status).toBe(204);
  });

  it('UC-SIGNUP-07: a sealed cookie with the wrong contents is refused', async () => {
    const s = setup();
    const sealed = (json: object) => encryptForUser(JSON.stringify(json), 'pending-signup', { key: KEY, version: 1 });
    for (const content of [{ sub: 1 }, { sub: 'a', email: 'b' }, { sub: 'a', email: 'b', exp: 'soon' }]) {
      const res = await request(s.app)
        .post('/api/v1/profile')
        .set('cookie', `${PENDING_COOKIE}=${sealed(content)}`)
        .set(WEB_HEADERS)
        .send({ displayName: 'X', timezone: 'UTC' });
      expect(res.status, JSON.stringify(content)).toBe(401);
    }
  });
});
