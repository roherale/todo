import { readFileSync } from 'node:fs';

/** Returns the FROM lines that are not pinned by an @sha256: digest. */
export function unpinnedFromLines(dockerfile: string): string[] {
  return dockerfile
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^FROM\s/i.test(l))
    .filter((l) => !/@sha256:[0-9a-f]{64}/.test(l));
}

function main(): void {
  const bad = unpinnedFromLines(readFileSync(process.argv[2] ?? 'Dockerfile', 'utf8'));
  if (bad.length > 0) {
    console.error(`FROM lines not pinned by digest:\n${bad.join('\n')}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('check-pins.ts')) main();
