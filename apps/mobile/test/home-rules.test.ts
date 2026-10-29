import type { Entry, EntryRow } from '@verso/api';
import { afterEach, describe, expect, it } from 'vitest';

import { languageStore } from '../src/lib/i18n/store';
import {
  comingUpDate as comingUpColumn,
  comingUpSubtitle,
  homeState,
  playingEmptyCard as playingEmptyKeys,
  playingSubtitle as playingParts,
  splitPlaying,
  upNextSubtitle,
} from '../src/screens/home/rules';

import { english, englishJoined } from './english';

/** The lines as Home says them in English (the module returns phrases and keys). */
function playingSubtitle(...args: Parameters<typeof playingParts>): string | null {
  const parts = playingParts(...args);
  return parts && englishJoined(parts);
}

function comingUpDate(...args: Parameters<typeof comingUpColumn>) {
  const column = comingUpColumn(...args);
  return column && { ...column, month: column.month && column.month.toUpperCase() };
}

function playingEmptyCard(...args: Parameters<typeof playingEmptyKeys>) {
  const card = playingEmptyKeys(...args);
  const button = (spec: typeof card.primary) => spec && { ...spec, label: english(spec.label) };
  return { body: english(card.body), primary: button(card.primary), secondary: button(card.secondary) };
}

/** A fixed "now" so nothing here depends on the day the suite runs. */
const NOW = new Date(2026, 8, 16, 14, 30); // Wednesday 16 September 2026

const BARE_ENTRY: Entry = {
  id: 'entry-1',
  mediaItemId: 'item-1',
  status: 'playing',
  addedAt: '2026-09-01T10:00:00Z',
  startedAt: null,
  finishedAt: null,
  purchasedAt: null,
  notes: null,
  playtimeMinutes: null,
  playtimeSource: null,
  playedPlatforms: [],
  backlogPosition: null,
  plannedOn: null,
};

function row(overrides: Partial<EntryRow> = {}, entry: Partial<Entry> = {}): EntryRow {
  return {
    mediaItemId: 'item-1',
    title: 'Hades',
    year: 2020,
    coverImageId: 'co1r7f',
    releaseDate: '2020-09-17',
    externalIds: {},
    genres: [],
    platforms: [],
    timeToBeat: { hastilySeconds: null, normallySeconds: null, completelySeconds: null },
    ...overrides,
    entry: { ...BARE_ENTRY, ...entry },
  };
}

describe('playingSubtitle', () => {
  it('puts the hours played beside the platforms you played it on', () => {
    expect(
      playingSubtitle(row({}, { playedPlatforms: ['PC', 'Steam Deck'], playtimeMinutes: 845 }), NOW),
    ).toBe('PC, Steam Deck · 14 h played');
  });

  it('falls back to the started date when there are no hours', () => {
    expect(
      playingSubtitle(row({}, { playedPlatforms: ['PC'], startedAt: '2026-09-02T09:00:00Z' }), NOW),
    ).toBe('PC · Started Sep 2');
  });

  it('shows the platforms alone when there is neither', () => {
    expect(playingSubtitle(row({}, { playedPlatforms: ['Switch 2'] }), NOW)).toBe('Switch 2');
  });

  it('borrows the first catalog platform when nothing is recorded as played on, in its short form', () => {
    expect(
      playingSubtitle(row({ platforms: ['PlayStation 5', 'PC'] }, { playtimeMinutes: 120 }), NOW),
    ).toBe('PS5 · 2 h played');
  });

  it('counts the platforms past the third rather than listing them', () => {
    expect(
      playingSubtitle(
        row({}, { playedPlatforms: ['PC', 'PS5', 'Switch', 'Xbox Series X', 'Steam Deck'] }),
        NOW,
      ),
    ).toBe('PC, PS5, Switch +2');
  });

  it('says nothing at all rather than an empty line', () => {
    expect(playingSubtitle(row(), NOW)).toBeNull();
  });

  it('keeps the hours when nothing is recorded and the catalog lists nothing', () => {
    expect(playingSubtitle(row({}, { playtimeMinutes: 40 }), NOW)).toBe('40 min played');
  });
});

describe('upNextSubtitle', () => {
  it('prefers the time to beat', () => {
    expect(
      upNextSubtitle(
        row(
          { timeToBeat: { hastilySeconds: null, normallySeconds: 30 * 3600, completelySeconds: null } },
          { playedPlatforms: ['PC'] },
        ),
      ),
    ).toBe('~30 h');
  });

  it('falls back to one played-on platform, never a list', () => {
    expect(upNextSubtitle(row({}, { playedPlatforms: ['PC', 'PS5'] }))).toBe('PC');
  });

  it('falls back to the year', () => {
    expect(upNextSubtitle(row({ year: 2019 }))).toBe('2019');
  });

  it('has nothing to say for an undated game with nothing recorded', () => {
    expect(upNextSubtitle(row({ year: null }))).toBeNull();
  });
});

describe('comingUpSubtitle', () => {
  it('names the first platform the catalog lists, even with a played-on list on the entry', () => {
    // A game that is not out has been played nowhere; the catalog is the
    // whole answer.
    expect(
      comingUpSubtitle(row({ platforms: ['PC', 'PS5'] }, { playedPlatforms: ['PS5'] })),
    ).toBe('PC');
  });

  it('names the first platform the catalog lists', () => {
    expect(comingUpSubtitle(row({ platforms: ['Switch 2', 'PC'] }))).toBe('Switch 2');
  });

  it('is null for a game with no platforms at all', () => {
    expect(comingUpSubtitle(row())).toBeNull();
  });
});

