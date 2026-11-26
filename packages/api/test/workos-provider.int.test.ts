import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkosProvider } from '../src/modules/auth/index.js';

/** A local HTTP server that speaks just enough of the identity provider's API for the real SDK. */
let server: Server | undefined;
const seen: { path: string; body: Record<string, string> }[] = [];

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const user = {
  object: 'user',
  id: 'user_01',
  email: 'ana@example.test',
  email_verified: true,
  first_name: null,
  last_name: null,
  profile_picture_url: null,
  last_sign_in_at: null,
  external_id: null,
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

async function provider(respond: (grant: string, body: Record<string, string>) => { status: number; body: object }) {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as Record<string, string>;
      seen.push({ path: req.url ?? '', body });
      const result = respond(body['grant_type'] ?? '', body);
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return createWorkosProvider({
    apiKey: 'sk_test_fake',
    clientId: 'client_fake',
    redirectUri: 'https://app.example.test/auth/callback',
    returnTo: 'https://app.example.test/',
    endpoint: { apiHostname: '127.0.0.1', https: false, port },
  });
}

afterEach(() => {
  server?.close();
  server = undefined;
  seen.length = 0;
});

describe('identity provider adapter', () => {
  it('UC-AUTH-09: the sign-in URL carries the client id, redirect URI and state', async () => {
    const p = await provider(() => ({ status: 200, body: {} }));
    const url = new URL(p.authorizationUrl('state-123'));
    expect(url.searchParams.get('client_id')).toBe('client_fake');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.test/auth/callback');
    expect(url.searchParams.get('state')).toBe('state-123');
  });

  it('UC-AUTH-09: exchanging a code returns the user id, email and refresh token', async () => {
    const p = await provider(() => ({
      status: 200,
      body: { user, access_token: jwt({ sid: 'session_01' }), refresh_token: 'refresh-1' },
    }));
    await expect(p.exchangeCode('the-code')).resolves.toEqual({
      sub: 'user_01',
      email: 'ana@example.test',
      displayName: null,
      refreshToken: 'refresh-1',
    });
    expect(seen[0]?.body).toMatchObject({ grant_type: 'authorization_code', code: 'the-code', client_id: 'client_fake' });
  });

  it('UC-AUTH-09: a refused code rejects', async () => {
    const p = await provider(() => ({ status: 400, body: { error: 'invalid_grant' } }));
    await expect(p.exchangeCode('bad')).rejects.toThrow();
  });

  it('UC-SESSION-18: refreshing returns the rotated token, and a refusal rejects', async () => {
    const ok = await provider(() => ({
      status: 200,
      body: { user, access_token: jwt({ sid: 'session_01' }), refresh_token: 'refresh-2' },
    }));
    await expect(ok.refresh('refresh-1')).resolves.toBe('refresh-2');
    expect(seen[0]?.body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1' });
    server?.close();
    const refused = await provider(() => ({ status: 400, body: { error: 'invalid_grant' } }));
    await expect(refused.refresh('revoked')).rejects.toThrow();
  });

  it('UC-AUTH-11: the sign-out URL is built from the session id in the access token', async () => {
    const p = await provider(() => ({
      status: 200,
      body: { user, access_token: jwt({ sid: 'session_99' }), refresh_token: 'refresh-3' },
    }));
    const url = new URL((await p.logoutUrl('refresh-2'))!);
    expect(url.searchParams.get('session_id')).toBe('session_99');
    expect(url.searchParams.get('return_to')).toBe('https://app.example.test/');
  });

  it('UC-AUTH-11: no sign-out URL when the token has no session id or the refresh is refused', async () => {
    const noSid = await provider(() => ({ status: 200, body: { user, access_token: jwt({}), refresh_token: 'r' } }));
    await expect(noSid.logoutUrl('x')).resolves.toBeUndefined();
    server?.close();
    const noPayload = await provider(() => ({ status: 200, body: { user, access_token: 'nodots', refresh_token: 'r' } }));
    await expect(noPayload.logoutUrl('x')).resolves.toBeUndefined();
    server?.close();
    const refused = await provider(() => ({ status: 400, body: { error: 'invalid_grant' } }));
    await expect(refused.logoutUrl('x')).resolves.toBeUndefined();
  });

  it('UC-SIGNUP-08: the display name comes from the provider profile, joining first and last name', async () => {
    const named = { ...user, first_name: 'Ana', last_name: 'Lopez' };
    const p = await provider(() => ({ status: 200, body: { user: named, access_token: jwt({}), refresh_token: 'r' } }));
    expect((await p.exchangeCode('c')).displayName).toBe('Ana Lopez');
    server?.close();
    const firstOnly = await provider(() => ({
      status: 200,
      body: { user: { ...user, first_name: 'Ana' }, access_token: jwt({}), refresh_token: 'r' },
    }));
    expect((await firstOnly.exchangeCode('c')).displayName).toBe('Ana');
  });
});
