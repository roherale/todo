import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { runSmoke } from './smoke.js';

let server: Server | undefined;

async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((r) => server!.listen(0, r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe('smoke runner', () => {
  it('UC-DEPLOY-03: passes when health, discovery and the MCP auth challenge behave', async () => {
    const base = await serve((req, res) => {
      if (req.url === '/health') return void res.writeHead(200).end('{}');
      if (req.url === '/.well-known/oauth-protected-resource') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ resource: 'r', authorization_servers: ['a'] }));
      }
      if (req.url === '/mcp') return void res.writeHead(401, { 'www-authenticate': 'Bearer' }).end();
      res.writeHead(404).end();
    });
    const results = await runSmoke(base, ['health', 'oauth-protected-resource', 'mcp-requires-auth']);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('UC-DEPLOY-03: fails each check that gets the wrong answer', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(500).end('nope');
    });
    const results = await runSmoke(base, ['health', 'oauth-protected-resource', 'mcp-requires-auth']);
    expect(results.map((r) => r.ok)).toEqual([false, false, false]);
  });

  it('UC-DEPLOY-03: reports a failure when the service cannot be reached', async () => {
    const results = await runSmoke('http://127.0.0.1:1', ['health']);
    expect(results[0]?.ok).toBe(false);
  });

  it('UC-DEPLOY-03: a check is retried until it passes, within the attempts allowed', async () => {
    let calls = 0;
    const base = await serve((req, res) => {
      calls += 1;
      res.writeHead(calls < 3 ? 503 : 200).end('{}');
      void req;
    });
    const results = await runSmoke(base, ['health'], { attempts: 5, delayMs: 1 });
    expect(results[0]?.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('UC-DEPLOY-03: a check that never passes fails after the last attempt', async () => {
    let calls = 0;
    const base = await serve((_req, res) => {
      calls += 1;
      res.writeHead(503).end();
    });
    const results = await runSmoke(base, ['health'], { attempts: 3, delayMs: 1 });
    expect(results[0]?.ok).toBe(false);
    expect(calls).toBe(3);
  });

  it('UC-DEPLOY-03: a failed check reports the status and the first 200 characters of the body', async () => {
    const long = `not here ${'x'.repeat(500)}`;
    const base = await serve((_req, res) => {
      res.writeHead(404, { 'content-type': 'text/html' }).end(long);
    });
    const results = await runSmoke(base, ['health', 'oauth-protected-resource', 'mcp-requires-auth']);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.detail).toContain('status 404');
      expect(r.detail).toContain('body "not here x');
      expect(r.detail!.length).toBeLessThan(260);
    }
  });

  it('UC-DEPLOY-03: a passing check does not print the body', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200).end('secret-looking body');
    });
    const [result] = await runSmoke(base, ['health']);
    expect(result?.detail).toBe('status 200');
  });

  it('UC-DEPLOY-03: the failure output names the host, never the full address', async () => {
    const run = promisify(execFile);
    const base = await serve((_req, res) => {
      res.writeHead(404).end('nope');
    });
    const result = await run(process.execPath, ['--import', 'tsx', new URL('./smoke.ts', import.meta.url).pathname, `${base}/some/path?token=abc`, 'health'], {
      env: { PATH: process.env['PATH'] ?? '' },
    }).then(
      () => ({ code: 0, out: '' }),
      (err: { code?: number; stdout?: string }) => ({ code: err.code ?? 1, out: err.stdout ?? '' }),
    );
    expect(result.code).toBe(1);
    expect(result.out).toContain('Checked host: 127.0.0.1');
    expect(result.out).not.toContain('token=abc');
    expect(result.out).not.toContain(base);
  }, 60_000);
});
