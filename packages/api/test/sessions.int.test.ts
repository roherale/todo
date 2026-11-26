import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createSessionsRepository } from '../src/modules/sessions/sessions.repository.js';
import { createSessionsService } from '../src/modules/sessions/sessions.service.js';
import { decryptForUser, encryptForUser, parseSessionKey, sessions, sha256 } from '../src/modules/sessions/index.js';
import {
  COOKIE_NAME,
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
const HOUR = 60 * MIN;
const KEY = Buffer.alloc(32, 9);
const config = testConfig({ SESSION_ENCRYPTION_KEY: KEY.toString('base64'), CLI_CLIENT_ID: 'cli-client' });

function setup(refresh?: (token: string) => Promise<string>) {
  const clock = createClock(new Date('2026-12-01T10:00:00Z'));
  const ctx = buildTestApp(undefined, config, { clock, refresh });
  return { clock, ...ctx };
}

const tokenFor = (userId: string, extra: { sid?: string; clientId?: string; authTime?: number } = {}) =>
  signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId), ...extra });
const withBearer = (token: string) => ({ authorization: `Bearer ${token}` });
const withCookie = (cookie: string) => ({ cookie: `${COOKIE_NAME}=${cookie}` });
const rows = (ctx: ReturnType<typeof setup>, userId: string) =>
  ctx.database.db.select().from(sessions).where(eq(sessions.userId, userId));

const pools: { end: () => Promise<void> }[] = [];
afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
});
function fresh(refresh?: (token: string) => Promise<string>) {
  const s = setup(refresh);
  pools.push(s.database.pool);
  return s;
}

describe('lifetimes', () => {
  it('UC-SESSION-01: a web session idle for more than an hour gets 401 and is marked ended; at 59 minutes it works', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const ok = await createWebSession(s.database, user, { now: s.clock.now() });
    const late = await createWebSession(s.database, user, { now: s.clock.now() });
    s.clock.advance(59 * MIN);
    expect((await request(s.app).get('/api/v1/tasks').set(withCookie(ok))).status).toBe(200);
    s.clock.advance(2 * MIN);
    const res = await request(s.app).get('/api/v1/tasks').set(withCookie(late));
    expect(res.status).toBe(401);
    const ended = (await rows(s, user)).filter((r) => r.endedAt !== null);
    expect(ended).toHaveLength(1);
  });

  it('UC-SESSION-02: a web session older than 24 hours gets 401 even when it was active all along', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now() });
    for (let i = 0; i < 48; i++) {
      s.clock.advance(30 * MIN);
      expect((await request(s.app).get('/api/v1/tasks').set(withCookie(cookie))).status, `step ${i}`).toBe(200);
    }
    s.clock.advance(MIN);
    expect((await request(s.app).get('/api/v1/tasks').set(withCookie(cookie))).status).toBe(401);
  });

  it('UC-SESSION-03: a CLI or MCP session idle for more than 24 hours gets 401; at 23h59m it works', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    for (const clientId of ['cli-client', 'some-mcp-client']) {
      const fine = tokenFor(user, { clientId });
      const stale = tokenFor(user, { clientId });
      expect((await request(s.app).get('/api/v1/tasks').set(withBearer(fine))).status).toBe(200);
      expect((await request(s.app).get('/api/v1/tasks').set(withBearer(stale))).status).toBe(200);
      s.clock.advance(23 * HOUR + 59 * MIN);
      expect((await request(s.app).get('/api/v1/tasks').set(withBearer(fine))).status, clientId).toBe(200);
      s.clock.advance(24 * HOUR + MIN - 1000);
      expect((await request(s.app).get('/api/v1/tasks').set(withBearer(stale))).status, clientId).toBe(401);
    }
  });

  it('UC-SESSION-04: a CLI or MCP session older than 30 days gets 401 even when active all along', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const token = tokenFor(user, { clientId: 'cli-client' });
    for (let i = 0; i <= 60; i++) {
      expect((await request(s.app).get('/api/v1/tasks').set(withBearer(token))).status, `step ${i}`).toBe(200);
      if (i < 60) s.clock.advance(12 * HOUR);
    }
    s.clock.advance(1000);
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(token))).status).toBe(401);
  });

  it('UC-SESSION-06: a new sign-in restores access, an ended session is never reactivated, and each sign-in gets its own row', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const old = tokenFor(user, { sid: `consent-${randomUUID()}` });
    await request(s.app).get('/api/v1/tasks').set(withBearer(old));
    s.clock.advance(25 * HOUR);
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(old))).status).toBe(401);
    // Same token again, even much later: the ended session stays ended.
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(old))).status).toBe(401);
    // A new sign-in has a new sid, and works.
    const next = tokenFor(user, { sid: `consent-${randomUUID()}` });
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(next))).status).toBe(200);
    expect((await rows(s, user)).length).toBeGreaterThanOrEqual(1);
  });

  it('UC-SESSION-06: if the provider keeps the same sid, a changed auth_time still starts a new session', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const sameSid = `same-${randomUUID()}`;
    const first = tokenFor(user, { sid: sameSid, authTime: 1000 });
    await request(s.app).get('/api/v1/tasks').set(withBearer(first));
    s.clock.advance(25 * HOUR);
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(first))).status).toBe(401);
    const second = tokenFor(user, { sid: sameSid, authTime: 2000 });
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(second))).status).toBe(200);
  });

  it('UC-SESSION-07: lastSeenAt is written at most once per minute per session', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const token = tokenFor(user);
    const start = s.clock.now().getTime();
    await request(s.app).get('/api/v1/tasks').set(withBearer(token));
    for (const offset of [20_000, 20_000, 19_000]) {
      s.clock.advance(offset);
      await request(s.app).get('/api/v1/tasks').set(withBearer(token));
    }
    expect((await rows(s, user))[0]?.lastSeenAt.getTime()).toBe(start);
    s.clock.advance(2_000); // now 61 s after the last write
    await request(s.app).get('/api/v1/tasks').set(withBearer(token));
    expect((await rows(s, user))[0]?.lastSeenAt.getTime()).toBe(start + 61_000);
  });
});

