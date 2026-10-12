/**
 * Details is rule 20 in code: a row exists because the fact behind it exists.
 * The failure this suite is for is the opposite one — a row that renders with
 * nothing in it, or a personal row that shows up on a game the caller does not
 * track.
 */

import { describe, expect, it } from 'vitest';

import { detailRows, groupDigits, timeToBeatBreakdown } from '../src/screens/game/details-rows';
import { steamAppId } from '../src/screens/game/steam';

import type { Entry, GamePage } from '@verso/api';

const NOW = new Date(2026, 8, 16, 14, 30); // Wednesday 16 September 2026

function entry(patch: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    mediaItemId: 'game-1',
    status: 'played',
    addedAt: '2026-09-02T10:00:00Z',
    startedAt: null,
    finishedAt: null,
    purchasedAt: null,
    notes: null,
    playtimeMinutes: null,
    playtimeSource: null,
    playedPlatforms: [],
    backlogPosition: null,
    plannedOn: null,
    ...patch,
  };
}

function page(patch: Partial<GamePage> = {}): GamePage {
  return {
    mediaItemId: 'game-1',
    medium: 'game',
    title: 'Hades',
    year: 2020,
    coverImageId: 'co1r7f',
    releaseDate: '2020-09-17',
    externalIds: { steam: 1145360 },
    game: {
      igdbId: 113112,
      developer: 'Supergiant Games',
      summary: 'A rogue-like dungeon crawler.',
      genres: ['Role-playing (RPG)', 'Indie'],
      platforms: [{ name: 'PC', played: false }],
      timeToBeat: {
        hastilySeconds: 21 * 3600,
        normallySeconds: 22 * 3600,
        completelySeconds: 92 * 3600,
      },
    },
    scores: {},
    entry: null,
    ranking: null,
    ...patch,
  };
}

describe('detailRows', () => {
  it('shows the catalog facts a game always has', () => {
    expect(detailRows(page(), null, NOW)).toEqual([
      { key: 'released', label: 'Released', value: 'Sep 17, 2020' },
      { key: 'time-to-beat', label: 'Time to beat', value: '~22 h ›', action: 'time-to-beat' },
    ]);
  });

  it('falls back from the full release date to the year, then hides the row', () => {
    expect(detailRows(page({ releaseDate: null }), null, NOW)[0]).toEqual({
      key: 'released',
      label: 'Released',
      value: '2020',
    });

    const undated = detailRows(page({ releaseDate: null, year: null }), null, NOW);
    expect(undated.some((row) => row.key === 'released')).toBe(false);
  });

  it('hides Time to beat when IGDB has no normal figure', () => {
    const noFigure = page({
      game: {
        ...page().game!,
        timeToBeat: { hastilySeconds: null, normallySeconds: null, completelySeconds: null },
      },
    });

    expect(noFigure.game).not.toBeNull();
    expect(detailRows(noFigure, null, NOW).some((row) => row.key === 'time-to-beat')).toBe(false);
  });

  it('draws nothing but the header for a media item with no game_details row', () => {
    const bare = page({ game: null, releaseDate: null, year: null });

    expect(detailRows(bare, null, NOW)).toEqual([]);
  });

  it('adds the personal rows that are filled, and no others', () => {
    const tracked = page({
      entry: entry({
        startedAt: '2026-09-10T18:00:00Z',
        finishedAt: '2026-09-14',
        playtimeMinutes: 845,
        playtimeSource: 'steam',
        notes: '  Best run: Poseidon and the shield.  ',
      }),
    });

    expect(detailRows(tracked, null, NOW).map((row) => row.key)).toEqual([
      'released',
      'time-to-beat',
      'added',
      'started',
      'finished',
      'hours',
      'notes',
    ]);
  });

  it('never shows Purchased, even when the column has a date (decision 26)', () => {
    const owned = page({ entry: entry({ purchasedAt: '2026-09-01' }) });

    expect(detailRows(owned, null, NOW).some((row) => row.label === 'Purchased')).toBe(false);
  });

  it('names where a playtime figure came from', () => {
    const rowsOf = (patch: Partial<Entry>) =>
      detailRows(page({ entry: entry(patch) }), null, NOW).find((row) => row.key === 'hours');

    expect(rowsOf({ playtimeMinutes: 845, playtimeSource: 'steam' })?.value).toBe('14 h · Steam');
    expect(rowsOf({ playtimeMinutes: 845, playtimeSource: 'manual' })?.value).toBe(
      '14 h · entered by hand',
    );
  });

  it('keeps a note as one wrapping row, trimmed', () => {
    const rows = detailRows(page({ entry: entry({ notes: '  One more run.  ' }) }), null, NOW);

    expect(rows.at(-1)).toEqual({
      key: 'notes',
      label: 'Notes',
      value: 'One more run.',
      wrap: true,
    });
  });

  it('shows the Steam figure only when there is a reading', () => {
    const withCount = detailRows(
      page(),
      { observedAt: '2026-09-16T12:00:00Z', players: 24318 },
      NOW,
    );

    expect(withCount.find((row) => row.key === 'playing-now')).toEqual({
      key: 'playing-now',
      label: 'Playing now',
      value: '24,318 on Steam',
    });
    expect(detailRows(page(), null, NOW).some((row) => row.key === 'playing-now')).toBe(false);
  });
});

describe('timeToBeatBreakdown', () => {
  it('lists the figures IGDB has, in order, and skips the ones it does not', () => {
    expect(timeToBeatBreakdown(page())).toEqual(['Rushed  ~21 h', 'Normally  ~22 h', 'Completely  ~92 h']);

    const partial = page({
      game: {
        ...page().game!,
        timeToBeat: { hastilySeconds: null, normallySeconds: 22 * 3600, completelySeconds: null },
      },
    });
    expect(timeToBeatBreakdown(partial)).toEqual(['Normally  ~22 h']);
  });

  it('has nothing to list without a game_details row', () => {
    expect(timeToBeatBreakdown(page({ game: null }))).toEqual([]);
  });
});

describe('groupDigits', () => {
  it('separates thousands without asking the device what language it is in', () => {
    expect(groupDigits(7)).toBe('7');
    expect(groupDigits(950)).toBe('950');
    expect(groupDigits(24318)).toBe('24,318');
    expect(groupDigits(1234567)).toBe('1,234,567');
  });
});

describe('steamAppId', () => {
  it('reads the id however external_ids happens to spell it', () => {
    expect(steamAppId({ steam: 1145360 })).toBe(1145360);
    expect(steamAppId({ steam: '1145360' })).toBe(1145360);
  });

  it('treats anything else as no Steam id rather than guessing', () => {
    expect(steamAppId({})).toBeNull();
    expect(steamAppId(null)).toBeNull();
    expect(steamAppId([1145360])).toBeNull();
    expect(steamAppId({ steam: 'app/1145360' })).toBeNull();
    expect(steamAppId({ steam: 0 })).toBeNull();
    expect(steamAppId({ igdb: 113112 })).toBeNull();
  });
});
