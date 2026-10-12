import { describe, expect, it } from 'vitest';

import { fromPopularRow, fromSearchRow } from '../src/screens/onboarding/rows';

describe('fromSearchRow', () => {
  it('carries the facts the session draws, the external ids included', () => {
    expect(
      fromSearchRow({
        media_item_id: 'm1',
        title: 'Hades',
        year: 2020,
        cover_image_id: 'co1',
        external_ids: { igdb: 113112, steam: 1145360 },
        genres: ['Roguelike'],
        platforms: ['PC (Microsoft Windows)'],
      }),
    ).toEqual({
      mediaItemId: 'm1',
      title: 'Hades',
      year: 2020,
      coverImageId: 'co1',
      externalIds: { igdb: 113112, steam: 1145360 },
      genres: ['Roguelike'],
      platforms: ['PC (Microsoft Windows)'],
    });
  });

  it('keeps the Steam id of a hit with no IGDB cover, which is what its cover falls back to', () => {
    const row = fromSearchRow({
      media_item_id: 'm3',
      title: 'Celeste',
      year: 2018,
      cover_image_id: null,
      external_ids: { steam: 504230 },
      genres: [],
      platforms: [],
    });
    expect(row.coverImageId).toBeNull();
    expect(row.externalIds).toEqual({ steam: 504230 });
  });

  it('keeps a missing year and cover as null', () => {
    const row = fromSearchRow({
      media_item_id: 'm2',
      title: 'Untitled',
      year: null,
      cover_image_id: null,
      external_ids: null,
      genres: [],
      platforms: [],
    });
    expect(row.year).toBeNull();
    expect(row.coverImageId).toBeNull();
    expect(row.externalIds).toBeNull();
  });
});

describe('fromPopularRow', () => {
  it('renames the id and keeps the external ids for the Steam cover fallback', () => {
    expect(
      fromPopularRow({
        id: 'm3',
        title: 'Elden Ring',
        year: 2022,
        cover_image_id: null,
        external_ids: { steam: 1245620 },
        platforms: ['PlayStation 5'],
      }),
    ).toEqual({
      mediaItemId: 'm3',
      title: 'Elden Ring',
      year: 2022,
      coverImageId: null,
      externalIds: { steam: 1245620 },
      genres: [],
      platforms: ['PlayStation 5'],
    });
  });
});
