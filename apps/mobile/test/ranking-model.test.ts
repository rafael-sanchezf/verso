import type { TierListRow } from '@verso/api';
import { describe, expect, it } from 'vitest';

import {
  assembleRanking,
  coverSourceOf,
  displayGenres,
  dropTarget,
  EMPTY_TIERS,
  filterItems,
  focusRowKey,
  genreOptions,
  isFiltered,
  NO_FILTERS,
  platformOptions,
  platformsOf,
  rowSubtitle,
  tiersFromList,
  toListItems,
  type RankingListItem,
  type TierRows,
} from '../src/screens/ranking/model';
import { genreLabel, platformShortName } from '../src/lib/format';

/**
 * A `tier_list` row. `position` is what the RPC returned, which is deliberately
 * not always what the assembled list uses: the tests below check that the
 * screen numbers by order rather than by that column.
 */
function row(
  id: string,
  overrides: Partial<TierListRow> = {},
): TierListRow {
  return {
    media_item_id: id,
    title: id,
    year: 2020,
    cover_image_id: `co_${id}`,
    external_ids: { steam: 400 },
    genres: ['Platform'],
    platforms: ['PC'],
    position: 0,
    ...overrides,
  } as TierListRow;
}

function tiers(overrides: Partial<Record<keyof TierRows, TierListRow[]>>): TierRows {
  return { ...EMPTY_TIERS, ...overrides };
}

