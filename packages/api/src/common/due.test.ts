import { describe, expect, it } from 'vitest';
import { endOfLocalDay, localDate } from './due.js';

describe('due date helpers', () => {
  it('UC-TASK-14: end of day in a zone behind UTC', () => {
    expect(endOfLocalDay('2026-11-28', 'America/Mexico_City').toISOString()).toBe('2026-11-29T05:59:59.000Z');
  });

  it('UC-TASK-14: end of day in a zone ahead of UTC', () => {
    expect(endOfLocalDay('2026-11-28', 'Asia/Tokyo').toISOString()).toBe('2026-11-28T14:59:59.000Z');
  });

  it('UC-TASK-14: end of day in UTC and across a daylight-saving change', () => {
    expect(endOfLocalDay('2026-11-28', 'UTC').toISOString()).toBe('2026-11-28T23:59:59.000Z');
    expect(endOfLocalDay('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-09T03:59:59.000Z');
  });

  it('UC-TASK-14: localDate reads the calendar date in the zone', () => {
    expect(localDate(new Date('2026-11-29T05:59:59Z'), 'America/Mexico_City')).toBe('2026-11-28');
    expect(localDate(new Date('2026-11-29T06:00:00Z'), 'America/Mexico_City')).toBe('2026-11-29');
  });
});