describe('web activity', () => {
  it('UC-SESSION-08: the heartbeat accepts a web cookie session, returns 204 and updates lastSeenAt', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now() });
    s.clock.advance(10_000);
    const res = await request(s.app).post('/api/v1/session/heartbeat').set(withCookie(cookie)).set(WEB_HEADERS);
    expect(res.status).toBe(204);
    expect((await rows(s, user))[0]?.lastSeenAt.getTime()).toBe(s.clock.now().getTime());
  });

  it('UC-SESSION-08: the heartbeat returns 403 for a Bearer token and for a cookie request without the CSRF header', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const viaBearer = await request(s.app).post('/api/v1/session/heartbeat').set(withBearer(tokenFor(user)));
    expect(viaBearer.status).toBe(403);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now() });
    const noHeader = await request(s.app).post('/api/v1/session/heartbeat').set(withCookie(cookie));
    expect(noHeader.status).toBe(403);
  });
});

describe('storage', () => {
  const sessionsService = (db: ReturnType<typeof setup>['database']['db']) =>
    createSessionsService({ repo: createSessionsRepository(db), key: { key: KEY, version: 3 }, now: () => new Date() });

  it('UC-SESSION-12: the cookie value is 32 random bytes in base64url, and only its SHA-256 hash is stored', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const cookie = await sessionsService(s.database.db).startWeb(user);
    expect(cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(cookie, 'base64url')).toHaveLength(32);
    const [row] = await rows(s, user);
    expect(row?.idHash).toBe(sha256(cookie));
    expect(JSON.stringify(row)).not.toContain(cookie);
    const other = await sessionsService(s.database.db).startWeb(user);
    expect(other).not.toBe(cookie);
  });

  it('UC-SESSION-13: refresh tokens are stored encrypted, differ per encryption, and record the key version', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    await sessionsService(s.database.db).startWeb(user, 'refresh-token-plain');
    const [row] = await rows(s, user);
    expect(row?.refreshTokenEnc).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain('refresh-token-plain');
    expect(row?.keyVersion).toBe(3);
    expect(decryptForUser(row!.refreshTokenEnc!, user, { key: KEY, version: 3 })).toBe('refresh-token-plain');
  });

  it('UC-SESSION-13: encrypting the same token twice gives different ciphertexts', () => {
    const a = encryptForUser('same', 'u1', { key: KEY, version: 1 });
    const b = encryptForUser('same', 'u1', { key: KEY, version: 1 });
    expect(a).not.toBe(b);
  });

  it('UC-SESSION-13: decryption fails when the ciphertext, the IV or the bound userId is altered', () => {
    const enc = encryptForUser('secret-token', 'user-1', { key: KEY, version: 1 });
    const raw = Buffer.from(enc, 'base64');
    const flip = (index: number) => {
      const copy = Buffer.from(raw);
      copy[index] = (copy[index] as number) ^ 0xff;
      return copy.toString('base64');
    };
    expect(() => decryptForUser(flip(0), 'user-1', { key: KEY, version: 1 })).toThrow(); // IV
    expect(() => decryptForUser(flip(14), 'user-1', { key: KEY, version: 1 })).toThrow(); // ciphertext
    expect(() => decryptForUser(flip(raw.length - 1), 'user-1', { key: KEY, version: 1 })).toThrow(); // tag
    expect(() => decryptForUser(enc, 'user-2', { key: KEY, version: 1 })).toThrow(); // bound userId
    expect(() => decryptForUser('AAAA', 'user-1', { key: KEY, version: 1 })).toThrow();
    expect(decryptForUser(enc, 'user-1', { key: KEY, version: 1 })).toBe('secret-token');
  });

  it('UC-SESSION-14: CLI and MCP sessions are stored by a hash; the raw sid appears in no column', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const sid = `raw-sid-value-${randomUUID()}`;
    await request(s.app).get('/api/v1/tasks').set(withBearer(tokenFor(user, { sid, clientId: 'cli-client' })));
    const [row] = await rows(s, user);
    expect(row?.clientType).toBe('cli');
    expect(row?.idHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(sid);
    expect(row?.idHash).toBe(sha256(`cli-client:${sid}`));
  });

  it('UC-SESSION-15: the sessions table has exactly the approved columns', async () => {
    const s = fresh();
    const result = await s.database.db.execute(
      sql`select column_name from information_schema.columns where table_name = 'sessions' order by column_name`,
    );
    const names = (result.rows as { column_name: string }[]).map((r) => r.column_name).sort();
    expect(names).toEqual(
      ['client_type', 'ended_at', 'first_seen_at', 'id', 'id_hash', 'key_version', 'last_seen_at', 'refresh_token_enc', 'refreshed_at', 'user_id'].sort(),
    );
  });

  it('UC-SESSION-16: no response body or header contains a session id, cookie value or token', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const sid = `sid-must-not-leak-${randomUUID()}`;
    const token = tokenFor(user, { sid });
    const cookie = await createWebSession(s.database, user, { now: s.clock.now() });
    const responses = [
      await request(s.app).get('/api/v1/tasks').set(withBearer(token)),
      await request(s.app).get('/api/v1/profile').set(withBearer(token)),
      await request(s.app).get('/api/v1/profile').set(withCookie(cookie)),
      await request(s.app).post('/api/v1/session/heartbeat').set(withCookie(cookie)).set(WEB_HEADERS),
      await request(s.app).get('/api/v1/tasks').set({ authorization: 'Bearer broken' }),
      await request(s.app).get('/api/v1/tasks'),
    ];
    for (const res of responses) {
      const dump = JSON.stringify(res.body) + JSON.stringify(res.headers) + res.text;
      for (const secret of [sid, cookie, token, sha256(cookie)]) expect(dump).not.toContain(secret);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe('ending sessions', () => {
  it('UC-SESSION-17: the session encryption key must be 32 bytes, and is parsed strictly', () => {
    expect(() => parseSessionKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
    expect(parseSessionKey(KEY.toString('base64'))).toHaveLength(32);
  });

  it('UC-SESSION-18: when the provider rejects a refresh, the session ends and the request gets 401', async () => {
    const s = fresh(() => Promise.reject(new Error('refresh token revoked')));
    const user = await createUser(s.database);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now(), refreshToken: 'rt-1', key: KEY });
    s.clock.advance(16 * MIN);
    const res = await request(s.app).get('/api/v1/tasks').set(withCookie(cookie));
    expect(res.status).toBe(401);
    expect((await rows(s, user))[0]?.endedAt).not.toBeNull();
    expect((await request(s.app).get('/api/v1/tasks').set(withCookie(cookie))).status).toBe(401);
  });

  it('UC-SESSION-18: when the provider accepts a refresh, the rotated token is stored encrypted', async () => {
    const s = fresh(() => Promise.resolve('rt-rotated'));
    const user = await createUser(s.database);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now(), refreshToken: 'rt-1', key: KEY });
    s.clock.advance(16 * MIN);
    expect((await request(s.app).get('/api/v1/tasks').set(withCookie(cookie))).status).toBe(200);
    const [row] = await rows(s, user);
    expect(decryptForUser(row!.refreshTokenEnc!, user, { key: KEY, version: 1 })).toBe('rt-rotated');
  });

  it('UC-SESSION-19: end-all needs a web session with CSRF headers, and ends all of the caller\'s sessions', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const cliToken = tokenFor(user, { clientId: 'cli-client' });
    const mcpToken = tokenFor(user, { clientId: 'claude' });
    await request(s.app).get('/api/v1/tasks').set(withBearer(cliToken));
    await request(s.app).get('/api/v1/tasks').set(withBearer(mcpToken));
    const web = await createWebSession(s.database, user, { now: s.clock.now() });
    const other = await createWebSession(s.database, user, { now: s.clock.now() });

    expect((await request(s.app).post('/api/v1/sessions/end-all').set(withBearer(cliToken))).status).toBe(403);
    expect((await request(s.app).post('/api/v1/sessions/end-all').set(withCookie(web))).status).toBe(403);
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(cliToken))).status).toBe(200);

    const res = await request(s.app).post('/api/v1/sessions/end-all').set(withCookie(web)).set(WEB_HEADERS);
    expect(res.status).toBe(204);
    for (const headers of [withBearer(cliToken), withBearer(mcpToken), withCookie(web), withCookie(other)]) {
      expect((await request(s.app).get('/api/v1/tasks').set(headers)).status).toBe(401);
    }
  });

  it('UC-SESSION-20: end-all never ends another user\'s sessions', async () => {
    const s = fresh();
    const a = await createUser(s.database);
    const b = await createUser(s.database);
    const aWeb = await createWebSession(s.database, a, { now: s.clock.now() });
    const bWeb = await createWebSession(s.database, b, { now: s.clock.now() });
    const bToken = tokenFor(b);
    await request(s.app).get('/api/v1/tasks').set(withBearer(bToken));
    await request(s.app).post('/api/v1/sessions/end-all').set(withCookie(aWeb)).set(WEB_HEADERS);
    expect((await request(s.app).get('/api/v1/tasks').set(withCookie(bWeb))).status).toBe(200);
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(bToken))).status).toBe(200);
  });

  it('UC-SESSION-22: a sign-in deletes that user\'s ended and expired rows, and never active rows or other users\' rows', async () => {
    const s = fresh();
    const a = await createUser(s.database);
    const b = await createUser(s.database);
    const ended = await createWebSession(s.database, a, { now: s.clock.now() });
    await request(s.app).post('/api/v1/sessions/end-all').set(withCookie(ended)).set(WEB_HEADERS);
    const stale = await createWebSession(s.database, a, { now: s.clock.now() });
    const bEnded = await createWebSession(s.database, b, { now: s.clock.now() });
    await request(s.app).post('/api/v1/sessions/end-all').set(withCookie(bEnded)).set(WEB_HEADERS);
    s.clock.advance(2 * HOUR);
    const active = tokenFor(a);
    expect((await request(s.app).get('/api/v1/tasks').set(withBearer(active))).status).toBe(200);
    const left = await rows(s, a);
    // The ended and the idle-expired web rows are gone; only the new sign-in remains.
    expect(left).toHaveLength(1);
    expect(left[0]?.clientType).toBe('mcp');
    expect(left[0]?.idHash).not.toBe(sha256(stale));
    expect((await rows(s, b)).length).toBe(1);
  });

  it('UC-SESSION-22: the deploy cleanup deletes every ended or expired row and keeps active ones', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const activeWeb = await createWebSession(s.database, user, { now: s.clock.now() });
    const endedWeb = await createWebSession(s.database, user, { now: s.clock.now() });
    const expiredWeb = await createWebSession(s.database, user, { now: new Date(s.clock.now().getTime() - 2 * HOUR) });
    await s.database.db
      .update(sessions)
      .set({ endedAt: s.clock.now() })
      .where(eq(sessions.idHash, sha256(endedWeb)));
    const service = createSessionsService({
      repo: createSessionsRepository(s.database.db),
      key: { key: KEY, version: 1 },
      now: s.clock.now,
    });
    const deleted = await service.cleanup();
    expect(deleted).toBeGreaterThanOrEqual(2);
    const left = (await rows(s, user)).map((r) => r.idHash);
    expect(left).toEqual([sha256(activeWeb)]);
    expect(left).not.toContain(sha256(expiredWeb));
  });
});

