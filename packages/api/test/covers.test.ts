/**
 * `covers.ts` is pure string building, so this suite needs no stack and no
 * network: it asserts the exact URLs, because a typo in a CDN path is invisible
 * in review and shows up as a blank cover on a phone.
 *
 * The interesting half is `coverCandidates` reading `external_ids`, which is
 * jsonb and therefore whatever anyone ever wrote into it. Every shape it can
 * arrive in gets a case here.
 */

import { describe, expect, it } from 'vitest';
import { tmdbPosterUrl } from '../src/covers';
import {
  coverCandidates,
  DEFAULT_COVER_SIZE,
  igdbCoverUrl,
  steamCoverUrls,
  type IgdbImageSize,
} from '../src/covers';

const IGDB = 'https://images.igdb.com/igdb/image/upload';
const STEAM = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

describe('igdbCoverUrl', () => {
  it('builds the documented path', () => {
    expect(igdbCoverUrl('co1r7f', 't_cover_big')).toBe(`${IGDB}/t_cover_big/co1r7f.jpg`);
  });

  it('asks for retina box art unless told otherwise', () => {
    expect(DEFAULT_COVER_SIZE).toBe('t_cover_big_2x');
    expect(igdbCoverUrl('co1r7f')).toBe(`${IGDB}/t_cover_big_2x/co1r7f.jpg`);
  });

  it('takes every size token, base and retina', () => {
    const sizes: IgdbImageSize[] = [
      't_micro',
      't_thumb',
      't_cover_small',
      't_cover_big',
      't_logo_med',
      't_screenshot_med',
      't_screenshot_big',
      't_screenshot_huge',
      't_720p',
      't_1080p',
      't_cover_small_2x',
      't_cover_big_2x',
      't_720p_2x',
      't_1080p_2x',
    ];

    for (const size of sizes) {
      expect(igdbCoverUrl('co1r7f', size)).toBe(`${IGDB}/${size}/co1r7f.jpg`);
    }
  });
});

describe('steamCoverUrls', () => {
  it('returns the three portrait candidates, most portrait and largest first', () => {
    expect(steamCoverUrls(1145360)).toEqual([
      `${STEAM}/1145360/library_600x900_2x.jpg`,
      `${STEAM}/1145360/library_600x900.jpg`,
      `${STEAM}/1145360/header.jpg`,
    ]);
  });

  it('refuses anything that is not an app id', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => steamCoverUrls(bad)).toThrow(RangeError);
    }
  });
});

