/**
 * The two Letterboxd calls against a real local stack.
 *
 * The matcher's rules and the write's refusals are proven in
 * supabase/tests/letterboxd_import.test.sql. What a live test adds is the
 * shape: that a jsonb array of films survives supabase-js, that a match row
 * comes back with the columns `coverCandidates` wants, that the composite the
 * write returns is read as one row, that the default import ranks nothing and
 * fills the diary, and that a ranking the user chose and confirmed is what
 * `tierList('movie', …)` then reads, with its provisional marks.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { applyLetterboxdImport, matchLetterboxdFilms } from '../src/letterboxd';
import { diaryFor } from '../src/diary';
import { insertRankingEntry, tierList } from '../src/ranking';
import { live, seedGames, signUpUser, stopClients, type SeededGame } from './support';

describe.skipIf(!live)('the Letterboxd import against a local stack', () => {
  let alice: Client;
  let films: Record<string, SeededGame>;

  beforeAll(async () => {
    alice = (await signUpUser('lb-a')).client;
    films = await seedGames([
      { key: 'dune', medium: 'movie', title: `Dune Letterboxd ${Date.now()}`, year: 2021, genres: ['Science Fiction'] },
      { key: 'arrival', medium: 'movie', title: `Arrival Letterboxd ${Date.now()}`, year: 2016 },
      { key: 'earned', medium: 'movie', title: `Earned Letterboxd ${Date.now()}`, year: 2010 },
      { key: 'seen', medium: 'movie', title: `Seen Letterboxd ${Date.now()}`, year: 2019 },
    ]);

    await insertRankingEntry(alice, {
      mediaItemId: films['earned']!.mediaItemId,
      medium: 'movie',
      tier: 'loved',
      position: 0,
    });
  });

  afterAll(async () => {
    await stopClients();
  });

  it('matches by title and year, by TMDB id, and says which', async () => {
    const rows = await matchLetterboxdFilms(alice, [
      { key: 'a', title: films['dune']!.title, year: 2021, tmdbId: null },
      // The seed writes the TMDB id as the same number as the IGDB id.
      { key: 'b', title: 'Not the title at all', year: 1900, tmdbId: films['arrival']!.igdbId },
      { key: 'c', title: 'A film the catalog never mirrored', year: 2001, tmdbId: null },
    ]);

    expect(rows.map((row) => row.key)).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({
      media_item_id: films['dune']!.mediaItemId,
      match: 'title',
      genres: ['Science Fiction'],
      cover_image_id: `cover_${films['dune']!.igdbId}`,
    });
    expect(rows[1]).toMatchObject({ media_item_id: films['arrival']!.mediaItemId, match: 'tmdb' });
    expect(rows[2]).toMatchObject({ media_item_id: null, match: null, title: null });
  });

  it('by default marks the films watched, fills the diary, and ranks nothing', async () => {
    const seen = films['seen']!.mediaItemId;
    const args = {
      fileNames: ['diary.csv'],
      films: [
        {
          letterboxdUri: 'https://boxd.it/x0',
          title: 'Seen',
          year: 2019,
          rating: 4.5,
          watchedDates: ['2023-02-01', '2024-05-06'],
          rewatches: 1,
          mediaItemId: seen,
          outcome: 'watched' as const,
        },
      ],
    };

    const result = await applyLetterboxdImport(alice, args);
    expect(result).toMatchObject({ ranked: 0, watched: 1, unmatched: 0, skipped: 0, diary: 2 });

    const diary = await diaryFor(alice, seen);
    expect(diary.map((row) => row.watchedOn).sort()).toEqual(['2023-02-01', '2024-05-06']);

    const { data: entry } = await alice
      .from('user_entries')
      .select('status, finished_at')
      .eq('media_item_id', seen)
      .single();
    expect(entry).toEqual({ status: 'played', finished_at: '2024-05-06' });

    const { count } = await alice
      .from('ranking_entries')
      .select('media_item_id', { count: 'exact', head: true })
      .eq('media_item_id', seen);
    expect(count).toBe(0);

    // The same export again adds no second copy of either watch.
    const again = await applyLetterboxdImport(alice, args);
    expect(again.diary).toBe(0);
    expect(await diaryFor(alice, seen)).toHaveLength(2);
  });

  it('refuses a ranked film without a confirmed order, as a 22023', async () => {
    await expect(
      applyLetterboxdImport(alice, {
        fileNames: [],
        films: [
          {
            letterboxdUri: null,
            title: 'Dune',
            year: 2021,
            rating: 5,
            watchedDates: [],
            rewatches: 0,
            mediaItemId: films['dune']!.mediaItemId,
            outcome: 'ranked',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('writes the order the user chose and confirmed, and tierList reads it back', async () => {
    const result = await applyLetterboxdImport(alice, {
      fileNames: ['ratings.csv'],
      films: [
        {
          letterboxdUri: 'https://boxd.it/x1',
          title: 'Dune',
          year: 2021,
          rating: 5,
          watchedDates: ['2024-03-01'],
          rewatches: 0,
          mediaItemId: films['dune']!.mediaItemId,
          outcome: 'ranked',
        },
        {
          letterboxdUri: 'https://boxd.it/x2',
          title: 'Arrival',
          year: 2016,
          rating: 4,
          watchedDates: [],
          rewatches: 0,
          mediaItemId: films['arrival']!.mediaItemId,
          outcome: 'ranked',
        },
        {
          letterboxdUri: 'https://boxd.it/x3',
          title: 'Unmatched',
          year: null,
          rating: null,
          watchedDates: [],
          rewatches: 0,
          mediaItemId: null,
          outcome: 'unmatched',
        },
      ],
      tiers: {
        loved: [films['dune']!.mediaItemId, films['earned']!.mediaItemId],
        liked: [films['arrival']!.mediaItemId],
        fine: [],
        disliked: [],
      },
      moved: [films['arrival']!.mediaItemId],
    });

    expect(result).toMatchObject({ ranked: 2, watched: 0, unmatched: 1, skipped: 0, diary: 1 });
    expect(result.importId).toMatch(/^[0-9a-f-]{36}$/);

    const loved = await tierList(alice, 'movie', 'loved');
    expect(loved.map((row) => [row.media_item_id, row.placed_by])).toEqual([
      [films['dune']!.mediaItemId, 'prior'],
      [films['earned']!.mediaItemId, 'user'],
    ]);
    const liked = await tierList(alice, 'movie', 'liked');
    expect(liked.map((row) => [row.media_item_id, row.placed_by])).toEqual([[films['arrival']!.mediaItemId, 'user']]);

    const { data: entry } = await alice
      .from('user_entries')
      .select('status, finished_at')
      .eq('media_item_id', films['dune']!.mediaItemId)
      .single();
    expect(entry).toEqual({ status: 'played', finished_at: '2024-03-01' });
  });

  it('refuses an order that drops the earned placement, as a 22023', async () => {
    await expect(
      applyLetterboxdImport(alice, {
        fileNames: [],
        films: [],
        tiers: { loved: [films['dune']!.mediaItemId], liked: [films['arrival']!.mediaItemId], fine: [], disliked: [] },
      }),
    ).rejects.toMatchObject({ code: '22023' });
  });
});
