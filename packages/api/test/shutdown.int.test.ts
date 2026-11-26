import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/common/db.js';
import { createShutdown } from '../src/common/shutdown.js';
import { TEST_DATABASE_URL } from './helpers.js';

describe('graceful shutdown', () => {
  it('UC-OPS-07: finishes in-flight requests, refuses new ones and closes the pool', async () => {
    const database = createDatabase(TEST_DATABASE_URL);
    await database.ping();
    const app = express();
    app.get('/slow', (_req, res) => {
      setTimeout(() => res.send('done'), 300);
    });
    const server: Server = app.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;

    const inFlight = fetch(`http://127.0.0.1:${port}/slow`).then((r) => r.text());
    await new Promise((r) => setTimeout(r, 50));

    let poolClosed = false;
    const shutdown = createShutdown(server, async () => {
      await database.pool.end();
      poolClosed = true;
    });
    const finished = shutdown();

    await expect(inFlight).resolves.toBe('done');
    await finished;
    expect(poolClosed).toBe(true);
    await expect(fetch(`http://127.0.0.1:${port}/slow`)).rejects.toThrow();
  });

  it('UC-OPS-07: the real process exits with code 0 on SIGTERM', async () => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', new URL('../src/main.ts', import.meta.url).pathname],
      {
        env: { PATH: process.env['PATH'] ?? '', DATABASE_URL: TEST_DATABASE_URL, PORT: '38123', LOG_LEVEL: 'info' },
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
    await new Promise<void>((resolve) => {
      child.stdout.on('data', (d: Buffer) => {
        if (d.toString().includes('listening')) resolve();
      });
    });
    child.kill('SIGTERM');
    const [code] = (await once(child, 'exit')) as [number | null];
    expect(code).toBe(0);
  });
});
