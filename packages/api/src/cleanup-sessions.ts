import { createDatabase } from './common/db.js';
import { createSessionsModule } from './modules/sessions/index.js';

/** Deploy step: deletes every ended or expired session. Active sessions are never touched. */
async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const database = createDatabase(url);
  try {
    const sessions = createSessionsModule({
      db: database.db,
      key: { key: Buffer.alloc(32), version: 1 }, // cleanup never decrypts anything
      now: () => new Date(),
    });
    const deleted = await sessions.service.cleanup();
    console.log(`removed ${deleted} ended or expired sessions`);
  } finally {
    await database.pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'cleanup failed');
  process.exit(1);
});
