import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';

export interface Database {
  pool: pg.Pool;
  db: NodePgDatabase;
  /** Resolves when the database answers a trivial query; rejects otherwise. */
  ping(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
  // An idle client erroring must not crash the process.
  pool.on('error', () => undefined);
  const db = drizzle(pool);
  return {
    pool,
    db,
    async ping() {
      await db.execute(sql`select 1`);
    },
  };
}
