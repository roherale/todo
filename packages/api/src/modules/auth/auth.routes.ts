import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { HttpError } from '../../common/errors.js';
import { SESSION_COOKIE, csrfCheck } from './auth.middleware.js';
import { clearCookie, readCookie, setCookie } from './cookies.js';
import type { IdentityProvider } from './identity-provider.js';
import type { PendingSignup } from './pending-signup.js';
import { PENDING_COOKIE } from './pending-signup.js';

export const STATE_COOKIE = '__Host-oauth-state';
const WEB_SESSION_MAX_AGE_S = 24 * 60 * 60;

export interface AuthRoutesDeps {
  provider: IdentityProvider;
  appOrigin: string;
  pending: PendingSignup;
  /** Starts a web session for a signed-up user and returns the raw cookie value. */
  startWeb(userId: string, refreshToken: string): Promise<string>;
  /** Ends the web session behind a cookie; returns its refresh token if it had one. */
  endWeb(cookie: string): Promise<{ refreshToken?: string } | undefined>;
  findUserBySub(sub: string): Promise<{ id: string } | undefined>;
}

function sameValue(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Browser-facing sign-in routes. They never put a token in a body or a readable cookie. */
export function createAuthRouter(deps: AuthRoutesDeps): Router {
  const router = Router();

  router.get('/login', (_req, res) => {
    const state = randomBytes(24).toString('base64url');
    setCookie(res, STATE_COOKIE, state, 10 * 60);
    res.redirect(302, deps.provider.authorizationUrl(state));
  });

  router.get('/callback', (req, res, next) => {
    const cookies = req.header('cookie');
    const expected = readCookie(cookies, STATE_COOKIE);
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string' || !expected || !sameValue(state, expected)) {
      return next(new HttpError(400, 'Bad Request', 'Invalid sign-in response'));
    }
    deps.provider
      .exchangeCode(code)
      .catch(() => {
        throw new HttpError(401, 'Unauthorized');
      })
      .then(async (identity) => {
        clearCookie(res, STATE_COOKIE);
        // A cookie sent before sign-in is ignored: every sign-in mints a new session id.
        const user = await deps.findUserBySub(identity.sub);
        if (user) {
          const value = await deps.startWeb(user.id, identity.refreshToken);
          setCookie(res, SESSION_COOKIE, value, WEB_SESSION_MAX_AGE_S);
          res.redirect(302, '/');
        } else {
          setCookie(res, PENDING_COOKIE, deps.pending.create({ sub: identity.sub, email: identity.email, displayName: identity.displayName }), 15 * 60);
          res.redirect(302, '/signup');
        }
      })
      .catch(next);
  });

  /** What the sign-up form may pre-fill. Never the sub, never a token. */
  router.get('/pending-signup', (req, res, next) => {
    const sealed = readCookie(req.header('cookie'), PENDING_COOKIE);
    const identity = sealed ? deps.pending.read(sealed) : undefined;
    if (!identity) return next(new HttpError(401, 'Unauthorized'));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ email: identity.email, displayName: identity.displayName });
  });

  router.post('/logout', (req, res, next) => {
    const cookie = readCookie(req.header('cookie'), SESSION_COOKIE);
    try {
      csrfCheck(req, deps.appOrigin);
    } catch (err) {
      return next(err);
    }
    clearCookie(res, SESSION_COOKIE);
    if (!cookie) return void res.status(204).end();
    deps
      .endWeb(cookie)
      .then(async (ended) => {
        if (!ended) return void res.status(204).end();
        const logoutUrl = ended.refreshToken ? await deps.provider.logoutUrl(ended.refreshToken) : undefined;
        res.status(200).json({ logoutUrl: logoutUrl ?? null });
      })
      .catch(next);
  });

  return router;
}
