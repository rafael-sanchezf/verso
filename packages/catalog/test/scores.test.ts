import { describe, expect, it } from 'vitest';
import { GAME_FIELDS } from '../src/igdb';
import { mapExternalScores, mapGame, mapSteamMetacritic, mapSteamReviews } from '../src/map';
import type {
  ExternalScoreInput,
  IgdbGame,
  SteamAppDetailsResponse,
  SteamAppReviewsResponse,
} from '../src/types';
import games from './fixtures/igdb-games-ratings.json';
import appReviewsEldenRing from './fixtures/steam-appreviews-elden-ring.json';
import appReviewsNone from './fixtures/steam-appreviews-none.json';
import appDetailsMetacritic from './fixtures/steam-appdetails-metacritic.json';
import appDetailsNoMetacritic from './fixtures/steam-appdetails-no-metacritic.json';
import appDetailsMissing from './fixtures/steam-appdetails-missing.json';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const ITEM = '11111111-2222-3333-4444-555555555555';

/** The recorded games, by IGDB id. Pulled live from IGDB on 2026-09-16. */
const fixture = new Map((games as IgdbGame[]).map((game) => [game.id, game]));

describe('GAME_FIELDS', () => {
  it('asks IGDB for both ratings and both counts', () => {
    for (const field of ['aggregated_rating', 'aggregated_rating_count', 'rating', 'rating_count']) {
      expect(GAME_FIELDS.split(',')).toContain(field);
    }
  });

  it('still asks for total_rating, which stays in metadata rather than becoming a score', () => {
    expect(GAME_FIELDS.split(',')).toContain('total_rating');
    expect(GAME_FIELDS.split(',')).toContain('total_rating_count');
  });
});

describe('mapExternalScores', () => {
  it('splits IGDB into two named sources, critics first', () => {
    const rows = mapExternalScores(fixture.get(119133)!);

    expect(rows).toEqual<ExternalScoreInput[]>([
      { source: 'igdb_critics', score: 96.9, score_count: 10 },
      { source: 'igdb_users', score: 93.43, score_count: 2288 },
    ]);
  });

  it('rounds to the two decimals the column stores', () => {
    // Cyberpunk 2077's live figures: 75.23809523809524 and 83.2272268223649.
    const rows = mapExternalScores(fixture.get(1877)!);

    expect(rows[0]!.score).toBe(75.24);
    expect(rows[1]!.score).toBe(83.23);
  });

  it('never turns total_rating into a score of its own', () => {
    const rows = mapExternalScores(fixture.get(113112)!);

    expect(rows.map((row) => row.source)).toEqual(['igdb_critics', 'igdb_users']);
    expect(rows.some((row) => row.score === fixture.get(113112)!.total_rating)).toBe(false);
  });

  it('skips a source IGDB has no rating for rather than writing a null score', () => {
    const critics: IgdbGame = { id: 1, rating: 80, rating_count: 12 };
    const users: IgdbGame = { id: 2, aggregated_rating: 91, aggregated_rating_count: 4 };

    expect(mapExternalScores(critics)).toEqual([
      { source: 'igdb_users', score: 80, score_count: 12 },
    ]);
    expect(mapExternalScores(users)).toEqual([
      { source: 'igdb_critics', score: 91, score_count: 4 },
    ]);
  });

  it('writes nothing at all for a game IGDB has neither rating for', () => {
    expect(mapExternalScores({ id: 1, name: 'Unrated' })).toEqual([]);
  });

  it('keeps a rating whose count IGDB omitted, with a null count', () => {
    expect(mapExternalScores({ id: 1, rating: 70 })).toEqual([
      { source: 'igdb_users', score: 70, score_count: null },
    ]);
  });

  it('refuses a rating outside 0 to 100, which the column would reject anyway', () => {
    expect(mapExternalScores({ id: 1, rating: 101 })).toEqual([]);
    expect(mapExternalScores({ id: 1, rating: -1 })).toEqual([]);
    expect(mapExternalScores({ id: 1, rating: Number.NaN })).toEqual([]);
  });

  it('keeps the honest ends of the range', () => {
    expect(mapExternalScores({ id: 1, rating: 0 })).toEqual([
      { source: 'igdb_users', score: 0, score_count: null },
    ]);
    expect(mapExternalScores({ id: 1, rating: 100 })).toEqual([
      { source: 'igdb_users', score: 100, score_count: null },
    ]);
  });

  it('refuses a fractional or negative count without losing the score', () => {
    expect(mapExternalScores({ id: 1, rating: 70, rating_count: 2.5 })).toEqual([
      { source: 'igdb_users', score: 70, score_count: null },
    ]);
    expect(mapExternalScores({ id: 1, rating: 70, rating_count: -3 })).toEqual([
      { source: 'igdb_users', score: 70, score_count: null },
    ]);
  });
});

