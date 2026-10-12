import { releaseState } from '@verso/api';
import { describe, expect, it } from 'vitest';

import { addSheetRows } from '../src/screens/search/add-options';

/** A fixed "now" so nothing here depends on the day the suite runs. */
const NOW = new Date(2026, 8, 23, 14, 30); // Wednesday 23 September 2026
const TODAY = '2026-09-23';

/** The rows for a game with this release date, as the sheet builds them. */
function rowsFor(date: string | null, status?: 'released' | 'unreleased') {
  return addSheetRows(releaseState(date, { today: TODAY, status }), NOW);
}

describe('addSheetRows for a released game', () => {
  it('offers the three drawn rows and nothing else', () => {
    const rows = rowsFor('2020-09-17');

    expect(rows.options.map((option) => option.title)).toEqual([
      'Backlog',
      'Playing now',
      'I finished this',
    ]);
    expect(rows.options.map((option) => option.choice)).toEqual(['backlog', 'playing', 'finished']);
    expect(rows.options.map((option) => option.filled)).toEqual([false, false, true]);
    // Decision 26: no platform row under the three, and no ownership in the words.
    expect(Object.keys(rows)).toEqual(['options']);
    expect(rows.options[0]!.description).toBe('Play it later');
  });

  it('treats a game out today as released', () => {
    expect(rowsFor(TODAY).options).toHaveLength(3);
  });

  it('keeps the full sheet for an undated game the catalog says nothing about', () => {
    const rows = rowsFor(null);
    expect(rows.options).toHaveLength(3);
  });
});

describe('addSheetRows for a game that is not out', () => {
  it('offers one row, "Want to play", that writes what Backlog writes', () => {
    const rows = rowsFor('2026-11-19');

    expect(rows.options).toEqual([
      {
        choice: 'backlog',
        title: 'Want to play',
        description: 'Out Nov 19 · shows in Coming up',
        filled: false,
      },
    ]);
  });

  it('hides Playing and Finished', () => {
    const rows = rowsFor('2026-11-19');

    expect(rows.options.some((option) => option.choice !== 'backlog')).toBe(false);
  });

  it('prints the date as Coming up does: month and year next year, the year alone further out', () => {
    expect(rowsFor('2027-02-12').options[0]!.description).toBe('Out Feb 2027 · shows in Coming up');
    expect(rowsFor('2028-12-31').options[0]!.description).toBe('Out 2028 · shows in Coming up');
  });

  it('says the date is to be announced when a stored status is all there is', () => {
    const rows = rowsFor(null, 'unreleased');

    expect(rows.options).toEqual([
      {
        choice: 'backlog',
        title: 'Want to play',
        description: 'Release date to be announced',
        filled: false,
      },
    ]);
  });
});
