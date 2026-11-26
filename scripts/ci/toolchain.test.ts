import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('node toolchain', () => {
  it('UC-DEPLOY-10: pnpm refuses other Node majors (engine-strict + engines range)', () => {
    expect(read('.npmrc')).toMatch(/^engine-strict=true$/m);
    const pkg = JSON.parse(read('package.json')) as { engines: { node: string } };
    expect(pkg.engines.node).toBe('>=26 <27');
  });

  it('UC-DEPLOY-10: .nvmrc and CI use Node 26', () => {
    expect(read('.nvmrc').trim()).toBe('26');
    expect(read('.github/workflows/ci.yml')).toContain('node-version-file: .nvmrc');
  });
});