describe('mapGame carries the scores', () => {
  it('attaches the two rows to the mapped game', () => {
    const mapped = mapGame({ ...fixture.get(26192)!, game_type: 0 }, NOW)!;

    expect(mapped.scores).toEqual([
      { source: 'igdb_critics', score: 95.18, score_count: 11 },
      { source: 'igdb_users', score: 90.12, score_count: 1792 },
    ]);
  });

  it('leaves total_rating in metadata, untouched and unrounded', () => {
    const game = fixture.get(26192)!;
    const mapped = mapGame({ ...game, game_type: 0 }, NOW)!;

    expect(mapped.mediaItem.metadata.total_rating).toBe(game.total_rating);
    expect(mapped.mediaItem.metadata.total_rating_count).toBe(game.total_rating_count);
  });

  it('gives an unrated game an empty score list, not a row of nulls', () => {
    const mapped = mapGame({ id: 9, name: 'Nobody has played this', game_type: 0 }, NOW)!;
    expect(mapped.scores).toEqual([]);
  });
});

describe('mapSteamReviews', () => {
  it('computes the positive share from the recorded Elden Ring summary', () => {
    const row = mapSteamReviews(ITEM, appReviewsEldenRing as SteamAppReviewsResponse);

    // 1074572 of 1154945 positive.
    expect(row).toEqual({
      media_item_id: ITEM,
      source: 'steam',
      score: 93.04,
      score_count: 1154945,
    });
  });

  it('says nothing for an app with no reviews, which is also what a bogus app id looks like', () => {
    expect(mapSteamReviews(ITEM, appReviewsNone as SteamAppReviewsResponse)).toBeNull();
  });

  it('ignores Valve\'s own review_score bucket', () => {
    const row = mapSteamReviews(ITEM, {
      query_summary: {
        review_score: 9,
        review_score_desc: 'Overwhelmingly Positive',
        total_positive: 7,
        total_negative: 3,
        total_reviews: 10,
      },
    });

    expect(row!.score).toBe(70);
  });

  it('rounds the percentage to two decimals', () => {
    const row = mapSteamReviews(ITEM, {
      query_summary: { total_positive: 2, total_negative: 1, total_reviews: 3 },
    });

    expect(row!.score).toBe(66.67);
  });

  it('handles the honest ends: all positive and all negative', () => {
    expect(
      mapSteamReviews(ITEM, { query_summary: { total_positive: 40, total_reviews: 40 } })!.score,
    ).toBe(100);
    expect(
      mapSteamReviews(ITEM, { query_summary: { total_positive: 0, total_reviews: 40 } })!.score,
    ).toBe(0);
  });

  it('refuses a summary that contradicts itself or is missing', () => {
    expect(mapSteamReviews(ITEM, {})).toBeNull();
    expect(mapSteamReviews(ITEM, { query_summary: { total_reviews: 10 } })).toBeNull();
    expect(
      mapSteamReviews(ITEM, { query_summary: { total_positive: 11, total_reviews: 10 } }),
    ).toBeNull();
    expect(
      mapSteamReviews(ITEM, { query_summary: { total_positive: -1, total_reviews: 10 } }),
    ).toBeNull();
    expect(
      mapSteamReviews(ITEM, { query_summary: { total_positive: 1.5, total_reviews: 10 } }),
    ).toBeNull();
  });
});

describe('mapSteamMetacritic', () => {
  const entryFor = (response: unknown, appId: string) =>
    (response as SteamAppDetailsResponse)[appId];

  it('reads the licensed score and the page from the recorded response', () => {
    const result = mapSteamMetacritic(ITEM, entryFor(appDetailsMetacritic, '1245620'));

    expect(result.score).toEqual({
      media_item_id: ITEM,
      source: 'metacritic',
      score: 94,
      score_count: null,
    });
    expect(result.url).toContain('metacritic.com/game/pc/elden-ring');
  });

  it('leaves score_count null, because Valve does not say how many critics', () => {
    const result = mapSteamMetacritic(ITEM, entryFor(appDetailsMetacritic, '1245620'));
    expect(result.score!.score_count).toBeNull();
  });

  it('copes with data coming back as an empty array when the filter matched nothing', () => {
    // Recorded from appid 1966720 on 2026-09-16: {"success":true,"data":[]}.
    const result = mapSteamMetacritic(ITEM, entryFor(appDetailsNoMetacritic, '1966720'));

    expect(result).toEqual({ score: null, url: null });
  });

  it('says nothing for an app the storefront does not know', () => {
    const result = mapSteamMetacritic(ITEM, entryFor(appDetailsMissing, '999999999'));
    expect(result).toEqual({ score: null, url: null });
  });

  it('says nothing when the entry is absent altogether', () => {
    expect(mapSteamMetacritic(ITEM, undefined)).toEqual({ score: null, url: null });
  });

  it('keeps the link but writes no score when there is a URL and no number', () => {
    const result = mapSteamMetacritic(ITEM, {
      success: true,
      data: { metacritic: { url: 'https://www.metacritic.com/game/pc/thing' } },
    });

    expect(result.score).toBeNull();
    expect(result.url).toBe('https://www.metacritic.com/game/pc/thing');
  });

  it('refuses a metascore outside 0 to 100', () => {
    const result = mapSteamMetacritic(ITEM, {
      success: true,
      data: { metacritic: { score: 194, url: 'https://www.metacritic.com/x' } },
    });

    expect(result.score).toBeNull();
  });
});
