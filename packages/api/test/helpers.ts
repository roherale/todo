import { Writable } from 'node:stream';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { createDatabase, type Database } from '../src/common/db.js';
import { createLogger } from '../src/common/logger.js';

export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5433/postgres';

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

export function buildTestApp(extend?: (app: Express) => void) {
  const database: Database = createDatabase(TEST_DATABASE_URL);
  const logs = captureLogs();
  const app = createApp({ logger: logs.logger, ping: database.ping, extend });
  return { app, database, logs };
}
