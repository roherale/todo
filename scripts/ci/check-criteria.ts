import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';


/** Criterion IDs defined in the use-case tables (withdrawn, struck-through ones are skipped). */
export function definedCriteria(markdown: string): string[] {
  const ids: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = /^\|\s*(UC-[A-Z]+-\d{2})\s*\|/.exec(line);
    if (m?.[1] && !/Withdrawn/.test(line)) ids.push(m[1]);
  }
  return ids;
}

/** IDs that appear in test names or workflow step names. */
export function coveredCriteria(sources: string[]): Set<string> {
  const covered = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/(?:it|test)\(\s*['"`](UC-[A-Z]+-\d{2})\b/g)) covered.add(m[1] as string);
    for (const m of src.matchAll(/name:\s*["']?(UC-[A-Z]+-\d{2})\b/g)) covered.add(m[1] as string);
  }
  return covered;
}

export function missingCriteria(defined: string[], covered: Set<string>, areas: string[]): string[] {
  return defined.filter((id) => areas.includes(id.split('-')[1] as string) && !covered.has(id));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.ts$|\.ya?ml$/.test(name)) out.push(p);
  }
  return out;
}

function main(): void {
  const areas = (process.argv[2] ?? '').split(',').filter(Boolean);
  const defined = readdirSync('docs/use-cases')
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) => definedCriteria(readFileSync(join('docs/use-cases', f), 'utf8')));
  const sources = ['packages', 'scripts', '.github'].flatMap((d) => walk(d)).map((p) => readFileSync(p, 'utf8'));
  const missing = missingCriteria(defined, coveredCriteria(sources), areas);
  if (missing.length > 0) {
    console.error(`Criteria without a test: ${missing.join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('check-criteria.ts')) main();
