import type { Request, RequestHandler } from 'express';
import { HttpError } from '../../common/errors.js';
import type { Claims } from './jwt.js';

export interface AuthUser {
  id: string;
  timezone: string;
  pageSize: number;
}

/** A request that has passed through `authenticate`; `user` is set once the caller has signed up. */
export type AuthedRequest = Request & { user?: AuthUser };

export function createAuthMiddleware<U extends AuthUser>({
  verify,
  findUser,
  signupUrl,
}: {
  verify: (token: string) => Promise<Claims>;
  findUser: (sub: string) => Promise<U | undefined>;
  signupUrl: string;
}): { authenticate: RequestHandler; requireUser: RequestHandler } {
  const authenticate: RequestHandler = (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!match?.[1]) return next(new HttpError(401, 'Unauthorized'));
    const authed = req as AuthedRequest;
    verify(match[1])
      .catch(() => {
        throw new HttpError(401, 'Unauthorized');
      })
      .then(async (claims) => {
        res.locals['identity'] = { sub: claims.sub, email: claims.email };
        res.locals['authKind'] = 'bearer';
        const user = await findUser(claims.sub);
        if (user) {
          res.locals['user'] = user;
          authed.user = user;
        }
        next();
      })
      .catch(next);
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

  return { authenticate, requireUser };
}
