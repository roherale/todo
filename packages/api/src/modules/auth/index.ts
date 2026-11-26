import type { RequestHandler, Router } from 'express';
import type { JSONWebKeySet } from 'jose';
import type { Config } from '../../common/config.js';
import { createAuthMiddleware, type AuthUser, type SessionPort } from './auth.middleware.js';
import { createAuthRouter } from './auth.routes.js';
import { clearCookie } from './cookies.js';
import type { IdentityProvider } from './identity-provider.js';
import { createTokenVerifier } from './jwt.js';
import { PENDING_COOKIE, createPendingSignup, type Sealer } from './pending-signup.js';

export { createTestSigner, type TestSigner } from './test-signer.js';
export { createWorkosProvider } from './workos-provider.js';
export { SESSION_COOKIE } from './auth.middleware.js';
export { PENDING_COOKIE } from './pending-signup.js';
export type { AuthUser, AuthedRequest, SessionPort } from './auth.middleware.js';
export type { IdentityProvider } from './identity-provider.js';
export type { Sealer } from './pending-signup.js';

export interface AuthModule {
  authenticate: RequestHandler;
  requireUser: RequestHandler;
  requireWebSession: RequestHandler;
  finishPendingSignup: RequestHandler;
  /** The /auth routes; undefined when no identity provider is configured. */
  router: Router | undefined;
}

export function createAuthModule<U extends AuthUser>({
  config,
  findUser,
  findUserById,
  sessions,
  webSignIn,
  sealer,
  now,
  testKeys,
}: {
  config: Config;
  findUser: (sub: string) => Promise<U | undefined>;
  findUserById: (id: string) => Promise<U | undefined>;
  sessions: SessionPort;
  /** The web sign-in flow. Absent when no identity provider is configured, so /auth is not mounted. */
  webSignIn?:
    | {
        provider: IdentityProvider;
        startWeb(userId: string, refreshToken: string): Promise<string>;
        endWeb(cookie: string): Promise<{ refreshToken?: string } | undefined>;
      }
    | undefined;
  sealer: Sealer;
  now: () => Date;
  /** Trusted only when `config.NODE_ENV` is `test`. */
  testKeys?: JSONWebKeySet | undefined;
}): AuthModule {
  const verify = createTokenVerifier({
    issuer: config.WORKOS_ISSUER ?? '',
    audience: config.WORKOS_AUDIENCE ?? '',
    jwksUrl: config.WORKOS_JWKS_URL,
    testKeys,
    testMode: config.NODE_ENV === 'test',
  });
  const pending = createPendingSignup(sealer, now);
  const middleware = createAuthMiddleware({
    verify,
    findUser,
    findUserById,
    sessions,
    pending,
    signupUrl: `${config.APP_ORIGIN}/signup`,
    appOrigin: config.APP_ORIGIN,
  });

  /** After a sign-up made with the pending cookie: clear it and send the browser back to sign in. */
  const finishPendingSignup: RequestHandler = (_req, res, next) => {
    if (res.locals['authKind'] !== 'pending') return next();
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 201) {
        clearCookie(res, PENDING_COOKIE);
        res.location('/auth/login');
      }
      return json(body);
    };
    next();
  };

  const router = webSignIn
    ? createAuthRouter({
        provider: webSignIn.provider,
        appOrigin: config.APP_ORIGIN,
        pending,
        startWeb: webSignIn.startWeb,
        endWeb: webSignIn.endWeb,
        findUserBySub: findUser,
      })
    : undefined;

  return { ...middleware, finishPendingSignup, router };
}
