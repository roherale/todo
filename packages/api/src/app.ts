import express, { type Express } from 'express';
import type { JSONWebKeySet } from 'jose';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Config } from './common/config.js';
import { createErrorHandler, notFoundHandler } from './common/errors.js';
import { requestId } from './common/request-id.js';
import { routes } from './routes.js';

export interface AppDeps {
  logger: Logger;
  ping: () => Promise<void>;
  db: NodePgDatabase;
  config: Config;
  testKeys?: JSONWebKeySet | undefined;
  /** Extra routes, mounted before the 404 handler (used by tests for error paths). */
  extend?: (app: Express) => void;
}

/** Builds the Express app without listening, so tests can drive it directly. */
export function createApp({ logger, ping, db, config, testKeys, extend }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'https:'],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      // Path only: no query string, headers or body.
      logger.info(
        {
          requestId: res.locals['requestId'],
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - started,
        },
        'request',
      );
    });
    next();
  });
  app.use(routes({ ping, logger, db, config, testKeys }));
  extend?.(app);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