describe('comingUpDate', () => {
  it('reads a date this year as the month over the day', () => {
    expect(comingUpDate('2026-09-24', NOW)).toEqual({ month: 'SEP', day: '24', year: null });
    // GTA VI, phone-feedback entry 13.
    expect(comingUpDate('2026-11-19', NOW)).toEqual({ month: 'NOV', day: '19', year: null });
  });

  it('does not shift the day into the previous one west of Greenwich', () => {
    // `new Date('2026-01-01')` is UTC midnight, which in New York is the
    // evening of 31 December. The column must say JAN 1.
    expect(comingUpDate('2026-01-01', NOW)).toEqual({ month: 'JAN', day: '1', year: null });
  });

  it('drops to the month and the year for next year, as releaseDate does', () => {
    expect(comingUpDate('2027-02-11', NOW)).toEqual({ month: 'FEB', day: null, year: '2027' });
  });

  it('keeps the year for next year even when the catalog has a day', () => {
    // The Metroid game of entry 13, out 2027-01-28. Without IGDB's precision
    // stored, this day cannot be told from an invented one (rules.ts).
    expect(comingUpDate('2027-01-28', NOW)).toEqual({ month: 'JAN', day: null, year: '2027' });
  });

  it('puts the year on its own field, never in the day, so it can be drawn smaller', () => {
    // The fixed-width column of entry 13 draws `day` large and `year` small;
    // a year in `day` would be the 20-point "2027" that pushed the cover right.
    for (const value of ['2026-11-19', '2027-01-28', '2028-06-30', '2031-01-01']) {
      const column = comingUpDate(value, NOW)!;
      expect([column.day, column.year].filter((line) => line !== null)).toHaveLength(1);
      if (column.day !== null) expect(column.day.length).toBeLessThanOrEqual(2);
    }
  });

  it('shows the year alone further out, rather than inventing a release day', () => {
    expect(comingUpDate('2028-01-01', NOW)).toEqual({ month: null, day: null, year: '2028' });
  });

  it('has no column without a date', () => {
    expect(comingUpDate(null, NOW)).toBeNull();
    expect(comingUpDate('', NOW)).toBeNull();
    expect(comingUpDate('not a date', NOW)).toBeNull();
  });
});

describe('comingUpDate: every month', () => {
  afterEach(() => languageStore.setPreference('system'));

  // The 15th of each month of 2026, as the column draws it: in capitals.
  const days = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-15`);
  const months = () => days.map((day) => comingUpDate(day, NOW)!.month);

  it('names the months in English', () => {
    expect(months()).toEqual(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']);
  });

  it('names the months in Spanish', () => {
    languageStore.setPreference('es');
    expect(months()).toEqual([
      'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEPT', 'OCT', 'NOV', 'DIC',
    ]);
  });
});

describe('homeState', () => {
  it('is a first run only when all three lists are empty', () => {
    expect(homeState({ playing: 0, upNext: 0, comingUp: 0 })).toBe('first-run');
  });

  it('is the ordinary screen as soon as anything is tracked', () => {
    expect(homeState({ playing: 1, upNext: 0, comingUp: 0 })).toBe('blocks');
    expect(homeState({ playing: 0, upNext: 2, comingUp: 0 })).toBe('blocks');
    // A backlog of nothing but unreleased games: Up next is empty and Coming up
    // is not, and that is not somebody's first run.
    expect(homeState({ playing: 0, upNext: 0, comingUp: 1 })).toBe('blocks');
  });
});

describe('splitPlaying', () => {
  it('makes the first row the hero and the rest the small cards', () => {
    const rows = [row({ mediaItemId: 'a' }), row({ mediaItemId: 'b' }), row({ mediaItemId: 'c' })];
    const { hero, alsoPlaying } = splitPlaying(rows);

    expect(hero?.mediaItemId).toBe('a');
    expect(alsoPlaying.map((item) => item.mediaItemId)).toEqual(['b', 'c']);
  });

  it('has no hero and no cards for an empty list', () => {
    expect(splitPlaying([])).toEqual({ hero: null, alsoPlaying: [] });
  });
});

describe('playingEmptyCard', () => {
  it('offers the backlog first and a search second when there is a backlog', () => {
    expect(playingEmptyCard({ firstRun: false, backlog: 2 })).toEqual({
      body: 'Start a game from your backlog.',
      primary: { action: 'pick-from-backlog', label: 'Pick from backlog' },
      secondary: { action: 'search-new', label: 'Search a new game' },
    });
  });

  it('offers only the search, and never mentions the backlog, when the backlog is empty', () => {
    const card = playingEmptyCard({ firstRun: false, backlog: 0 });

    expect(card).toEqual({
      body: "Search for the game you're playing.",
      primary: { action: 'search-new', label: 'Search a new game' },
      secondary: null,
    });
    expect(card.body.toLowerCase()).not.toContain('backlog');
  });

  it('treats one backlog game as a backlog', () => {
    expect(playingEmptyCard({ firstRun: false, backlog: 1 }).primary?.action).toBe('pick-from-backlog');
  });

  it('offers both while the backlog has not answered, rather than guessing it is empty', () => {
    expect(playingEmptyCard({ firstRun: false, backlog: null })).toEqual(
      playingEmptyCard({ firstRun: false, backlog: 3 }),
    );
  });

  it('leaves first run B as drawn: the longer sentence and no button', () => {
    expect(playingEmptyCard({ firstRun: true, backlog: 0 })).toEqual({
      body: 'Start a game from your backlog and it shows up here.',
      primary: null,
      secondary: null,
    });
  });
});
