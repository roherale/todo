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

  it('UC-OPS-04: in production, the identity provider settings and the sign-up allowlist are required', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', NODE_ENV: 'production' })).toThrowError(
      /WORKOS_ISSUER, WORKOS_AUDIENCE, WORKOS_JWKS_URL, SESSION_ENCRYPTION_KEY, ALLOWED_SIGNUP_EMAILS/,
    );
    const config = loadConfig({
      DATABASE_URL: 'postgres://x',
      NODE_ENV: 'production',
      WORKOS_ISSUER: 'https://auth.example.com',
      WORKOS_AUDIENCE: 'client',
      WORKOS_JWKS_URL: 'https://auth.example.com/jwks',
      SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      ALLOWED_SIGNUP_EMAILS: 'a@example.com',
    });
    expect(config.NODE_ENV).toBe('production');
  });

  it('UC-SESSION-17: startup fails when the session key is the wrong length, in any environment', () => {
    const short = Buffer.alloc(16).toString('base64');
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', SESSION_ENCRYPTION_KEY: short })).toThrowError(
      /SESSION_ENCRYPTION_KEY/,
    );
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', SESSION_ENCRYPTION_KEY: 'not base64 at all!!' })).toThrowError(
      /SESSION_ENCRYPTION_KEY/,
    );
  });

  it('UC-SESSION-17: startup fails in production when the session key is missing', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', NODE_ENV: 'production' })).toThrowError(/SESSION_ENCRYPTION_KEY/);
  });
});
