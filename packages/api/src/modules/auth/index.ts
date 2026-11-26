import type { JSONWebKeySet } from 'jose';
import type { Config } from '../../common/config.js';
import { createAuthMiddleware, type AuthUser } from './auth.middleware.js';
import { createTokenVerifier } from './jwt.js';

export { createTestSigner, type TestSigner } from './test-signer.js';
export type { AuthUser, AuthedRequest } from './auth.middleware.js';

export function createAuthModule<U extends AuthUser>({
  config,
  findUser,
  testKeys,
}: {
  config: Config;
  findUser: (sub: string) => Promise<U | undefined>;
  /** Trusted only when `config.NODE_ENV` is `test`. */
  testKeys?: JSONWebKeySet | undefined;
}) {
  const verify = createTokenVerifier({
    issuer: config.WORKOS_ISSUER ?? '',
    audience: config.WORKOS_AUDIENCE ?? '',
    jwksUrl: config.WORKOS_JWKS_URL,
    testKeys,
    testMode: config.NODE_ENV === 'test',
  });
  return createAuthMiddleware({ verify, findUser, signupUrl: `${config.APP_ORIGIN}/signup` });
}
