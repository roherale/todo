import { describe, expect, it } from 'vitest';
import { checkMigrations, isDestructive } from './check-migrations.js';

describe('migration check', () => {
  it('UC-DEPLOY-05: fails on DROP, RENAME and ALTER ... TYPE, case-insensitively', () => {
    expect(isDestructive('drop table tasks;')).toBe(true);
    expect(isDestructive('ALTER TABLE t RENAME COLUMN a TO b;')).toBe(true);
    expect(isDestructive('alter table t alter column a type bigint;')).toBe(true);
  });

  it('UC-DEPLOY-05: ignores destructive words that only appear in SQL comments', () => {
    expect(isDestructive('-- drop table x\n/* rename y */ create table z (id int);')).toBe(false);
  });

  it('UC-DEPLOY-05: passes migrations that only add things, with no label', () => {
    const result = checkMigrations(
      [{ path: 'a.sql', sql: 'create table t (id int); alter table t add column n text;' }],
      false,
    );
    expect(result.ok).toBe(true);
  });

  it('UC-DEPLOY-05: fails destructive SQL without the label and passes it with the label', () => {
    const files = [{ path: 'b.sql', sql: 'DROP TABLE t;' }];
    expect(checkMigrations(files, false)).toEqual({ ok: false, offending: ['b.sql'] });
    expect(checkMigrations(files, true).ok).toBe(true);
  });
});
