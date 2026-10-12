import { describe, expect, it } from 'vitest';
import { catalogTrim, KEPT_GAME_TYPES, RECENT_RELEASE_DAYS } from '../src/trim';
import type { IgdbGame } from '../src/types';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const CUTOFF = NOW_SECONDS - RECENT_RELEASE_DAYS * 24 * 60 * 60;

const base: IgdbGame = {
  id: 1,
  name: 'A Game',
  game_type: 0,
  cover: { image_id: 'co1' },
  total_rating_count: 10,
  first_release_date: CUTOFF - 10_000, // older than the recency window
};

describe('catalogTrim', () => {
  it('builds a where clause carrying the same three conditions', () => {
    const { where } = catalogTrim(NOW);
    expect(where).toBe(
      `game_type = (0,8) & cover != null & (total_rating_count >= 1 | first_release_date >= ${CUTOFF})`,
    );
  });

  it('keeps a rated main game with a cover', () => {
    expect(catalogTrim(NOW).keep(base)).toBe(true);
  });

  it('keeps an unrated main game released inside the recency window', () => {
    const fresh: IgdbGame = {
      ...base,
      total_rating_count: 0,
      first_release_date: CUTOFF + 1,
    };
    expect(catalogTrim(NOW).keep(fresh)).toBe(true);
  });

  it('drops an unrated game released before the recency window', () => {
    const stale: IgdbGame = { ...base, total_rating_count: 0 };
    expect(catalogTrim(NOW).keep(stale)).toBe(false);
  });

  it('drops an unrated game with no release date at all', () => {
    const undated: IgdbGame = { ...base, total_rating_count: undefined, first_release_date: undefined };
    expect(catalogTrim(NOW).keep(undated)).toBe(false);
  });

  it('keeps main games and remakes, and nothing else', () => {
    expect(KEPT_GAME_TYPES).toEqual([0, 8]);
  });

  it('keeps a remake as a game of its own (game_type 8)', () => {
    expect(catalogTrim(NOW).keep({ ...base, game_type: 8 })).toBe(true);
  });

  it('keeps an unrated remake that has not come out yet, so it is searchable before release', () => {
    const upcoming: IgdbGame = {
      ...base,
      game_type: 8,
      total_rating_count: undefined,
      first_release_date: NOW_SECONDS + 60 * 24 * 60 * 60,
    };
    expect(catalogTrim(NOW).keep(upcoming)).toBe(true);
  });

  it('holds a remake to the same cover and rating rule as a main game', () => {
    const remake: IgdbGame = { ...base, game_type: 8 };
    expect(catalogTrim(NOW).keep({ ...remake, cover: undefined })).toBe(false);
    expect(catalogTrim(NOW).keep({ ...remake, total_rating_count: 0 })).toBe(false);
  });

  it('drops every other game_type, ports, remasters and expanded games included', () => {
    // 1 DLC, 2 expansion, 3 bundle, 4 standalone expansion, 5 mod, 6 episode,
    // 7 season, 9 remaster, 10 expanded game, 11 port, 12 fork, 13 pack, 14 update.
    for (const gameType of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, undefined]) {
      expect(catalogTrim(NOW).keep({ ...base, game_type: gameType })).toBe(false);
    }
  });

  it('drops a game with no cover', () => {
    expect(catalogTrim(NOW).keep({ ...base, cover: undefined })).toBe(false);
    expect(catalogTrim(NOW).keep({ ...base, cover: { id: 9 } })).toBe(false);
  });

  it('moves its cutoff with the reference instant', () => {
    const later = new Date('2027-09-15T12:00:00.000Z');
    expect(catalogTrim(later).where).not.toBe(catalogTrim(NOW).where);

    const onTheOldCutoff: IgdbGame = {
      ...base,
      total_rating_count: 0,
      first_release_date: CUTOFF + 1,
    };
    expect(catalogTrim(NOW).keep(onTheOldCutoff)).toBe(true);
    expect(catalogTrim(later).keep(onTheOldCutoff)).toBe(false);
  });
});
