import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCriteria, coveredCriteria, definedCriteria, missingCriteria, unknownCriteria } from './check-criteria.js';

describe('criteria coverage check', () => {
  const md = '| UC-A-01 | one |\n| UC-A-02 | two |\n| UC-B-01 | ~~x~~ Withdrawn |';

  it('UC-DEPLOY-12: reads criterion IDs and skips withdrawn ones', () => {
    expect(definedCriteria(md)).toEqual(['UC-A-01', 'UC-A-02']);
  });

  it('UC-DEPLOY-12: counts test names and workflow step names as coverage', () => {
    const covered = coveredCriteria(["it('UC-A-01: does x', () => {})", '- name: UC-A-02 check']);
    expect([...covered].sort()).toEqual(['UC-A-01', 'UC-A-02']);
  });

  it('UC-DEPLOY-12: reports uncovered criteria, only for the areas asked for', () => {
    const defined = ['UC-A-01', 'UC-A-02', 'UC-C-01'];
    expect(missingCriteria(defined, new Set(['UC-A-01']), ['A'])).toEqual(['UC-A-02']);
  });

  it('UC-DEPLOY-12: reports criterion IDs that a test or step names but no use case defines', () => {
    expect(unknownCriteria(['UC-A-01'], new Set(['UC-A-01', 'UC-A-99']))).toEqual(['UC-A-99']);
  });

  it('UC-DEPLOY-12: recognises parameterised tests written with it.each', () => {
    const covered = coveredCriteria(["  it.each(STATUSES)('UC-A-03: works for %s', () => {})"]);
    expect([...covered]).toEqual(['UC-A-03']);
  });
});

describe('criteria coverage check with a pending list', () => {
  const defined = ['UC-A-01', 'UC-A-02', 'UC-A-03'];

  it('UC-DEPLOY-12: passes when every criterion is covered or pending', () => {
    const report = checkCriteria(defined, new Set(['UC-A-01', 'UC-A-02']), { 'UC-A-03': 'M4' });
    expect(report).toEqual({ missing: [], pendingButCovered: [], unknownPending: [], unknownCovered: [] });
  });

  it('UC-DEPLOY-12: fails a criterion that is neither covered nor pending', () => {
    expect(checkCriteria(defined, new Set(['UC-A-01']), { 'UC-A-03': 'M4' }).missing).toEqual(['UC-A-02']);
  });

  it('UC-DEPLOY-12: fails a pending criterion that already has a test', () => {
    const report = checkCriteria(defined, new Set(['UC-A-01', 'UC-A-02', 'UC-A-03']), { 'UC-A-03': 'M4' });
    expect(report.pendingButCovered).toEqual(['UC-A-03']);
  });

  it('UC-DEPLOY-12: fails a pending entry that names a criterion that does not exist', () => {
    const report = checkCriteria(defined, new Set(defined), { 'UC-Z-99': 'M3' });
    expect(report.unknownPending).toEqual(['UC-Z-99']);
  });

  it('UC-DEPLOY-12: fails a test or step that names a criterion that does not exist', () => {
    const report = checkCriteria(defined, new Set([...defined, 'UC-Q-01']), {});
    expect(report.unknownCovered).toEqual(['UC-Q-01']);
  });

  it('UC-DEPLOY-12: the repository pending file uses well-formed IDs and only milestones M3 to M6', () => {
    const pending = JSON.parse(readFileSync(new URL('./pending-criteria.json', import.meta.url), 'utf8')) as Record<string, string>;
    expect(Object.keys(pending).every((id) => /^UC-[A-Z]+-\d{2}$/.test(id))).toBe(true);
    expect(Object.values(pending).every((m) => /^M[3-6]$/.test(m))).toBe(true);
  });
});
