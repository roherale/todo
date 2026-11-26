import { describe, expect, it } from 'vitest';
import { parseDue } from './due-parser.js';

// Friday 2026-11-27, 10:00 in Mexico City (UTC-6).
const NOW = new Date('2026-11-27T16:00:00Z');
const MX = 'America/Mexico_City';

describe('parseDue', () => {
  it('UC-CLI-06: YYYY-MM-DD is an all-day date with the profile timezone\'s offset', () => {
    expect(parseDue('2026-12-01', MX, NOW)).toEqual({ dueAt: '2026-12-01T00:00:00-06:00', dueAllDay: true });
    expect(parseDue('2026-12-01', 'Asia/Tokyo', NOW)).toEqual({ dueAt: '2026-12-01T00:00:00+09:00', dueAllDay: true });
  });

  it('UC-CLI-06: "YYYY-MM-DD HH:mm" is a time in the profile timezone, whatever the machine\'s zone is', () => {
    expect(parseDue('2026-11-28 15:30', MX, NOW)).toEqual({ dueAt: '2026-11-28T15:30:00-06:00', dueAllDay: false });
    expect(parseDue('2026-11-28 15:30', 'Asia/Tokyo', NOW)).toEqual({ dueAt: '2026-11-28T15:30:00+09:00', dueAllDay: false });
    expect(parseDue('2026-07-01 09:00', 'America/New_York', NOW).dueAt).toBe('2026-07-01T09:00:00-04:00');
  });

  it('UC-CLI-06: today and tomorrow are read in the profile timezone', () => {
    // 16:00Z on the 27th is already the 28th in Tokyo.
    expect(parseDue('today', 'Asia/Tokyo', NOW).dueAt).toBe('2026-11-28T00:00:00+09:00');
    expect(parseDue('today', MX, NOW).dueAt).toBe('2026-11-27T00:00:00-06:00');
    expect(parseDue('tomorrow', MX, NOW).dueAt).toBe('2026-11-28T00:00:00-06:00');
    expect(parseDue('Tomorrow 3pm', MX, NOW)).toEqual({ dueAt: '2026-11-28T15:00:00-06:00', dueAllDay: false });
  });

  it('UC-CLI-06: weekday words pick the next such day, today included, with optional times', () => {
    expect(parseDue('fri', MX, NOW).dueAt).toBe('2026-11-27T00:00:00-06:00');
    expect(parseDue('mon', MX, NOW).dueAt).toBe('2026-11-30T00:00:00-06:00');
    expect(parseDue('thursday', MX, NOW).dueAt).toBe('2026-12-03T00:00:00-06:00');
    expect(parseDue('fri 3pm', MX, NOW)).toEqual({ dueAt: '2026-11-27T15:00:00-06:00', dueAllDay: false });
    expect(parseDue('sat 9:30am', MX, NOW).dueAt).toBe('2026-11-28T09:30:00-06:00');
    expect(parseDue('sun 15:45', MX, NOW).dueAt).toBe('2026-11-29T15:45:00-06:00');
    expect(parseDue('wed 12am', MX, NOW).dueAt).toBe('2026-12-02T00:00:00-06:00');
    expect(parseDue('wed 12pm', MX, NOW).dueAt).toBe('2026-12-02T12:00:00-06:00');
  });

  it('UC-CLI-06: input it cannot parse gives an error', () => {
    for (const bad of ['', 'someday', '2026-13-01', '2026-02-30', '2026-12-01 25:00', '2026-12-01 10:75', 'fri 25pm', 'fri 13pm', 'fri 0am', 'fri 3pm later', 'next fri', '12/01/2026', 'fri 99']) {
      expect(() => parseDue(bad, MX, NOW), JSON.stringify(bad)).toThrow(/Cannot read the date/);
    }
  });
});
