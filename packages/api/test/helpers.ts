import { Writable } from 'node:stream';
import type { Express, RequestHandler } from 'express';
import { createApp } from '../src/app.js';
import { createDatabase, type Database } from '../src/common/db.js';
import { HttpError } from '../src/common/errors.js';
import { createLogger } from '../src/common/logger.js';

import { TEST_DATABASE_URL } from './urls.js';
export { TEST_DATABASE_URL };

/** Collects log lines written by a real pino logger. */
export function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { lines, logger: createLogger('debug', stream) };
}

/**
 * Test-only stand-in for sign-in: the caller is named by `X-Test-Owner` (a UUID).
 * It lives in `test/`, so it can never be part of the production build.
 */
export const stubAuthenticate: RequestHandler = (req, res, next) => {
  const id = req.header('x-test-owner');
  if (!id) return next(new HttpError(401, 'Unauthorized'));
  const pageSize = req.header('x-test-page-size');
  res.locals['owner'] = {
    id,
    timezone: req.header('x-test-timezone') ?? 'UTC',
    pageSize: pageSize ? Number(pageSize) : undefined,
  };
  next();
};

export function buildTestApp(extend?: (app: Express) => void) {
  const database: Database = createDatabase(TEST_DATABASE_URL);
  const logs = captureLogs();
  const app = createApp({ logger: logs.logger, ping: database.ping, db: database.db, authenticate: stubAuthenticate, extend });
  return { app, database, logs };
}
