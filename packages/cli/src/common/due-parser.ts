import { addDays, dateInZone, instantInZone, offsetString, timeInZone, weekdayOf } from '@todo/shared';
import { CliError } from './errors.js';

export interface ParsedDue {
  /** ISO-8601 with the profile timezone's offset. */
  dueAt: string;
  dueAllDay: boolean;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function weekdayIndex(word: string): number {
  const i = WEEKDAYS.indexOf(word.slice(0, 3));
  return i >= 0 && (word.length === 3 || word === WEEKDAY_NAMES[i] || (word.length === 4 && word === `${WEEKDAYS[i]}s`)) ? i : -1;
}

/** `3pm`, `3:30pm`, `15:30` or `15` as HH:mm, or undefined when it is not a time. */
function parseTime(word: string): string | undefined {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(word);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? '0');
  const meridiem = m[3];
  if (minute > 59) return undefined;
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return undefined;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const validDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
};

function format(date: string, time: string | undefined, timeZone: string): ParsedDue {
  if (time === undefined) {
    // All-day: the API takes the calendar date as written, so the offset is the profile's.
    const at = instantInZone(date, '12:00', timeZone);
    return { dueAt: `${date}T00:00:00${offsetString(at, timeZone)}`, dueAllDay: true };
  }
  const instant = instantInZone(date, time, timeZone);
  return { dueAt: `${dateInZone(instant, timeZone)}T${timeInZone(instant, timeZone)}:00${offsetString(instant, timeZone)}`, dueAllDay: false };
}

/**
 * Turns what a person types into an ISO-8601 time with an offset, in the profile's timezone
 * (never the machine's). Throws a CliError for anything it cannot read, before any request is sent.
 */
export function parseDue(input: string, timeZone: string, now: Date = new Date()): ParsedDue {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const fail = () =>
    new CliError(`Cannot read the date "${input}". Use YYYY-MM-DD, "YYYY-MM-DD HH:mm", or words like today, tomorrow, fri, "fri 3pm".`);
  const today = dateInZone(now, timeZone);

  const absolute = /^(\d{4}-\d{2}-\d{2})(?: (\d{1,2}:\d{2}))?$/.exec(text);
  if (absolute) {
    const [, date, time] = absolute as unknown as [string, string, string | undefined];
    if (!validDate(date)) throw fail();
    const hhmm = time === undefined ? undefined : parseTime(time);
    if (time !== undefined && !hhmm) throw fail();
    return format(date, hhmm, timeZone);
  }

  const [word, ...rest] = text.split(' ');
  if (!word || rest.length > 1) throw fail();
  let date: string;
  if (word === 'today') date = today;
  else if (word === 'tomorrow') date = addDays(today, 1);
  else {
    const target = weekdayIndex(word);
    if (target < 0) throw fail();
    date = addDays(today, (target - weekdayOf(today) + 7) % 7);
  }
  const timeWord = rest[0];
  const time = timeWord === undefined ? undefined : parseTime(timeWord);
  if (timeWord !== undefined && !time) throw fail();
  return format(date, time, timeZone);
}
