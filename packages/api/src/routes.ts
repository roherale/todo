import { Router, type RequestHandler } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger } from 'pino';
import { createTasksModule } from './modules/tasks/index.js';

export interface RouteDeps {
  ping: () => Promise<void>;
  logger: Logger;
  db: NodePgDatabase;
  /** Resolves who is calling and sets `res.locals.owner`; answers 401 otherwise. */
  authenticate: RequestHandler;
}

export function routes({ ping, logger, db, authenticate }: RouteDeps): Router {
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

  const tasks = createTasksModule({ db });
  router.use('/api/v1', authenticate, tasks.router);

  return router;
}
