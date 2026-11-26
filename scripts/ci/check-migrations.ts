import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Removes line comments and block comments from SQL.
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const DESTRUCTIVE = [/\bDROP\b/i, /\bRENAME\b/i, /\bALTER\b[^;]*\bTYPE\b/i];

export function isDestructive(sql: string): boolean {
  const clean = stripSqlComments(sql);
  return DESTRUCTIVE.some((re) => re.test(clean));
}

export interface MigrationCheck {
  ok: boolean;
  offending: string[];
}

export function checkMigrations(
  files: { path: string; sql: string }[],
  approved: boolean,
): MigrationCheck {
  const offending = files.filter((f) => isDestructive(f.sql)).map((f) => f.path);
  return { ok: approved || offending.length === 0, offending };
}

function main(): void {
  const [base = 'origin/main', approvedFlag = 'false'] = process.argv.slice(2);
  const added = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', 'packages/api/drizzle/*.sql'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  const result = checkMigrations(
    added.map((path) => ({ path, sql: readFileSync(path, 'utf8') })),
    approvedFlag === 'true',
  );
  if (!result.ok) {
    console.error(
      `Destructive SQL in: ${result.offending.join(', ')}. Add the migration-contract-approved label.`,
    );
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('check-migrations.ts')) main();
