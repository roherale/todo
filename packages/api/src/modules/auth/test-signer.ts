import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import type { JSONWebKeySet } from 'jose';

const b64 = (input: Buffer | string) => Buffer.from(input).toString('base64url');

export interface TestSignerOptions {
  issuer: string;
  audience: string;
}

export interface TestTokenOverrides {
  sub?: string;
  email?: string | undefined;
  sid?: string;
  clientId?: string;
  authTime?: number;
  issuer?: string;
  audience?: string;
  /** Seconds from now; negative means already expired. */
  expiresIn?: number;
  /** Sign with a different key than the one published in `jwks`. */
  signWith?: KeyObject;
}

/**
 * Signs tokens with an ephemeral key. Only for tests: the API trusts these keys
 * solely when it is created with NODE_ENV=test (UC-AUTH-03).
 */
export function createTestSigner({ issuer, audience }: TestSignerOptions) {
  const kid = 'test-key-1';
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwks: JSONWebKeySet = {
    keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' }],
  };

  /** Synchronous, so test helpers can build request headers inline. */
  function signToken(overrides: TestTokenOverrides = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', typ: 'JWT', kid };
    const payload = {
      iss: overrides.issuer ?? issuer,
      aud: overrides.audience ?? audience,
      sub: overrides.sub ?? 'test|user',
      ...(overrides.email === undefined && 'email' in overrides ? {} : { email: overrides.email }),
      // Every token is a fresh sign-in unless the test pins a sid.
      sid: overrides.sid ?? randomUUID(),
      client_id: overrides.clientId ?? 'test-client',
      ...(overrides.authTime === undefined ? {} : { auth_time: overrides.authTime }),
      iat: now,
      exp: now + (overrides.expiresIn ?? 3600),
    };
    const data = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
    const signature = sign('sha256', Buffer.from(data), { key: overrides.signWith ?? privateKey, dsaEncoding: 'ieee-p1363' });
    return `${data}.${b64(signature)}`;
  }

  return { jwks, signToken };
}

export type TestSigner = ReturnType<typeof createTestSigner>;
