import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('UC-OPS-04: names the missing variable in the error', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('UC-OPS-04: names an invalid variable in the error', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', PORT: 'abc' })).toThrowError(/PORT/);
  });

  it('UC-OPS-04: applies defaults when only required variables are set', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(config.PORT).toBe(8080);
  });

  it('UC-OPS-04: the process exits non-zero and prints the variable name at startup', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', new URL('../main.ts', import.meta.url).pathname],
      { env: { PATH: process.env['PATH'] ?? '' }, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL');
  });
});
