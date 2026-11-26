import { generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp, createUser, emailOf, signer, testConfig, workosIdOf } from './helpers.js';

const ctx = buildTestApp((app) => {
  app.get('/api/v1/whoami', (req, res) => {
    res.json({ user: (req as { user?: unknown }).user ?? null });
  });
});
afterAll(async () => {
  await ctx.database.pool.end();
});

const get = (path: string, token?: string) => {
  const r = request(ctx.app).get(path);
  return token ? r.set('authorization', `Bearer ${token}`) : r;
};

describe('token checks', () => {
  it('UC-AUTH-01: a request with no credentials returns 401 problem+json on /api/v1 routes', async () => {
    for (const path of ['/api/v1/tasks', '/api/v1/trash', '/api/v1/profile', '/api/v1/tasks/1']) {
      const res = await get(path);
      expect(res.status, path).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
    }
    expect((await request(ctx.app).post('/api/v1/profile').send({})).status).toBe(401);
  });

  it('UC-AUTH-01: a malformed Authorization header returns 401', async () => {
    for (const header of ['Basic abc', 'Bearer', 'Bearer a b', 'token']) {
      const res = await request(ctx.app).get('/api/v1/tasks').set('authorization', header);
      expect(res.status, header).toBe(401);
    }
  });

  it('UC-AUTH-02: a token with a bad signature returns 401', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const token = signer.signToken({ sub: 'x', signWith: other });
    expect((await get('/api/v1/tasks', token)).status).toBe(401);
  });

  it('UC-AUTH-02: a token with the wrong issuer returns 401', async () => {
    const token = signer.signToken({ sub: 'x', issuer: 'https://evil.example' });
    expect((await get('/api/v1/tasks', token)).status).toBe(401);
  });

  it('UC-AUTH-02: a token with the wrong audience returns 401', async () => {
    const token = signer.signToken({ sub: 'x', audience: 'someone-else' });
    expect((await get('/api/v1/tasks', token)).status).toBe(401);
  });

  it('UC-AUTH-02: an expired token returns 401', async () => {
    const token = signer.signToken({ sub: 'x', expiresIn: -60 });
    expect((await get('/api/v1/tasks', token)).status).toBe(401);
  });

  it('UC-AUTH-02: a tampered payload returns 401', async () => {
    const [h, , s] = signer.signToken({ sub: 'x' }).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', iss: 'x', aud: 'x', exp: 9_999_999_999 })).toString('base64url');
    expect((await get('/api/v1/tasks', `${h}.${forged}.${s}`)).status).toBe(401);
  });

  it('UC-AUTH-03: the test signer is accepted when the app is created in test mode', async () => {
    const userId = await createUser(ctx.database);
    const token = signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId) });
    expect((await get('/api/v1/tasks', token)).status).toBe(200);
  });

  it('UC-AUTH-03: the same token returns 401 when the app runs with production config', async () => {
    const userId = await createUser(ctx.database);
    const production = buildTestApp(
      undefined,
      testConfig({ NODE_ENV: 'production', WORKOS_JWKS_URL: 'http://127.0.0.1:1/jwks' }),
    );
    try {
      const token = signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId) });
      const res = await request(production.app).get('/api/v1/tasks').set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    } finally {
      await production.database.pool.end();
    }
  });
});

describe('sign-up guard', () => {
  it('UC-AUTH-04: a valid token with no matching user gets 403 signup-required with a signupUrl', async () => {
    const token = signer.signToken({ sub: 'test|nobody-yet', email: 'nobody@example.test' });
    for (const path of ['/api/v1/tasks', '/api/v1/trash', '/api/v1/profile', '/api/v1/tasks/1']) {
      const res = await get(path, token);
      expect(res.status, path).toBe(403);
      expect(res.body.type).toMatch(/signup-required$/);
      expect(res.body.signupUrl).toBe(`${ctx.config.APP_ORIGIN}/signup`);
    }
    const write = await request(ctx.app).post('/api/v1/tasks').set('authorization', `Bearer ${token}`).send({ title: 'x' });
    expect(write.status).toBe(403);
  });

  it('UC-AUTH-04: POST /api/v1/profile is the one route that does not answer signup-required', async () => {
    const token = signer.signToken({ sub: 'test|nobody-yet-2', email: 'nobody@example.test' });
    const res = await request(ctx.app).post('/api/v1/profile').set('authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.type).not.toMatch(/signup-required$/);
  });

  it('UC-AUTH-05: a signed-up caller reaches the handler with req.user set to their users row', async () => {
    const userId = await createUser(ctx.database, { timezone: 'Asia/Tokyo', pageSize: 25 });
    const token = signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId) });
    const res = await get('/api/v1/whoami', token);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: userId,
      workosUserId: workosIdOf(userId),
      email: emailOf(userId),
      timezone: 'Asia/Tokyo',
      pageSize: 25,
    });
  });
});
