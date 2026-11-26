import { describe, expect, it } from 'vitest';
import { coveredCriteria, definedCriteria, missingCriteria, unknownCriteria } from './check-criteria.js';

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
});
