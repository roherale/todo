import { dateInZone, DuePipe, instantInZone, isOverdue, timeInZone } from './due';

describe('due dates', () => {
  const pipe = new DuePipe();

  it('UC-WEB-06: a due time is shown in the profile timezone, not the browser\'s', () => {
    const task = { dueAt: '2026-11-28T03:30:00.000Z', dueAllDay: false };
    expect(pipe.transform(task, 'America/Mexico_City')).toBe('2026-11-27 21:30');
    expect(pipe.transform(task, 'Asia/Tokyo')).toBe('2026-11-28 12:30');
  });

  it('UC-WEB-06: an all-day task shows only the date, in the profile timezone', () => {
    const task = { dueAt: '2026-11-29T05:59:59.000Z', dueAllDay: true };
    expect(pipe.transform(task, 'America/Mexico_City')).toBe('2026-11-28');
  });

  it('UC-WEB-06: no due date shows nothing', () => {
    expect(pipe.transform({ dueAt: null, dueAllDay: false }, 'UTC')).toBe('');
  });

  it('UC-WEB-06: overdue means due in the past and not completed', () => {
    const now = Date.parse('2026-12-01T00:00:00Z');
    expect(isOverdue({ dueAt: '2026-11-30T00:00:00Z', status: 'new' }, now)).toBe(true);
    expect(isOverdue({ dueAt: '2026-11-30T00:00:00Z', status: 'completed' }, now)).toBe(false);
    expect(isOverdue({ dueAt: '2026-12-02T00:00:00Z', status: 'new' }, now)).toBe(false);
    expect(isOverdue({ dueAt: null, status: 'new' }, now)).toBe(false);
  });

  it('UC-WEB-06: wall-clock input in the profile timezone converts to the right instant, and back', () => {
    const iso = instantInZone('2026-11-28', '15:30', 'America/Mexico_City');
    expect(iso).toBe('2026-11-28T21:30:00.000Z');
    expect(dateInZone(iso, 'America/Mexico_City')).toBe('2026-11-28');
    expect(timeInZone(iso, 'America/Mexico_City')).toBe('15:30');
    expect(instantInZone('2026-03-08', '12:00', 'America/New_York')).toBe('2026-03-08T16:00:00.000Z');
  });
});
