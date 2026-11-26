import { Router } from 'express';
import type { JSONWebKeySet } from 'jose';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger } from 'pino';
import type { Config } from './common/config.js';
import { createAuthModule } from './modules/auth/index.js';
import { createTasksModule } from './modules/tasks/index.js';
import { createUsersModule } from './modules/users/index.js';

export interface RouteDeps {
  ping: () => Promise<void>;
  logger: Logger;
  db: NodePgDatabase;
  config: Config;
  /** Test-signer keys; ignored unless `config.NODE_ENV` is `test`. */
  testKeys?: JSONWebKeySet | undefined;
}

export function routes({ ping, logger, db, config, testKeys }: RouteDeps): Router {
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
  const auth = createAuthModule({ config, findUser: users.service.findByWorkosId, testKeys });
  const tasks = createTasksModule({ db });

  const v1 = Router();
  v1.use(auth.authenticate);
  v1.use(users.signupRouter); // a verified token is enough to sign up
  v1.use(auth.requireUser); // everything below needs a profile
  v1.use(users.profileRouter);
  v1.use(tasks.router);
  router.use('/api/v1', v1);

  return router;
}
