import { createServer, type Server } from 'node:http';
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
  it('UC-DEPLOY-03: passes when healthz, discovery and the MCP auth challenge behave', async () => {
    const base = await serve((req, res) => {
      if (req.url === '/healthz') return void res.writeHead(200).end('{}');
      if (req.url === '/.well-known/oauth-protected-resource') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ resource: 'r', authorization_servers: ['a'] }));
      }
      if (req.url === '/mcp') return void res.writeHead(401, { 'www-authenticate': 'Bearer' }).end();
      res.writeHead(404).end();
    });
    const results = await runSmoke(base, ['healthz', 'oauth-protected-resource', 'mcp-requires-auth']);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('UC-DEPLOY-03: fails each check that gets the wrong answer', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(500).end('nope');
    });
    const results = await runSmoke(base, ['healthz', 'oauth-protected-resource', 'mcp-requires-auth']);
    expect(results.map((r) => r.ok)).toEqual([false, false, false]);
  });

  it('UC-DEPLOY-03: reports a failure when the service cannot be reached', async () => {
    const results = await runSmoke('http://127.0.0.1:1', ['healthz']);
    expect(results[0]?.ok).toBe(false);
  });
});
