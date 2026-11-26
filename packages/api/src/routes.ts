import { Router } from 'express';
import type { Logger } from 'pino';

export function routes({ ping, logger }: { ping: () => Promise<void>; logger: Logger }): Router {
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

  return router;
}
