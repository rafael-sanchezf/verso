import { describe, expect, it } from 'vitest';
import { mapGame, mapTimeToBeat } from '../src/map';
import type { IgdbGame, IgdbTimeToBeat } from '../src/types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

/** Hades as IGDB returns it, with every requested field populated. */
const hades: IgdbGame = {
  id: 113112,
  name: 'Hades',
  first_release_date: 1600128000, // 2020-09-15
  cover: { id: 1, image_id: 'co39vc' },
  genres: [{ name: 'Role-playing (RPG)' }, { name: 'Indie' }],
  platforms: [{ name: 'PC (Microsoft Windows)' }, { name: 'Nintendo Switch' }],
  involved_companies: [
    { developer: false, company: { name: 'Private Division' } },
    { developer: true, company: { name: 'Supergiant Games' } },
    { developer: true, company: { name: 'Some Other Studio' } },
  ],
  summary: 'A rogue-like dungeon crawler.',
  total_rating: 90.5,
  total_rating_count: 1234,
  game_type: 0,
  updated_at: 1757894400,
};

describe('mapGame', () => {
  it('maps a fully populated game to both rows', () => {
    const mapped = mapGame(hades, NOW);

    expect(mapped).not.toBeNull();
    expect(mapped!.mediaItem).toEqual({
      medium: 'game',
      title: 'Hades',
      year: 2020,
      release_date: '2020-09-15',
      cover_image_id: 'co39vc',
      external_ids: { igdb: 113112 },
      metadata: {
        total_rating: 90.5,
        total_rating_count: 1234,
        game_type: 0,
        parent_game: null,
        version_parent: null,
      },
      refreshed_at: '2026-09-15T12:00:00.000Z',
    });
    expect(mapped!.gameDetails).toEqual({
      igdb_id: 113112,
      platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
      genres: ['Role-playing (RPG)', 'Indie'],
      developer: 'Supergiant Games',
      summary: 'A rogue-like dungeon crawler.',
    });
  });

  it('takes the first company flagged developer, not the first company', () => {
    expect(mapGame(hades, NOW)!.gameDetails.developer).toBe('Supergiant Games');
  });

  it('reads the release year in UTC, not the local zone', () => {
    // 2021-01-01T00:30:00Z is still 2020 in every zone west of UTC.
    const newYear: IgdbGame = { ...hades, first_release_date: 1609461000 };
    expect(mapGame(newYear, NOW)!.mediaItem.year).toBe(2021);
  });

  it('reads the full release date in UTC too, so a runner and a laptop agree', () => {
    const newYear: IgdbGame = { ...hades, first_release_date: 1609461000 };
    expect(mapGame(newYear, NOW)!.mediaItem.release_date).toBe('2021-01-01');
  });

  it('keeps release_date and year as two views of one instant', () => {
    const mapped = mapGame(hades, NOW)!.mediaItem;
    expect(mapped.release_date!.slice(0, 4)).toBe(String(mapped.year));
  });

  it('leaves release_date null when IGDB has no date, rather than guessing', () => {
    const unannounced: IgdbGame = { ...hades, first_release_date: undefined };
    const mapped = mapGame(unannounced, NOW)!.mediaItem;

    expect(mapped.release_date).toBeNull();
    expect(mapped.year).toBeNull();
  });

  it('maps a release before 1970 without wrapping', () => {
    // IGDB stores pre-epoch releases as negative unix seconds.
    const doom: IgdbGame = { ...hades, first_release_date: -86400 };
    expect(mapGame(doom, NOW)!.mediaItem.release_date).toBe('1969-12-31');
  });

  it('nulls every optional field IGDB omits and empties the joined lists', () => {
    const sparse: IgdbGame = { id: 42, name: 'Untitled Jam Game', game_type: 0 };
    const mapped = mapGame(sparse, NOW)!;

    expect(mapped.mediaItem).toEqual({
      medium: 'game',
      title: 'Untitled Jam Game',
      year: null,
      release_date: null,
      cover_image_id: null,
      external_ids: { igdb: 42 },
      metadata: {
        total_rating: null,
        total_rating_count: null,
        game_type: 0,
        parent_game: null,
        version_parent: null,
      },
      refreshed_at: NOW.toISOString(),
    });
    expect(mapped.gameDetails).toEqual({
      igdb_id: 42,
      platforms: [],
      genres: [],
      developer: null,
      summary: null,
    });
  });

  it('maps a remake to a row of its own, with its own year and date and its parent ids carried', () => {
    // The shape IGDB files a remake in: game_type 8, its own release, and a
    // pointer back to the original when IGDB has one. Ids are illustrative.
    const remake: IgdbGame = {
      id: 900001,
      name: 'A Remade Classic',
      game_type: 8,
      first_release_date: Date.UTC(2026, 10, 5) / 1000,
      cover: { image_id: 'co_remake' },
      parent_game: 1029,
    };
    const mapped = mapGame(remake, NOW)!;

    expect(mapped.mediaItem.external_ids).toEqual({ igdb: 900001 });
    expect(mapped.mediaItem.year).toBe(2026);
    expect(mapped.mediaItem.release_date).toBe('2026-11-05');
    expect(mapped.mediaItem.metadata).toEqual({
      total_rating: null,
      total_rating_count: null,
      game_type: 8,
      parent_game: 1029,
      version_parent: null,
    });
  });

  it('drops a game with no name, because media_items.title is NOT NULL', () => {
    expect(mapGame({ id: 7, game_type: 0 }, NOW)).toBeNull();
  });

  it('skips joined entries that carry no name', () => {
    const partial: IgdbGame = { ...hades, genres: [{ id: 5 }, { name: 'Shooter' }] };
    expect(mapGame(partial, NOW)!.gameDetails.genres).toEqual(['Shooter']);
  });

  it('is pure: the same input and instant give the same output', () => {
    expect(mapGame(hades, NOW)).toEqual(mapGame(hades, NOW));
  });

  it('has no developer when no involved company is flagged as one', () => {
    const publisherOnly: IgdbGame = {
      ...hades,
      involved_companies: [{ developer: false, company: { name: 'Publisher Only' } }],
    };
    expect(mapGame(publisherOnly, NOW)!.gameDetails.developer).toBeNull();
  });
});

