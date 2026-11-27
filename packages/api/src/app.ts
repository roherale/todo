import express, { type Express } from 'express';
import type { JSONWebKeySet } from 'jose';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Config } from './common/config.js';
import type { IdentityProvider } from './modules/auth/index.js';
import { createErrorHandler, notFoundHandler } from './common/errors.js';
import { requestId } from './common/request-id.js';
import { routes } from './routes.js';

export interface AppDeps {
  logger: Logger;
  ping: () => Promise<void>;
  db: NodePgDatabase;
  config: Config;
  testKeys?: JSONWebKeySet | undefined;
  now?: (() => Date) | undefined;
  provider?: IdentityProvider | undefined;
  refresh?: ((refreshToken: string) => Promise<string>) | undefined;
  /** Extra routes, mounted before the 404 handler (used by tests for error paths). */
  extend?: (app: Express) => void;
}

/** The built web app: static files, plus index.html for client-side routes (never for API paths). */
function serveWeb(app: Express, dir: string): void {
  app.use(express.static(dir, { index: false }));
  app.get(/^\/(?!api\/|auth\/|mcp|health(?:\/|$)|\.well-known\/).*/, (_req, res, next) => {
    res.sendFile('index.html', { root: dir }, (err) => {
      if (err) next();
    });
  });
}

/** Builds the Express app without listening, so tests can drive it directly. */
export function createApp({ logger, ping, db, config, testKeys, now, provider, refresh, extend }: AppDeps): Express {
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
  const webDir = config.WEB_DIST_DIR;
  app.use(routes({ ping, logger, db, config, testKeys, now, provider, refresh }));
  extend?.(app);
  if (webDir) serveWeb(app, webDir);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
