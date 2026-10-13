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
 * No React; relative imports only (`test/watchlist-calendar.test.ts`). The
 * sentences are the dictionary's (`lists.calendar`), returned as a `Phrase`
 * the segment says with `t`. The month and weekday words are tables here, one
 * per language, read against the language the app is in, the way `format.ts`
 * keeps its own (Spanish puts the day first: `3 oct`, `sáb 24 oct`).
 */

import type { CalendarKind, MovieCalendarRow } from '@verso/api';

import { languageStore } from '../../lib/i18n/store';
import type { Language } from '../../lib/i18n/model';

import type { Phrase } from './filters';

type Twelve = readonly [string, string, string, string, string, string, string, string, string, string, string, string];
type Seven = readonly [string, string, string, string, string, string, string];

interface CalendarWords {
  /** `Oct`, `oct`: the date column's month (upper-cased there) and the short dates. */
  months: Twelve;
  /** The group headers: `OCTOBER`, `OCTUBRE`. */
  monthNames: Twelve;
  /** The date column's weekday when going: `SAT`, `SÁB`. */
  weekdays: Seven;
  /** The ticket's weekday: `Sat`, `sáb`. */
  weekdayWords: Seven;
  /** `Oct 3`, `3 oct`. */
  monthDay(month: string, day: number): string;
  /** `Jan 15, 2027`, `15 ene 2027`. */
  monthDayYear(month: string, day: number, year: number): string;
  /** `Sat Oct 24`, `sáb 24 oct`. */
  ticket(weekday: string, month: string, day: number): string;
}

const CALENDAR_WORDS: Readonly<Record<Language, CalendarWords>> = {
  en: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthNames: [
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
    ],
    weekdays: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    weekdayWords: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    monthDay: (month, day) => `${month} ${day}`,
    monthDayYear: (month, day, year) => `${month} ${day}, ${year}`,
    ticket: (weekday, month, day) => `${weekday} ${month} ${day}`,
  },
  es: {
    // The RAE's abbreviations, as `format.ts` writes them.
    months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
    monthNames: [
      'ENERO',
      'FEBRERO',
      'MARZO',
      'ABRIL',
      'MAYO',
      'JUNIO',
      'JULIO',
      'AGOSTO',
      'SEPTIEMBRE',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
    ],
    weekdays: ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'],
    weekdayWords: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    monthDay: (month, day) => `${day} ${month}`,
    monthDayYear: (month, day, year) => `${day} ${month} ${year}`,
    ticket: (weekday, month, day) => `${weekday} ${day} ${month}`,
  },
};

/** The words for the language the app is in at the moment of the call. */
function words(): CalendarWords {
  return CALENDAR_WORDS[languageStore.language()];
}

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
  const w = words();
  const month = w.months[p.month]!;
  return p.year === todayYear ? w.monthDay(month, p.day) : w.monthDayYear(month, p.day, p.year);
}

/** `Fri Oct 24`: the day you are going, the way a ticket says it. */
export function goingDate(value: string): string {
  const p = parts(value);
  if (!p) return value;
  const w = words();
  return w.ticket(w.weekdayWords[p.weekday]!, w.months[p.month]!, p.day);
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
  meta: Phrase;
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
  const w = words();
  const dateTop = p ? (going ? w.weekdays[p.weekday]! : w.months[p.month]!.toUpperCase()) : '';
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

function metaFor(kind: CalendarKind, onDate: string, todayYear: number, service: string | null): Phrase {
  switch (kind) {
    case 'in_theaters':
      return { key: 'lists.calendar.inTheatersSince', vars: { date: shortDate(onDate, todayYear) } };
    case 'going':
      return { key: 'lists.calendar.going' };
    case 'opening':
      return { key: 'lists.calendar.inTheaters' };
    case 'streaming_soon':
      return service
        ? { key: 'lists.calendar.streamingOn', vars: { service } }
        : { key: 'lists.calendar.streamingOnDate', vars: { date: shortDate(onDate, todayYear) } };
    case 'release':
      return { key: 'lists.calendar.releaseDate' };
  }
}

function trailingFor(kind: CalendarKind): CalendarTrailing {
  if (kind === 'in_theaters' || kind === 'opening') return 'going?';
  if (kind === 'going') return 'change';
  return null;
}

export interface CalendarGroup {
  /** Stable across languages: `now`, `2026-9`, `undated`. */
  id: string;
  /** "NOW", "OCTOBER", or "JANUARY 2027" for a month outside this year. */
  title: Phrase;
  rows: CalendarRowView[];
}

/**
 * NOW for the films in theaters today, then one group per month in the order
 * the rows arrive (the read is already by day). A film is never in two groups.
 */
export function calendarGroups(rows: readonly MovieCalendarRow[], today: string): CalendarGroup[] {
  const todayYear = parts(today)?.year ?? new Date().getFullYear();
  const names = words().monthNames;
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
      const title: Phrase = p
        ? { text: p.year === todayYear ? names[p.month]! : `${names[p.month]} ${p.year}` }
        : { key: 'lists.calendar.later' };
      group = { id: key, title, rows: [] };
      byMonth.set(key, group);
      groups.push(group);
    }
    group.rows.push(view);
  }

  return now.length > 0 ? [{ id: 'now', title: { key: 'lists.calendar.now' }, rows: now }, ...groups] : groups;
}
