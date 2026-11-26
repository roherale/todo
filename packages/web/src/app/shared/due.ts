import { Pipe, type PipeTransform } from '@angular/core';
import type { Task } from '@todo/shared';

/** The calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function dateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** The wall-clock time (HH:mm) of an instant in a timezone. */
export function timeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(instant / 1000) * 1000;
}

/** The instant for a wall-clock date and time (YYYY-MM-DD, HH:mm) in a timezone. */
export function instantInZone(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let instant = guess - offsetMs(guess, timeZone);
  instant = guess - offsetMs(instant, timeZone);
  return new Date(instant).toISOString();
}

/** Overdue: due in the past and not completed. */
export function isOverdue(task: Pick<Task, 'dueAt' | 'status'>, now: number = Date.now()): boolean {
  return task.dueAt !== null && task.status !== 'completed' && new Date(task.dueAt).getTime() < now;
}

/** Shows a due date in the profile timezone. All-day tasks show only the date. */
@Pipe({ name: 'due' })
export class DuePipe implements PipeTransform {
  transform(task: Pick<Task, 'dueAt' | 'dueAllDay'>, timeZone: string): string {
    if (!task.dueAt) return '';
    const date = dateInZone(task.dueAt, timeZone);
    return task.dueAllDay ? date : `${date} ${timeInZone(task.dueAt, timeZone)}`;
  }
}
