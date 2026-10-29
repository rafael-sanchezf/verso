/**
 * The Calendar segment's grouping and wording (screens/watchlist/calendar.ts),
 * with the frame's four films (262:101) as the fixture.
 */

import type { MovieCalendarRow } from '@verso/api';
import { afterEach, describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import { languageStore } from '../src/lib/i18n/store';
import { calendarGroups, goingDate, rowView, shortDate } from '../src/screens/watchlist/calendar';
import { say, type Phrase } from '../src/screens/watchlist/filters';

/** A phrase as the segment says it, in the language the store holds. */
function words(phrase: Phrase): string {
  return say((key, vars) => translate(languageStore.language(), key, vars), phrase);
}

function row(overrides: Partial<MovieCalendarRow> & Pick<MovieCalendarRow, 'mediaItemId' | 'kind' | 'onDate'>): MovieCalendarRow {
  return {
    title: overrides.mediaItemId,
    year: 2026,
    coverImageId: null,
    externalIds: null,
    runtimeMinutes: null,
    status: 'backlog',
    plannedOn: null,
    theatricalOn: null,
    digitalOn: null,
    ...overrides,
  };
}

const TODAY = '2026-10-12';

// In the order `movie_calendar` returns them: in theaters first, then by day.
const rows = [
  row({ mediaItemId: 'smashing-machine', title: 'The Smashing Machine', kind: 'in_theaters', onDate: '2026-10-03' }),
  row({ mediaItemId: 'dune-3', title: 'Dune: Part Three', kind: 'going', onDate: '2026-10-24', plannedOn: '2026-10-24' }),
  row({ mediaItemId: 'frankenstein', title: 'Frankenstein', kind: 'opening', onDate: '2026-11-07' }),
  row({ mediaItemId: 'anatomy', title: 'Anatomy of a Fall', kind: 'streaming_soon', onDate: '2026-12-03' }),
  row({ mediaItemId: 'later', title: 'Later', kind: 'release', onDate: '2027-01-15' }),
];

describe('calendarGroups', () => {
  it('groups NOW first, then one group per month in order', () => {
    const groups = calendarGroups(rows, TODAY);
    expect(groups.map((group) => words(group.title))).toEqual(['NOW', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JANUARY 2027']);
    expect(groups.map((group) => group.rows.map((view) => view.row.mediaItemId))).toEqual([
      ['smashing-machine'],
      ['dune-3'],
      ['frankenstein'],
      ['anatomy'],
      ['later'],
    ]);
  });

  it('puts two films of one month in one group, and draws nothing for nothing', () => {
    const october = [
      row({ mediaItemId: 'a', kind: 'opening', onDate: '2026-10-17' }),
      row({ mediaItemId: 'b', kind: 'going', onDate: '2026-10-24' }),
    ];
    expect(calendarGroups(october, TODAY).map((group) => [words(group.title), group.rows.length])).toEqual([['OCTOBER', 2]]);
    expect(calendarGroups([], TODAY)).toEqual([]);
  });
});

describe('rowView', () => {
  it('words the five kinds by kind, as the frame does', () => {
    const [now, going, opening, streaming, release] = rows.map((r) => rowView(r, 2026));
    expect([now!.dateTop, now!.dateDay, words(now!.meta), now!.trailing]).toEqual(['OCT', '3', 'In theaters since Oct 3', 'going?']);
    expect([going!.dateTop, going!.dateDay, words(going!.meta), going!.trailing, going!.going]).toEqual([
      'SAT',
      '24',
      'Going',
      'change',
      true,
    ]);
    expect([opening!.dateTop, words(opening!.meta), opening!.trailing]).toEqual(['NOV', 'In theaters', 'going?']);
    expect([words(streaming!.meta), streaming!.trailing]).toEqual(['Streaming Dec 3', null]);
    expect([words(release!.meta), release!.trailing]).toEqual(['Release date', null]);
  });

  it('names the service when one is known', () => {
    expect(words(rowView(rows[3]!, 2026, 'Hulu').meta)).toBe('Streaming on Hulu');
  });
});

describe('the dates', () => {
  it('adds the year only outside this one, and reads the ticket day', () => {
    expect(shortDate('2026-10-03', 2026)).toBe('Oct 3');
    expect(shortDate('2027-01-15', 2026)).toBe('Jan 15, 2027');
    expect(goingDate('2026-10-24')).toBe('Sat Oct 24');
  });
});

describe('in Spanish', () => {
  afterEach(() => languageStore.setPreference('system'));

  it('puts the day first and names the months in Spanish', () => {
    languageStore.setPreference('es');
    expect(shortDate('2026-10-03', 2026)).toBe('3 oct');
    expect(shortDate('2027-01-15', 2026)).toBe('15 ene 2027');
    expect(goingDate('2026-10-24')).toBe('sáb 24 oct');
    expect(calendarGroups(rows, TODAY).map((group) => words(group.title))).toEqual([
      'AHORA',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
      'ENERO 2027',
    ]);
    const [now, going] = rows.map((r) => rowView(r, 2026));
    expect([now!.dateTop, words(now!.meta)]).toEqual(['OCT', 'En cines desde el 3 oct']);
    expect(going!.dateTop).toBe('SÁB');
  });
});

describe('every month and weekday word', () => {
  afterEach(() => languageStore.setPreference('system'));

  // One film in the middle of each month of 2026, and one going on each day of
  // the week of Sunday 25 October 2026.
  const months = Array.from({ length: 12 }, (_, month) => `2026-${String(month + 1).padStart(2, '0')}-15`);
  const week = Array.from({ length: 7 }, (_, day) => `2026-10-${25 + day}`);
  const opening = (onDate: string) => row({ mediaItemId: onDate, kind: 'opening', onDate });
  const going = (onDate: string) => row({ mediaItemId: onDate, kind: 'going', onDate, plannedOn: onDate });

  it('reads English: the month in capitals over the day, the full month for a group, the weekday when going', () => {
    expect(months.map((day) => rowView(opening(day), 2026).dateTop)).toEqual([
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    ]);
    expect(months.map((day) => shortDate(day, 2026))).toEqual([
      'Jan 15', 'Feb 15', 'Mar 15', 'Apr 15', 'May 15', 'Jun 15', 'Jul 15', 'Aug 15', 'Sep 15', 'Oct 15', 'Nov 15', 'Dec 15',
    ]);
    expect(calendarGroups(months.map(opening), TODAY).map((group) => words(group.title))).toEqual([
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
    ]);
    expect(calendarGroups(months.map(opening), '2025-10-12').map((group) => words(group.title))).toEqual([
      'JANUARY 2026', 'FEBRUARY 2026', 'MARCH 2026', 'APRIL 2026', 'MAY 2026', 'JUNE 2026', 'JULY 2026', 'AUGUST 2026',
      'SEPTEMBER 2026', 'OCTOBER 2026', 'NOVEMBER 2026', 'DECEMBER 2026',
    ]);
    expect(week.map((day) => rowView(going(day), 2026).dateTop)).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
    expect(week.map(goingDate)).toEqual([
      'Sun Oct 25', 'Mon Oct 26', 'Tue Oct 27', 'Wed Oct 28', 'Thu Oct 29', 'Fri Oct 30', 'Sat Oct 31',
    ]);
  });

  it('reads Spanish: the day first, the RAE abbreviations, the weekday in capitals when going', () => {
    languageStore.setPreference('es');
    expect(months.map((day) => rowView(opening(day), 2026).dateTop)).toEqual([
      'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEPT', 'OCT', 'NOV', 'DIC',
    ]);
    expect(months.map((day) => shortDate(day, 2026))).toEqual([
      '15 ene', '15 feb', '15 mar', '15 abr', '15 may', '15 jun', '15 jul', '15 ago', '15 sept', '15 oct', '15 nov', '15 dic',
    ]);
    expect(calendarGroups(months.map(opening), TODAY).map((group) => words(group.title))).toEqual([
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
    ]);
    expect(calendarGroups(months.map(opening), '2025-10-12').map((group) => words(group.title))).toEqual([
      'ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026', 'MAYO 2026', 'JUNIO 2026', 'JULIO 2026', 'AGOSTO 2026',
      'SEPTIEMBRE 2026', 'OCTUBRE 2026', 'NOVIEMBRE 2026', 'DICIEMBRE 2026',
    ]);
    expect(week.map((day) => rowView(going(day), 2026).dateTop)).toEqual(['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']);
    expect(week.map(goingDate)).toEqual([
      'dom 25 oct', 'lun 26 oct', 'mar 27 oct', 'mié 28 oct', 'jue 29 oct', 'vie 30 oct', 'sáb 31 oct',
    ]);
  });
});
