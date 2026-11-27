import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';

export interface Claims {
  sub: string;
  email?: string | undefined;
  sid?: string | undefined;
  clientId?: string | undefined;
  authTime?: number | undefined;
}

export interface VerifierOptions {
  issuer: string;
  audience: string;
  /** The identity provider's key set URL. */
  jwksUrl?: string | undefined;
  /** Extra trusted keys. Honoured only when `testMode` is true. */
  testKeys?: JSONWebKeySet | undefined;
  testMode: boolean;
}

export function createTokenVerifier(options: VerifierOptions): (token: string) => Promise<Claims> {
  const remote = options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : undefined;
  const local = options.testMode && options.testKeys ? createLocalJWKSet(options.testKeys) : undefined;

  const getKey: JWTVerifyGetKey = async (header, token) => {
    if (local) {
      try {
        return await local(header, token);
      } catch {
        // Not one of the test keys: fall through to the real key set.
      }
    }
    if (!remote) throw new Error('no key source');
    return remote(header, token);
  };

  return async (token) => {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ['RS256', 'ES256'],
    });
    if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('token has no subject');
    // Tokens for AI agents act on their own, not for a person, so they are not accepted (UC-AUTH-13).
    if (payload['sub_profile'] === 'ai_agent') throw new Error('agent tokens are not accepted');
    return {
      sub: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
      sid: typeof payload['sid'] === 'string' ? payload['sid'] : undefined,
      clientId: typeof payload['client_id'] === 'string' ? payload['client_id'] : undefined,
      authTime: typeof payload['auth_time'] === 'number' ? payload['auth_time'] : undefined,
    };
  };
}
