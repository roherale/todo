import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createShutdown } from './shutdown.js';

describe('createShutdown', () => {
  it('UC-OPS-07: rejects when releasing resources fails, and only runs once', async () => {
    const server = createServer().listen(0);
    await once(server, 'listening');
    let calls = 0;
    const shutdown = createShutdown(server, () => {
      calls += 1;
      return Promise.reject(new Error('pool failed'));
    });
    const first = shutdown();
    const second = shutdown();
    await expect(first).rejects.toThrow('pool failed');
    await expect(second).rejects.toThrow('pool failed');
    expect(calls).toBe(1);
  });

  it('UC-OPS-07: rejects when the server was never listening', async () => {
    const server = createServer();
    const shutdown = createShutdown(server, () => Promise.resolve());
    await expect(shutdown()).rejects.toThrow();
  });
});
