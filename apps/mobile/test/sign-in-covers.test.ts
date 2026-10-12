/**
 * The signed-out cover wall's layout, now that its covers come from
 * `popularGames(client, 15)` rather than a fixed list.
 *
 * The wall is three columns of five and the read can return fewer than fifteen
 * rows, or rows with no picture at all, so the two things worth pinning are
 * that the wall is always full and that a row with nothing to show is dropped
 * rather than drawn as a hole.
 *
 * The frame's alternating 160/120/200 heights are gone (Rafa, 2026-09-16):
 * every cover is drawn whole at its own ratio (rule 29) and the stagger now
 * comes from the per-column top offsets, so those are what the layout tests pin
 * instead. No height is asserted anywhere here, which is the point — the height
 * belongs to `coverHeight` and to nothing else.
 */

import { describe, expect, it } from 'vitest';

import {
  COLUMN_TOP_OFFSETS,
  coverColumns,
  popularCoverUrls,
  SIGNED_OUT_COVERS,
  WALL_COLUMNS,
  WALL_ROWS,
  WALL_SLOTS,
} from '../src/screens/sign-in/covers';

/** A `popular_games` row, as narrow as the wall needs it. */
function row(coverImageId: string | null, steamAppId?: number) {
  return {
    id: `id-${coverImageId ?? 'none'}`,
    title: 'A Game',
    year: 2024,
    cover_image_id: coverImageId,
    external_ids: steamAppId === undefined ? { igdb: 1 } : { igdb: 1, steam: steamAppId },
    platforms: ['PC (Microsoft Windows)'],
  };
}

describe('popularCoverUrls', () => {
  it('takes the best URL for each row', () => {
    const urls = popularCoverUrls([row('co4jni'), row('co5vmg')] as never);

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('co4jni');
    expect(urls[1]).toContain('co5vmg');
    // The wall asks for the big cover, as the fallback list does.
    expect(urls[0]).toContain('t_cover_big');
  });

  it('falls through to Steam art for a game with no IGDB cover', () => {
    const urls = popularCoverUrls([row(null, 1145360)] as never);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('1145360');
  });

  it('drops a row with no picture at all rather than leaving a hole', () => {
    expect(popularCoverUrls([row(null), row('co4jni'), row(null)] as never)).toHaveLength(1);
  });

  it('has nothing to say about an empty list', () => {
    expect(popularCoverUrls([])).toEqual([]);
  });
});

describe('coverColumns', () => {
  it('lays fifteen covers out as three columns of five, column-major', () => {
    const urls = Array.from({ length: WALL_SLOTS }, (_, index) => `url-${index}`);
    const columns = coverColumns(urls);

    expect(columns).toHaveLength(WALL_COLUMNS);
    expect(columns.every((column) => column.length === WALL_ROWS)).toBe(true);
    expect(columns[0]).toEqual(['url-0', 'url-1', 'url-2', 'url-3', 'url-4']);
    expect(columns[1]![0]).toBe('url-5');
    expect(columns[2]![0]).toBe('url-10');
    // Every cover on the wall is a different game when there are fifteen.
    expect(new Set(columns.flat()).size).toBe(WALL_SLOTS);
  });

  it('gives plain URLs, with no per-slot height for the art to be cut to', () => {
    expect(coverColumns(['only']).flat()).toEqual(Array.from({ length: WALL_SLOTS }, () => 'only'));
  });

  it('fills the whole wall from a short list rather than leaving gaps', () => {
    const columns = coverColumns(['a', 'b', 'c']);

    expect(columns.flat()).toHaveLength(WALL_SLOTS);
    expect(columns.flat().every((url) => ['a', 'b', 'c'].includes(url))).toBe(true);
  });

  it('gives no columns for an empty list, which is what the caller falls back from', () => {
    expect(coverColumns([])).toEqual([]);
  });
});

describe('the stagger', () => {
  it('starts every column above the top of the screen, each at its own offset', () => {
    expect(COLUMN_TOP_OFFSETS).toHaveLength(WALL_COLUMNS);
    expect(COLUMN_TOP_OFFSETS.every((offset) => offset < 0)).toBe(true);
    // Three different offsets, or the top row would line up into a row again.
    expect(new Set(COLUMN_TOP_OFFSETS).size).toBe(WALL_COLUMNS);
  });
});

describe('the fallback list', () => {
  it('still has exactly one cover per slot', () => {
    expect(SIGNED_OUT_COVERS).toHaveLength(WALL_SLOTS);
    expect(coverColumns(SIGNED_OUT_COVERS).flat()).toHaveLength(WALL_SLOTS);
  });
});
