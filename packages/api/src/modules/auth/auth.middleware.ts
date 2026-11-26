import type { Request, RequestHandler } from 'express';
import { HttpError } from '../../common/errors.js';
import { readCookie } from './cookies.js';
import type { Claims } from './jwt.js';
import { PENDING_COOKIE, type PendingSignup } from './pending-signup.js';

export const SESSION_COOKIE = '__Host-session';

export interface AuthUser {
  id: string;
  timezone: string;
  pageSize: number;
}

/** A request that has passed through `authenticate`; `user` is set once the caller has signed up. */
export type AuthedRequest = Request & { user?: AuthUser };

export interface SessionPort {
  /** Checks and records a Bearer sign-in for a signed-up user; rejects with 401 when it is over. */
  bearer(userId: string, claims: Claims): Promise<{ id: string; userId: string; clientType: string }>;
  /** Checks and records a web cookie session; rejects with 401 when it is over. */
  web(cookie: string): Promise<{ id: string; userId: string; clientType: string }>;
}

const UNSAFE = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

/** CSRF rules for cookie-authenticated writes (UC-AUTH-10). */
export function csrfCheck(req: Request, appOrigin: string): void {
  if (!UNSAFE.has(req.method)) return;
  const origin = req.header('origin');
  if (!req.header('x-requested-with') || (origin !== undefined && origin !== appOrigin)) {
    throw new HttpError(403, 'Forbidden', 'Cross-site request rejected');
  }
}

export function createAuthMiddleware<U extends AuthUser>({
  verify,
  findUser,
  findUserById,
  sessions,
  pending,
  signupUrl,
  appOrigin,
}: {
  verify: (token: string) => Promise<Claims>;
  findUser: (sub: string) => Promise<U | undefined>;
  findUserById: (id: string) => Promise<U | undefined>;
  sessions: SessionPort;
  pending: PendingSignup;
  signupUrl: string;
  appOrigin: string;
}): {
  authenticate: RequestHandler;
  authenticateMcp: RequestHandler;
  requireUser: RequestHandler;
  requireWebSession: RequestHandler;
} {
  async function viaBearer(req: Request, res: Parameters<RequestHandler>[1], token: string) {
    let claims: Claims;
    try {
      claims = await verify(token);
    } catch {
      throw new HttpError(401, 'Unauthorized');
    }
    res.locals['identity'] = { sub: claims.sub, email: claims.email };
    res.locals['authKind'] = 'bearer';
    const user = await findUser(claims.sub);
    if (user) {
      res.locals['session'] = await sessions.bearer(user.id, claims);
      res.locals['user'] = user;
      (req as AuthedRequest).user = user;
    }
  }

  async function viaCookie(req: Request, res: Parameters<RequestHandler>[1], cookie: string) {
    csrfCheck(req, appOrigin);
    const session = await sessions.web(cookie);
    const user = await findUserById(session.userId);
    if (!user) throw new HttpError(401, 'Unauthorized');
    res.locals['authKind'] = 'cookie';
    res.locals['session'] = session;
    res.locals['user'] = user;
    (req as AuthedRequest).user = user;
  }

  /** Only POST /profile accepts the sealed pending sign-up cookie (UC-SIGNUP-07). */
  async function viaPending(req: Request, res: Parameters<RequestHandler>[1], value: string) {
    csrfCheck(req, appOrigin);
    const identity = pending.read(value);
    if (!identity) throw new HttpError(401, 'Unauthorized');
    res.locals['identity'] = { sub: identity.sub, email: identity.email };
    res.locals['authKind'] = 'pending';
  }

  const authenticate: RequestHandler = (req, res, next) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    const cookie = readCookie(req.header('cookie'), SESSION_COOKIE);
    const pendingCookie =
      req.method === 'POST' && req.path === '/profile' ? readCookie(req.header('cookie'), PENDING_COOKIE) : undefined;
    const run = bearer?.[1]
      ? viaBearer(req, res, bearer[1])
      : cookie
        ? viaCookie(req, res, cookie)
        : pendingCookie
          ? viaPending(req, res, pendingCookie)
          : Promise.reject(new HttpError(401, 'Unauthorized'));
    run.then(() => next(), next);
  };

  /** `/mcp` takes Bearer tokens only, and a refusal tells the client where to start a sign-in (UC-AUTH-06). */
  const challenge = `Bearer resource_metadata="${appOrigin}/.well-known/oauth-protected-resource"`;
  const authenticateMcp: RequestHandler = (req, res, next) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    const refuse = (err: unknown) => {
      if (err instanceof HttpError && err.status === 401) res.setHeader('WWW-Authenticate', challenge);
      next(err);
    };
    if (!bearer?.[1]) return refuse(new HttpError(401, 'Unauthorized'));
    viaBearer(req, res, bearer[1]).then(() => next(), refuse);
  };

  const requireUser: RequestHandler = (req, res, next) => {
    const user = (req as AuthedRequest).user;
    if (!user) {
      return next(
        new HttpError(403, 'Sign-up required', 'Create your profile before using the app', {
          type: '/problems/signup-required',
          extra: { signupUrl },
        }),
      );
    }
    res.locals['owner'] = { id: user.id, timezone: user.timezone, pageSize: user.pageSize };
    next();
  };

  /** Profile edits, heartbeat and sign-out-everywhere are for the web app only (UC-PROFILE-12). */
  const requireWebSession: RequestHandler = (_req, res, next) => {
    if (res.locals['authKind'] !== 'cookie') {
      return next(new HttpError(403, 'Forbidden', 'This action is only available from the web app'));
    }
    next();
  };

  return { authenticate, authenticateMcp, requireUser, requireWebSession };
}
