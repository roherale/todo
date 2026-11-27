import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { ProblemSchema } from '@todo/shared';
import { buildTestApp } from './helpers.js';

const boom = (app: express.Express) => {
  app.get('/boom', () => {
    throw new Error('secret internal detail at /srv/app.ts:42');
  });
  app.post('/echo', express.json(), (req, res) => {
    res.status(201).json(req.body);
  });
};

describe('ops', () => {
  const ctx = buildTestApp(boom);
  afterAll(async () => {
    await ctx.database.pool.end().catch(() => undefined);
  });

  it('UC-OPS-02: every response carries X-Request-Id and problem bodies repeat it', async () => {
    const ok = await request(ctx.app).get('/health');
    expect(ok.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const missing = await request(ctx.app).get('/nope');
    const problem = ProblemSchema.parse(missing.body);
    expect(problem.requestId).toBe(missing.headers['x-request-id']);
    expect(missing.headers['content-type']).toContain('application/problem+json');
  });

  it('UC-OPS-05: unhandled errors return 500 problem+json without internals', async () => {
    const res = await request(ctx.app).get('/boom');
    expect(res.status).toBe(500);
    expect(ProblemSchema.parse(res.body).status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
    expect(JSON.stringify(res.body)).not.toContain('app.ts');
    expect(ctx.logs.lines.join('')).toContain('secret internal detail');
  });

  it('UC-OPS-06: responses include a CSP with img-src \'self\' https:', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.headers['content-security-policy']).toContain("img-src 'self' https:");
  });

  it('UC-OPS-03: logs never contain auth headers, cookies, tokens, titles or notes', async () => {
    await request(ctx.app)
      .post('/echo')
      .set('Authorization', 'Bearer super-secret-token-123')
      .set('Cookie', '__Host-session=cookie-secret-456')
      .send({ title: 'private title xyz', notes: 'private notes xyz', token: 'body-token-789' });
    await request(ctx.app).get('/boom').set('Authorization', 'Bearer super-secret-token-123');

    const logs = ctx.logs.lines.join('');
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of [
      'super-secret-token-123',
      'cookie-secret-456',
      'private title xyz',
      'private notes xyz',
      'body-token-789',
    ]) {
      expect(logs).not.toContain(secret);
    }
  });
});

describe('health', () => {
  it('UC-OPS-01: /health is 200 without auth when the database answers', async () => {
    const ctx = buildTestApp();
    const res = await request(ctx.app).get('/health');
    await ctx.database.pool.end();
    expect(res.status).toBe(200);
  });

  it('UC-OPS-01: /health is 503 when the database does not answer', async () => {
    const ctx = buildTestApp();
    await ctx.database.pool.end();
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(503);
  });
});