describe('CSRF', () => {
  it('UC-AUTH-10: a cookie-authenticated POST, PATCH or DELETE without X-Requested-With returns 403 and changes nothing', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now() });
    const created = await request(s.app).post('/api/v1/tasks').set(withCookie(cookie)).set(WEB_HEADERS).send({ title: 'mine' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const post = await request(s.app).post('/api/v1/tasks').set(withCookie(cookie)).send({ title: 'sneaky' });
    const patch = await request(s.app).patch(`/api/v1/tasks/${id}`).set(withCookie(cookie)).send({ title: 'changed' });
    const del = await request(s.app).delete(`/api/v1/tasks/${id}`).set(withCookie(cookie));
    expect([post.status, patch.status, del.status]).toEqual([403, 403, 403]);

    const list = await request(s.app).get('/api/v1/tasks').set(withCookie(cookie));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ title: 'mine', deletedAt: null });
  });

  it('UC-AUTH-10: an Origin other than the app\'s own returns 403, while the app\'s own Origin is accepted', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now() });
    const evil = await request(s.app)
      .post('/api/v1/tasks')
      .set(withCookie(cookie))
      .set({ 'x-requested-with': 'todo-web', origin: 'https://evil.example' })
      .send({ title: 'x' });
    expect(evil.status).toBe(403);
    const own = await request(s.app).post('/api/v1/tasks').set(withCookie(cookie)).set(WEB_HEADERS).send({ title: 'x' });
    expect(own.status).toBe(201);
  });

  it('UC-AUTH-10: safe methods with a cookie need no CSRF header', async () => {
    const s = fresh();
    const user = await createUser(s.database);
    const cookie = await createWebSession(s.database, user, { now: s.clock.now() });
    expect((await request(s.app).get('/api/v1/tasks').set(withCookie(cookie))).status).toBe(200);
  });
});