describe('assembleRanking', () => {
  it('numbers the whole list, best tier first, and the count runs on through the tiers', () => {
    const items = assembleRanking(
      tiers({
        loved: [row('a'), row('b')],
        liked: [row('c')],
        fine: [],
        disliked: [row('d')],
      }),
    );

    expect(items.map((item) => [item.mediaItemId, item.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
    expect(items.map((item) => item.tier)).toEqual(['loved', 'loved', 'liked', 'disliked']);
    expect(items.map((item) => item.position)).toEqual([0, 1, 0, 0]);
  });

  it('scores from the position in the tier, so the best of a tier tops its band', () => {
    const items = assembleRanking(tiers({ loved: [row('a'), row('b'), row('c')] }));

    // The loved band is 8.5 to 10, interpolated across three games.
    expect(items.map((item) => item.score)).toEqual([10, 9.3, 8.5]);
  });

  it('gives a tier of one the middle of its band rather than the top', () => {
    const [only] = assembleRanking(tiers({ liked: [row('a')] }));
    expect(only?.score).toBe(7.5);
  });

  it('numbers by order, not by the position column the row arrived with', () => {
    const items = assembleRanking(
      tiers({ loved: [row('a', { position: 7 }), row('b', { position: 9 })] }),
    );

    expect(items.map((item) => item.position)).toEqual([0, 1]);
    expect(items.map((item) => item.score)).toEqual([10, 8.5]);
  });

  it('has nothing to assemble from an empty ranking', () => {
    expect(assembleRanking(EMPTY_TIERS)).toEqual([]);
  });
});

describe('coverSourceOf', () => {
  it('passes the two fields a cover is built from straight through', () => {
    expect(coverSourceOf(row('a'))).toEqual({
      cover_image_id: 'co_a',
      external_ids: { steam: 400 },
    });
  });

  it('nulls a column the hosted project has not got yet rather than passing undefined', () => {
    // `tier_list` only returns `external_ids` where the 2026-09-16 migration
    // has been applied; the generated type says otherwise.
    const missing = { ...row('a') } as Partial<TierListRow> as TierListRow;
    delete (missing as { external_ids?: unknown }).external_ids;
    delete (missing as { cover_image_id?: unknown }).cover_image_id;

    expect(coverSourceOf(missing)).toEqual({ cover_image_id: null, external_ids: null });
  });
});

describe('row text', () => {
  it('reads year then the first genre, in its display form', () => {
    expect(rowSubtitle(assembleRanking(tiers({ loved: [row('a')] }))[0]!)).toBe('2020 · platformer');
  });

  it('shows the year alone when no genre has a display name', () => {
    const item = assembleRanking(tiers({ loved: [row('a', { genres: ['Indie'] })] }))[0]!;
    expect(rowSubtitle(item)).toBe('2020');
  });

  it('shows the genre alone when the catalog has no year', () => {
    const item = assembleRanking(tiers({ loved: [row('a', { year: null })] }))[0]!;
    expect(rowSubtitle(item)).toBe('platformer');
  });

  it('has no subtitle at all rather than an empty line', () => {
    const item = assembleRanking(tiers({ loved: [row('a', { year: null, genres: [] })] }))[0]!;
    expect(rowSubtitle(item)).toBeNull();
  });

  it('drops genres with no display name and keeps the rest in order', () => {
    expect(displayGenres(['Indie', 'Role-playing (RPG)', 'Platform'])).toEqual([
      'RPG',
      'platformer',
    ]);
  });
});

describe('filters', () => {
  const items = assembleRanking(
    tiers({
      loved: [row('a', { genres: ['Role-playing (RPG)'], platforms: ['PC', 'PS5'] })],
      liked: [row('b', { genres: ['Platform'], platforms: ['Switch'] })],
      fine: [row('c', { genres: ['Platform', 'Indie'], platforms: ['PC'] })],
    }),
  );

  it('offers every named genre in the ranking once, as IGDB names, and never Indie', () => {
    // The value is IGDB's name, which the label and the icon both come from;
    // Indie has no display name, so the rows never print it and neither does
    // the sheet.
    expect(genreOptions(items)).toEqual(['Platform', 'Role-playing (RPG)']);
  });

  it('labels each genre with its display name, capitalized, never lower case (entry 2)', () => {
    expect(genreOptions(items).map((genre) => genreLabel(genre))).toEqual(['Platformer', 'RPG']);
  });

  it('sorts the genres by the label a reader sees, not by IGDB name', () => {
    const many = assembleRanking(
      tiers({
        loved: [
          row('a', {
            genres: [
              'Shooter',
              'Quiz/Trivia',
              'Music',
              'Real Time Strategy (RTS)',
              'Role-playing (RPG)',
              'Racing',
            ],
          }),
        ],
      }),
    );

    // By IGDB name this would be Music, Quiz/Trivia, Racing, Real Time...,
    // Role-playing, Shooter: "Rhythm game" at M and "Trivia game" at Q.
    expect(genreOptions(many).map((genre) => genreLabel(genre))).toEqual([
      'Racing game',
      'Rhythm game',
      'RPG',
      'RTS',
      'Shooter',
      'Trivia game',
    ]);
  });

  it('offers a genre once however IGDB spelled it, keeping the first spelling', () => {
    const spelled = assembleRanking(
      tiers({
        loved: [row('a', { genres: ['Role-playing (RPG)'] })],
        liked: [row('b', { genres: ['  role-playing (rpg) ', 'Indie'] })],
      }),
    );

    expect(genreOptions(spelled)).toEqual(['Role-playing (RPG)']);
    expect(filterItems(spelled, { genre: 'Role-playing (RPG)', platform: null })).toHaveLength(2);
  });

  it('offers no genre when nothing ranked has a named one', () => {
    const indie = assembleRanking(tiers({ loved: [row('a', { genres: ['Indie'] })] }));
    expect(genreOptions(indie)).toEqual([]);
  });

  it('offers every platform in the ranking once, as catalog names', () => {
    expect(platformOptions(items)).toEqual(['PC', 'PS5', 'Switch']);
  });

  it('sorts the platforms by the short name the sheet prints, not the catalog name', () => {
    const catalog = assembleRanking(
      tiers({
        loved: [
          row('a', { platforms: ['Nintendo Switch', 'Xbox Series X|S'] }),
          row('b', { platforms: ['PlayStation 5', ' PC (Microsoft Windows) ', ''] }),
        ],
      }),
    );

    // By catalog name, Nintendo Switch would come first and PC third.
    expect(platformOptions(catalog)).toEqual([
      'PC (Microsoft Windows)',
      'PlayStation 5',
      'Nintendo Switch',
      'Xbox Series X|S',
    ]);
    expect(platformOptions(catalog).map(platformShortName)).toEqual(['PC', 'PS5', 'Switch', 'Xbox Series X|S']);
  });

  describe('where the user played it (phone-feedback entry 4)', () => {
    // Played on PC; the catalog also lists Mac, Linux and iOS.
    const played = assembleRanking(
      tiers({
        loved: [
          row('hades', {
            platforms: ['PC (Microsoft Windows)', 'Mac', 'Linux', 'iOS'],
            played_platforms: ['PC (Microsoft Windows)'],
          }),
          row('zelda', {
            platforms: ['Nintendo Switch', 'Nintendo Switch 2'],
            played_platforms: ['Nintendo Switch 2'],
          }),
        ],
        liked: [
          // Nothing recorded: the catalog stands in.
          row('celeste', { platforms: ['PlayStation 5'], played_platforms: [] }),
        ],
      }),
    );

    it('lists the played-on platforms, not every platform the catalog lists', () => {
      expect(platformOptions(played)).toEqual(['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch 2']);
      expect(platformOptions(played)).not.toContain('Linux');
      expect(platformOptions(played)).not.toContain('Mac');
      expect(platformOptions(played)).not.toContain('iOS');
    });

    it('falls back to the catalog for a game with no played platform recorded', () => {
      expect(platformsOf(played[2]!)).toEqual(['PlayStation 5']);
    });

    it('falls back to the catalog when the row predates the column', () => {
      const old = assembleRanking(tiers({ loved: [row('a', { platforms: ['PC'] })] }));
      expect(old[0]?.playedPlatforms).toEqual([]);
      expect(platformOptions(old)).toEqual(['PC']);
    });

    it('filters by the same rule, so a catalog-only platform matches no played game', () => {
      expect(filterItems(played, { genre: null, platform: 'PC (Microsoft Windows)' }).map((i) => i.mediaItemId)).toEqual([
        'hades',
      ]);
      expect(filterItems(played, { genre: null, platform: 'Mac' })).toEqual([]);
      expect(filterItems(played, { genre: null, platform: 'Nintendo Switch' })).toEqual([]);
      expect(filterItems(played, { genre: null, platform: 'PlayStation 5' }).map((i) => i.mediaItemId)).toEqual([
        'celeste',
      ]);
    });

    it('offers only platforms some row matches', () => {
      for (const platform of platformOptions(played)) {
        expect(filterItems(played, { genre: null, platform }).length).toBeGreaterThan(0);
      }
    });
  });

  it('keeps the games that carry the chosen genre', () => {
    expect(filterItems(items, { genre: 'Platform', platform: null }).map((i) => i.mediaItemId)).toEqual([
      'b',
      'c',
    ]);
  });

  it('matches nothing for a genre the app does not name', () => {
    expect(filterItems(items, { genre: 'Indie', platform: null })).toEqual([]);
  });

  it('keeps the games on the chosen platform, including their other platforms', () => {
    expect(filterItems(items, { genre: null, platform: 'PC' }).map((i) => i.mediaItemId)).toEqual([
      'a',
      'c',
    ]);
  });

  it('narrows on both at once', () => {
    expect(
      filterItems(items, { genre: 'Platform', platform: 'PC' }).map((i) => i.mediaItemId),
    ).toEqual(['c']);
  });

  it('leaves the rank and the score global, not per subset', () => {
    const [platformer] = filterItems(items, { genre: 'Platform', platform: 'Switch' });
    expect(platformer?.rank).toBe(2);
    expect(platformer?.score).toBe(7.5);
  });

  it('filters nothing out when nothing is chosen', () => {
    expect(filterItems(items, NO_FILTERS)).toHaveLength(3);
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ genre: null, platform: 'PC' })).toBe(true);
  });
});

