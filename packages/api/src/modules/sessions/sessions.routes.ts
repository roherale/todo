import { Router } from 'express';
import type { SessionsController } from './sessions.controller.js';

export function createSessionsRouter(c: SessionsController): Router {
  const router = Router();
  router.post('/session/heartbeat', c.heartbeat);
  router.post('/sessions/end-all', c.endAll);
  return router;
}
