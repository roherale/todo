import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { JSONWebKeySet } from 'jose';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger } from 'pino';
import type { Config } from './common/config.js';
import { createAuthModule } from './modules/auth/index.js';
import { createSessionsModule, parseSessionKey } from './modules/sessions/index.js';
import { createTasksModule } from './modules/tasks/index.js';
import { createUsersModule } from './modules/users/index.js';

export interface RouteDeps {
  ping: () => Promise<void>;
  logger: Logger;
  db: NodePgDatabase;
  config: Config;
  /** Test-signer keys; ignored unless `config.NODE_ENV` is `test`. */
  testKeys?: JSONWebKeySet | undefined;
  now?: (() => Date) | undefined;
  /** Exchanges a stored refresh token for a rotated one; rejects when the provider refuses it. */
  refresh?: ((refreshToken: string) => Promise<string>) | undefined;
}

export function routes({ ping, logger, db, config, testKeys, now, refresh }: RouteDeps): Router {
  const router = Router();

  router.get('/healthz', async (_req, res) => {
    try {
      await ping();
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      logger.error({ err, requestId: res.locals['requestId'] }, 'health check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const users = createUsersModule({ db, allowedSignupEmails: config.ALLOWED_SIGNUP_EMAILS });
  const sessions = createSessionsModule({
    db,
    key: {
      // Outside production a missing key gives each process its own, so sessions end on restart.
      key: config.SESSION_ENCRYPTION_KEY ? parseSessionKey(config.SESSION_ENCRYPTION_KEY) : randomBytes(32),
      version: config.SESSION_KEY_VERSION,
    },
    now: now ?? (() => new Date()),
    cliClientId: config.CLI_CLIENT_ID,
    refresh,
  });
  const auth = createAuthModule({
    config,
    findUser: users.service.findByWorkosId,
    findUserById: users.service.findById,
    sessions: {
      bearer: (userId, claims) => sessions.service.authenticateBearer(userId, claims),
      web: (cookie) => sessions.service.authenticateWeb(cookie),
    },
    testKeys,
  });
  const tasks = createTasksModule({ db });

  const v1 = Router();
  v1.use(auth.authenticate);
  v1.use(users.signupRouter); // a verified token is enough to sign up
  v1.use(auth.requireUser); // everything below needs a profile
  v1.use(users.profileRouter);
  v1.use(['/session', '/sessions'], auth.requireWebSession);
  v1.use(sessions.router);
  v1.use(tasks.router);
  router.use('/api/v1', v1);

  return router;
}
