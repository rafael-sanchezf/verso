/**
 * The Calendar segment's grouping and wording (screens/watchlist/calendar.ts),
 * with the frame's four films (262:101) as the fixture.
 */

import type { MovieCalendarRow } from '@verso/api';
import { describe, expect, it } from 'vitest';

import { calendarGroups, goingDate, rowView, shortDate } from '../src/screens/watchlist/calendar';

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
    expect(groups.map((group) => group.title)).toEqual(['NOW', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JANUARY 2027']);
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
    expect(calendarGroups(october, TODAY).map((group) => [group.title, group.rows.length])).toEqual([['OCTOBER', 2]]);
    expect(calendarGroups([], TODAY)).toEqual([]);
  });
});

describe('rowView', () => {
  it('words the five kinds by kind, as the frame does', () => {
    const [now, going, opening, streaming, release] = rows.map((r) => rowView(r, 2026));
    expect([now!.dateTop, now!.dateDay, now!.meta, now!.trailing]).toEqual(['OCT', '3', 'In theaters since Oct 3', 'going?']);
    expect([going!.dateTop, going!.dateDay, going!.meta, going!.trailing, going!.going]).toEqual([
      'SAT',
      '24',
      'Going',
      'change',
      true,
    ]);
    expect([opening!.dateTop, opening!.meta, opening!.trailing]).toEqual(['NOV', 'In theaters', 'going?']);
    expect([streaming!.meta, streaming!.trailing]).toEqual(['Streaming Dec 3', null]);
    expect([release!.meta, release!.trailing]).toEqual(['Release date', null]);
  });

  it('names the service when one is known', () => {
    expect(rowView(rows[3]!, 2026, 'Hulu').meta).toBe('Streaming on Hulu');
  });
});

describe('the dates', () => {
  it('adds the year only outside this one, and reads the ticket day', () => {
    expect(shortDate('2026-10-03', 2026)).toBe('Oct 3');
    expect(shortDate('2027-01-15', 2026)).toBe('Jan 15, 2027');
    expect(goingDate('2026-10-24')).toBe('Sat Oct 24');
  });
});
