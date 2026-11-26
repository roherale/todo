import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid7.js';

describe('uuidv7', () => {
  it('UC-TASK-01: produces version 7 UUIDs', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('UC-TASK-11: ids sort in creation order, even many in the same millisecond', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('UC-TASK-11: a later timestamp always sorts after an earlier one', () => {
    const earlier = uuidv7(1_000_000_000_000);
    const later = uuidv7(2_000_000_000_000);
    expect(later > earlier).toBe(true);
  });

  it('UC-TASK-11: more than 4096 ids in one millisecond still sort in order', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7(3_000_000_000_000));
    expect([...ids].sort()).toEqual(ids);
  });
});