describe('toListItems', () => {
  it('puts a divider above each tier that has games and none above the ones that do not', () => {
    const list = toListItems(
      assembleRanking(tiers({ loved: [row('a')], fine: [row('b'), row('c')] })),
    );

    expect(list.map((entry) => entry.key)).toEqual([
      'divider:loved',
      'a',
      'divider:fine',
      'b',
      'c',
    ]);
  });

  it('draws nothing at all for an empty ranking', () => {
    expect(toListItems([])).toEqual([]);
  });
});

describe('focusRowKey', () => {
  const list = toListItems(
    assembleRanking(tiers({ loved: [row('a')], liked: [row('b'), row('c')] })),
  );

  it('finds the row "Move in Ranking" asked for', () => {
    expect(focusRowKey(list, 'c')).toBe('c');
  });

  it('never points at a divider', () => {
    expect(focusRowKey(list, 'divider:loved')).toBeNull();
  });

  it('has no row for a game the list is not showing', () => {
    // A filter hiding it and an unranked game are the same answer here: there
    // is nothing on screen to scroll to, so the request is dropped rather than
    // left waiting for a row that never arrives.
    expect(focusRowKey(list, 'z')).toBeNull();
    expect(focusRowKey([], 'a')).toBeNull();
  });
});

describe('dropTarget', () => {
  const list = toListItems(
    assembleRanking(tiers({ loved: [row('a'), row('b')], liked: [row('c'), row('d')] })),
  );

  /** Move the entry at `from` to `to`, the way the sortable hands the list back. */
  function reorder(entries: readonly RankingListItem[], from: number, to: number): RankingListItem[] {
    const next = [...entries];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    return next;
  }

  it('reads the tier off the divider above and the position off the games since', () => {
    expect(dropTarget(list, 'a')).toEqual({ mediaItemId: 'a', tier: 'loved', position: 0 });
    expect(dropTarget(list, 'b')).toEqual({ mediaItemId: 'b', tier: 'loved', position: 1 });
    expect(dropTarget(list, 'c')).toEqual({ mediaItemId: 'c', tier: 'liked', position: 0 });
    expect(dropTarget(list, 'd')).toEqual({ mediaItemId: 'd', tier: 'liked', position: 1 });
  });

  it('changes tier when a row is dragged across a divider', () => {
    // ['divider:loved', a, b, 'divider:liked', c, d] → c to index 1.
    expect(dropTarget(reorder(list, 4, 1), 'c')).toEqual({
      mediaItemId: 'c',
      tier: 'loved',
      position: 0,
    });
  });

  it('keeps the tier when a row moves inside it', () => {
    expect(dropTarget(reorder(list, 2, 1), 'b')).toEqual({
      mediaItemId: 'b',
      tier: 'loved',
      position: 0,
    });
  });

  it('counts a demoted row from the divider it landed under', () => {
    // a to the very end: ['divider:loved', b, 'divider:liked', c, d, a].
    expect(dropTarget(reorder(list, 1, 5), 'a')).toEqual({
      mediaItemId: 'a',
      tier: 'liked',
      position: 2,
    });
  });

  it('treats a row dropped above the first divider as the top of the first tier', () => {
    expect(dropTarget(reorder(list, 2, 0), 'b')).toEqual({
      mediaItemId: 'b',
      tier: 'loved',
      position: 0,
    });
  });

  it('has no target for a key that is not in the list', () => {
    expect(dropTarget(list, 'nobody')).toBeNull();
  });
});

describe('tiersFromList', () => {
  const list = toListItems(
    assembleRanking(tiers({ loved: [row('a'), row('b')], liked: [row('c')] })),
  );

  it('puts the rows back under the divider they now sit below, renumbered', () => {
    const moved = [...list];
    const [c] = moved.splice(4, 1);
    if (c) moved.splice(1, 0, c);

    const next = tiersFromList(moved);

    expect(next.loved.map((r) => [r.media_item_id, r.position])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect(next.liked).toEqual([]);
  });

  it('round-trips an untouched list', () => {
    const next = tiersFromList(list);
    expect(next.loved.map((r) => r.media_item_id)).toEqual(['a', 'b']);
    expect(next.liked.map((r) => r.media_item_id)).toEqual(['c']);
    expect(next.fine).toEqual([]);
    expect(next.disliked).toEqual([]);
  });

  it('assembles back into the same ranking it came from', () => {
    const items = assembleRanking(tiersFromList(list));
    expect(items.map((item) => [item.mediaItemId, item.rank, item.score])).toEqual([
      ['a', 1, 10],
      ['b', 2, 8.5],
      ['c', 3, 7.5],
    ]);
  });
});