describe('coverCandidates', () => {
  it('puts IGDB first and Steam behind it', () => {
    expect(coverCandidates({ coverImageId: 'co1r7f', externalIds: { igdb: 7346, steam: 1145360 } })).toEqual([
      `${IGDB}/t_cover_big_2x/co1r7f.jpg`,
      `${STEAM}/1145360/library_600x900_2x.jpg`,
      `${STEAM}/1145360/library_600x900.jpg`,
      `${STEAM}/1145360/header.jpg`,
    ]);
  });

  it('applies the requested size to the IGDB URL only', () => {
    const urls = coverCandidates(
      { coverImageId: 'co1r7f', externalIds: { steam: 1145360 } },
      't_cover_small',
    );

    expect(urls[0]).toBe(`${IGDB}/t_cover_small/co1r7f.jpg`);
    expect(urls.slice(1)).toEqual(steamCoverUrls(1145360));
  });

  it('is just the IGDB cover for a game that is not on Steam', () => {
    expect(coverCandidates({ coverImageId: 'co1r7f', externalIds: { igdb: 7346 } })).toEqual([
      `${IGDB}/t_cover_big_2x/co1r7f.jpg`,
    ]);
  });

  it('falls back to Steam alone when the catalog has no cover', () => {
    expect(coverCandidates({ coverImageId: null, externalIds: { steam: 620 } })).toEqual(
      steamCoverUrls(620),
    );
  });

  it('returns nothing when there is no picture to be had', () => {
    expect(coverCandidates({ coverImageId: null, externalIds: { igdb: 7346 } })).toEqual([]);
    expect(coverCandidates({ coverImageId: null, externalIds: {} })).toEqual([]);
  });

  it('treats a blank cover image id as no cover', () => {
    expect(coverCandidates({ coverImageId: '', externalIds: {} })).toEqual([]);
    expect(coverCandidates({ coverImageId: '   ', externalIds: {} })).toEqual([]);
    expect(coverCandidates({ coverImageId: ' co1r7f ', externalIds: {} })).toEqual([
      `${IGDB}/t_cover_big_2x/co1r7f.jpg`,
    ]);
  });

  it('accepts a Steam app id written as digits', () => {
    // The mirror writes a number; an import or a hand-written row might not.
    expect(coverCandidates({ coverImageId: null, externalIds: { steam: '620' } })).toEqual(
      steamCoverUrls(620),
    );
  });

  it('ignores a steam value that is not an app id rather than building a 404', () => {
    const bad = [
      'not-a-number',
      '',
      '620a',
      '-620',
      '6.20',
      0,
      -620,
      6.2,
      true,
      null,
      [620],
      { id: 620 },
      Number.MAX_VALUE,
    ];

    for (const steam of bad) {
      expect(coverCandidates({ coverImageId: null, externalIds: { steam } as never })).toEqual([]);
    }
  });

  it('survives an external_ids blob that is not an object at all', () => {
    for (const externalIds of [null, 'igdb:7346', 42, true, [{ steam: 620 }]]) {
      expect(coverCandidates({ coverImageId: 'co1r7f', externalIds })).toEqual([
        `${IGDB}/t_cover_big_2x/co1r7f.jpg`,
      ]);
      expect(coverCandidates({ coverImageId: null, externalIds })).toEqual([]);
    }
  });

  /**
   * `tier_list` is an RPC, so its rows arrive spelled the way Postgres named
   * the columns. Both spellings reach the same two fields; nothing else about
   * the function changes.
   */
  describe('given a row straight off an RPC rather than a read model', () => {
    it('reads cover_image_id and external_ids', () => {
      expect(
        coverCandidates({ cover_image_id: 'co1r7f', external_ids: { steam: 1145360 } }),
      ).toEqual([`${IGDB}/t_cover_big_2x/co1r7f.jpg`, ...steamCoverUrls(1145360)]);
    });

    it('takes the size argument the same way', () => {
      expect(
        coverCandidates({ cover_image_id: 'co1r7f', external_ids: {} }, 't_cover_small'),
      ).toEqual([`${IGDB}/t_cover_small/co1r7f.jpg`]);
    });

    it('handles a null cover and a blob that is not an object, the same way', () => {
      expect(coverCandidates({ cover_image_id: null, external_ids: { steam: 620 } })).toEqual(
        steamCoverUrls(620),
      );
      expect(coverCandidates({ cover_image_id: null, external_ids: {} })).toEqual([]);
      expect(coverCandidates({ cover_image_id: 'co1r7f', external_ids: null })).toEqual([
        `${IGDB}/t_cover_big_2x/co1r7f.jpg`,
      ]);
    });
  });
});

describe('tmdbPosterUrl and a film in coverCandidates', () => {
  it('builds the documented path, the stored leading slash included', () => {
    expect(tmdbPosterUrl('/kqjL17yufvn9OVLyXYpvtyrFfak.jpg')).toBe(
      'https://image.tmdb.org/t/p/w342/kqjL17yufvn9OVLyXYpvtyrFfak.jpg',
    );
    expect(tmdbPosterUrl('/a.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/a.jpg');
  });

  it('is what coverCandidates returns for a row whose cover is a TMDB path', () => {
    expect(coverCandidates({ cover_image_id: '/dune.jpg', external_ids: { tmdb: 438631 } })).toEqual([
      'https://image.tmdb.org/t/p/w342/dune.jpg',
    ]);
  });
});