/** Hades' time-to-beat row, exactly as the endpoint returned it on 2026-09-15. */
const hadesTimeToBeat: IgdbTimeToBeat = {
  id: 2005,
  game_id: 113112,
  hastily: 139240,
  normally: 253600,
  completely: 542700,
  count: 13,
};

describe('mapTimeToBeat', () => {
  it('maps the triple onto the game_details columns, keyed by IGDB id', () => {
    expect(mapTimeToBeat(hadesTimeToBeat)).toEqual({
      igdb_id: 113112,
      hastily_seconds: 139240,
      normally_seconds: 253600,
      completely_seconds: 542700,
    });
  });

  it("keys on game_id, never on the aggregate row's own id", () => {
    expect(mapTimeToBeat(hadesTimeToBeat)!.igdb_id).not.toBe(hadesTimeToBeat.id);
  });

  it('nulls the figures IGDB omits and keeps the ones it sends', () => {
    expect(mapTimeToBeat({ game_id: 42, normally: 3600, count: 1 })).toEqual({
      igdb_id: 42,
      hastily_seconds: null,
      normally_seconds: 3600,
      completely_seconds: null,
    });
  });

  it('drops a row with no figures at all, so it cannot blank what we have', () => {
    expect(mapTimeToBeat({ game_id: 42, count: 0 })).toBeNull();
  });

  it('nulls a negative figure rather than letting the check constraint kill the batch', () => {
    expect(mapTimeToBeat({ game_id: 42, hastily: -5, normally: 3600 })).toEqual({
      igdb_id: 42,
      hastily_seconds: null,
      normally_seconds: 3600,
      completely_seconds: null,
    });
  });

  it('rounds to whole seconds, because the columns are integers', () => {
    expect(mapTimeToBeat({ game_id: 42, normally: 3600.6 })!.normally_seconds).toBe(3601);
  });

  it("allows zero, which the column's >= 0 check also allows", () => {
    expect(mapTimeToBeat({ game_id: 42, hastily: 0 })).toEqual({
      igdb_id: 42,
      hastily_seconds: 0,
      normally_seconds: null,
      completely_seconds: null,
    });
  });
});
