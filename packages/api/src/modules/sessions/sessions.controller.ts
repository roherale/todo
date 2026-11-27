import type { RequestHandler } from 'express';
import type { SessionContext, SessionsService } from './sessions.service.js';

export type SessionsController = Record<'heartbeat' | 'endAll', RequestHandler>;

export function createSessionsController(service: SessionsService): SessionsController {
  return {
    heartbeat(_req, res, next) {
      service.heartbeat(res.locals['session'] as SessionContext).then(() => res.status(204).end(), next);
    },
    endAll(_req, res, next) {
      const session = res.locals['session'] as SessionContext;
      service.endAll(session.userId).then(() => res.status(204).end(), next);
    },
  };
}
