import { HttpError } from './common/errors.js';
import { createApp } from './app.js';
import { loadConfig } from './common/config.js';
import { createDatabase } from './common/db.js';
import { createLogger } from './common/logger.js';
import { createShutdown } from './common/shutdown.js';

function main(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'Invalid configuration');
    process.exit(1);
  }

  const logger = createLogger(config.LOG_LEVEL);
  const database = createDatabase(config.DATABASE_URL);
  const app = createApp({
    logger,
    ping: database.ping,
    db: database.db,
    // Real sign-in arrives with the auth milestone; until then the API answers 401 to everyone.
    authenticate: (_req, _res, next) => next(new HttpError(401, 'Unauthorized')),
  });
  const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'listening'));

  const shutdown = createShutdown(server, () => database.pool.end());
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    shutdown().then(
      () => process.exit(0),
      (err: unknown) => {
        logger.error({ err }, 'shutdown failed');
        process.exit(1);
      },
    );
  });
}

main();
