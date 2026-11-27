import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL } from './urls.js';

const run = promisify(execFile);
const apiDir = new URL('..', import.meta.url).pathname;
const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')) as { entries: unknown[] };

const admin = new pg.Pool({ connectionString: TEST_DATABASE_URL });
const created: string[] = [];

afterAll(async () => {
  for (const name of created) await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.end();
});

async function emptyDatabase(): Promise<string> {
  const name = `migration_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await admin.query(`create database "${name}"`);
  created.push(name);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Runs the same command the deploy runs. */
const migrate = (env: Record<string, string>) =>
  run('pnpm', ['exec', 'drizzle-kit', 'migrate'], { cwd: apiDir, env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...env } });

async function snapshot(url: string) {
  const db = new pg.Pool({ connectionString: url });
  try {
    const applied = await db.query('select count(*)::int as n from drizzle.__drizzle_migrations');
    const tables = await db.query("select table_name from information_schema.tables where table_schema = 'public' order by table_name");
    return { applied: applied.rows[0].n as number, tables: tables.rows.map((r) => r.table_name as string) };
  } finally {
    await db.end();
  }
}

describe('deploy migrations', () => {
  it('UC-DEPLOY-13: against an empty database it applies every migration, and running it again changes nothing', async () => {
    const url = await emptyDatabase();
    await migrate({ DATABASE_URL: url });
    const first = await snapshot(url);
    expect(first.applied).toBe(journal.entries.length);
    expect(first.tables).toEqual(['sessions', 'task_counters', 'tasks', 'users']);

    await migrate({ DATABASE_URL: url });
    expect(await snapshot(url)).toEqual(first);
  }, 90_000);

  it('UC-DEPLOY-13: without DATABASE_URL it fails with a message that names the variable', async () => {
    const result = await migrate({}).then(
      () => ({ failed: false, output: '' }),
      (err: { stderr?: string; stdout?: string }) => ({ failed: true, output: `${err.stderr ?? ''}${err.stdout ?? ''}` }),
    );
    expect(result.failed).toBe(true);
    expect(result.output).toContain('DATABASE_URL');
  }, 60_000);
});
