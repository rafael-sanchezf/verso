/**
 * The Calendar segment's rows, grouped and worded (frame `Calendar` 262:101;
 * movies-brief.md, "Watchlist tab"; rule 37).
 *
 * `movie_calendar` returns one row per film, the films in theaters now first
 * and then every row by its day, soonest first. This turns that list into the
 * groups the screen draws, NOW then one per month, and says what each row
 * reads: the date column, the line under the title, and the trailing action.
 * Each kind is labelled by its kind, so a streaming arrival and an opening
 * never read alike.
 *
 * No React; relative imports only (`test/watchlist-calendar.test.ts`).
 */

import type { CalendarKind, MovieCalendarRow } from '@verso/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const WEEKDAY_WORDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** A `YYYY-MM-DD` as its parts, read as a local date (never through UTC). */
function parts(value: string): { year: number; month: number; day: number; weekday: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return { year, month, day, weekday: date.getDay() };
}

/** `Oct 3`, with the year when it is not `todayYear`. */
export function shortDate(value: string, todayYear: number): string {
  const p = parts(value);
  if (!p) return value;
  const base = `${MONTHS[p.month]} ${p.day}`;
  return p.year === todayYear ? base : `${base}, ${p.year}`;
}

/** `Fri Oct 24`: the day you are going, the way a ticket says it. */
export function goingDate(value: string): string {
  const p = parts(value);
  if (!p) return value;
  return `${WEEKDAY_WORDS[p.weekday]} ${MONTHS[p.month]} ${p.day}`;
}

export type CalendarTrailing = 'going?' | 'change' | null;

export interface CalendarRowView {
  row: MovieCalendarRow;
  /** The small word over the day: the month ("OCT"), or the weekday when going ("FRI"). */
  dateTop: string;
  /** The day of the month, "24". */
  dateDay: string;
  /** The date column in the brand green: the day the person is going. */
  going: boolean;
  /** The line under the title. */
  meta: string;
  /** "Going? ›" for a film in or coming to theaters, "Change" for a planned day, nothing otherwise. */
  trailing: CalendarTrailing;
}

/**
 * What one row says.
 *
 * - `in_theaters`: "In theaters since Oct 3", "Going? ›".
 * - `going`: "Going", the date in the brand green, "Change".
 * - `opening`: "In theaters", "Going? ›".
 * - `streaming_soon`: "Streaming on Hulu" when the service is known, else
 *   "Streaming Dec 3" (the calendar read carries no provider yet, so today it
 *   is always the date).
 * - `release`: "Release date", for an unreleased film TMDB knows only one
 *   date for, which may move.
 */
export function rowView(row: MovieCalendarRow, todayYear: number, service?: string | null): CalendarRowView {
  const p = parts(row.onDate);
  const going = row.kind === 'going';
  const dateTop = p ? (going ? WEEKDAYS[p.weekday]! : MONTHS[p.month]!.toUpperCase()) : '';
  const dateDay = p ? String(p.day) : '';
  return {
    row,
    dateTop,
    dateDay,
    going,
    meta: metaFor(row.kind, row.onDate, todayYear, service ?? null),
    trailing: trailingFor(row.kind),
  };
}

function metaFor(kind: CalendarKind, onDate: string, todayYear: number, service: string | null): string {
  switch (kind) {
    case 'in_theaters':
      return `In theaters since ${shortDate(onDate, todayYear)}`;
    case 'going':
      return 'Going';
    case 'opening':
      return 'In theaters';
    case 'streaming_soon':
      return service ? `Streaming on ${service}` : `Streaming ${shortDate(onDate, todayYear)}`;
    case 'release':
      return 'Release date';
  }
}

function trailingFor(kind: CalendarKind): CalendarTrailing {
  if (kind === 'in_theaters' || kind === 'opening') return 'going?';
  if (kind === 'going') return 'change';
  return null;
}

export interface CalendarGroup {
  /** "NOW", "OCTOBER", or "JANUARY 2027" for a month outside this year. */
  title: string;
  rows: CalendarRowView[];
}

/**
 * NOW for the films in theaters today, then one group per month in the order
 * the rows arrive (the read is already by day). A film is never in two groups.
 */
export function calendarGroups(rows: readonly MovieCalendarRow[], today: string): CalendarGroup[] {
  const todayYear = parts(today)?.year ?? new Date().getFullYear();
  const groups: CalendarGroup[] = [];
  const now: CalendarRowView[] = [];
  const byMonth = new Map<string, CalendarGroup>();

  for (const row of rows) {
    const view = rowView(row, todayYear);
    if (row.kind === 'in_theaters') {
      now.push(view);
      continue;
    }
    const p = parts(row.onDate);
    const key = p ? `${p.year}-${p.month}` : 'undated';
    let group = byMonth.get(key);
    if (!group) {
      const title = p ? (p.year === todayYear ? MONTH_NAMES[p.month]! : `${MONTH_NAMES[p.month]} ${p.year}`) : 'LATER';
      group = { title, rows: [] };
      byMonth.set(key, group);
      groups.push(group);
    }
    group.rows.push(view);
  }

  return now.length > 0 ? [{ title: 'NOW', rows: now }, ...groups] : groups;
}
