import { describe, expect, it } from 'vitest';
import { addDays, dateInZone, instantInZone, offsetString, timeInZone, weekdayOf } from './zone.js';

describe('zone helpers', () => {
  it('UC-CLI-06: converts a wall-clock time in a timezone to the right instant, across daylight saving', () => {
    expect(instantInZone('2026-11-28', '15:30', 'America/Mexico_City').toISOString()).toBe('2026-11-28T21:30:00.000Z');
    expect(instantInZone('2026-03-08', '12:00', 'America/New_York').toISOString()).toBe('2026-03-08T16:00:00.000Z');
    expect(instantInZone('2026-07-01', '09:00', 'Asia/Tokyo').toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('UC-CLI-06: reads the date and time of an instant in the profile timezone, not the machine\'s', () => {
    const instant = new Date('2026-11-28T03:30:00Z');
    expect(dateInZone(instant, 'America/Mexico_City')).toBe('2026-11-27');
    expect(timeInZone(instant, 'America/Mexico_City')).toBe('21:30');
    expect(dateInZone(instant, 'Asia/Tokyo')).toBe('2026-11-28');
  });

  it('UC-CLI-06: weekday and date arithmetic work on calendar dates', () => {
    expect(weekdayOf('2026-11-27')).toBe(5);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('UC-CLI-06: the offset string follows the timezone at that instant', () => {
    expect(offsetString(new Date('2026-11-28T12:00:00Z'), 'America/Mexico_City')).toBe('-06:00');
    expect(offsetString(new Date('2026-07-01T12:00:00Z'), 'Asia/Kolkata')).toBe('+05:30');
    expect(offsetString(new Date('2026-07-01T12:00:00Z'), 'UTC')).toBe('+00:00');
  });
});
