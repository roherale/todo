import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp, testConfig } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'web-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>todo</title><app-root></app-root>');
writeFileSync(join(dir, 'main.js'), 'console.log(1)');
const ctx = buildTestApp(undefined, testConfig({ WEB_DIST_DIR: dir }));
afterAll(async () => {
  await ctx.database.pool.end();
});

describe('routes without a token', () => {
  it('UC-AUTH-08: /healthz, /.well-known/* and the static web files work without a token', async () => {
    expect((await request(ctx.app).get('/healthz')).status).toBe(200);
    const index = await request(ctx.app).get('/');
    expect(index.status).toBe(200);
    expect(index.text).toContain('<app-root>');
    expect((await request(ctx.app).get('/main.js')).status).toBe(200);
    // Client-side routes get index.html, so deep links and reloads work.
    expect((await request(ctx.app).get('/tasks/12')).text).toContain('<app-root>');
    // No token is demanded under /.well-known: the answer is 404, never 401.
    expect((await request(ctx.app).get('/.well-known/nothing-here')).status).toBe(404);
  });

  it('UC-AUTH-08: every /api/v1 route needs a token', async () => {
    const routes: [string, string][] = [
      ['get', '/api/v1/tasks'],
      ['post', '/api/v1/tasks'],
      ['get', '/api/v1/tasks/1'],
      ['patch', '/api/v1/tasks/1'],
      ['delete', '/api/v1/tasks/1'],
      ['post', '/api/v1/tasks/1/restore'],
      ['get', '/api/v1/trash'],
      ['delete', '/api/v1/trash'],
      ['get', '/api/v1/profile'],
      ['patch', '/api/v1/profile'],
      ['delete', '/api/v1/profile'],
      ['post', '/api/v1/profile'],
      ['post', '/api/v1/session/heartbeat'],
      ['post', '/api/v1/sessions/end-all'],
      ['get', '/api/v1/anything-else'],
    ];
    for (const [method, path] of routes) {
      const res = await (request(ctx.app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('UC-AUTH-08: API and auth paths never fall back to index.html', async () => {
    const api = await request(ctx.app).get('/api/v1/nothing');
    expect(api.text).not.toContain('<app-root>');
    expect((await request(ctx.app).get('/auth/nothing')).text).not.toContain('<app-root>');
  });
});
