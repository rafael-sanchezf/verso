/**
 * The two halves of the V3 prerequisite, against a real local stack:
 * `p_medium` on the two catalog RPCs, and a backlog numbered per medium
 * (supabase/migrations/20260916230000_per_medium_backlog_and_rpcs.sql).
 *
 * A suite of its own rather than lines added to `catalog.test.ts` and
 * `views.test.ts`, because the claim is about what happens when one account
 * holds three media at once, and both of those suites are built around an
 * account that holds one. Everything they assert has to keep passing exactly as
 * written, so nothing here touches them.
 *
 * The local catalog is shared with every other suite in this package and with
 * every earlier run of this one, so nothing below asserts a global ordering.
 * The film and series fixtures carry vote counts taken from the clock, the way
 * `catalog.test.ts` does with rating counts, so this run's titles are at the top
 * of their medium whatever else is in the database; and every membership
 * assertion is scoped to this run's own ids.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { moveBacklogEntry } from '../src/backlog';
import { popularGames, searchGames } from '../src/catalog';
import type { Client } from '../src/client';
import { moveToBacklog } from '../src/entries';
import { backlog } from '../src/views';
import {
  anonClient,
  live,
  seedGames,
  serviceClient,
  signUpUser,
  stopClients,
  type SeededGame,
} from './support';

/** Vote counts nothing in the local database comes close to, and a later run outranks. */
const BASE = 10_000_000_000 + Date.now();

/** A title nothing else in the catalog shares, so a search for it is a search for these rows. */
const TITLE = `Verso Per Medium ${BASE}`;

describe.skipIf(!live)('a medium on the catalog RPCs and under the backlog', () => {
  let client: Client;
  let items: Record<string, SeededGame>;

  beforeAll(async () => {
    client = (await signUpUser('per-medium')).client;

    items = await seedGames([
      { key: 'game', title: `${TITLE} Game`, genres: ['Role-playing (RPG)'] },
      { key: 'game2', title: `${TITLE} Game Two` },
      { key: 'film', medium: 'movie', title: `${TITLE} Film`, genres: ['Science Fiction', 'Drama'] },
      { key: 'film2', medium: 'movie', title: `${TITLE} Film Two`, genres: ['Comedy'] },
      { key: 'series', medium: 'tv', title: `${TITLE} Series`, genres: ['Mystery'] },
    ]);

    // `metadata` is the mirror's column, so it is written as the service role,
    // which is how the catalog is filled.
    const service = serviceClient();
    const counts: Record<string, number> = {
      film: BASE + 2,
      film2: BASE + 1,
      series: BASE + 3,
    };
    for (const [key, vote_count] of Object.entries(counts)) {
      const { error } = await service
        .from('media_items')
        .update({ metadata: { vote_count } })
        .eq('id', items[key]!.mediaItemId);
      if (error) throw error;
    }
  });

  afterAll(async () => {
    await stopClients();
  });

  describe('searchGames', () => {
    it('answers with games when no medium is given, as every existing caller expects', async () => {
      const ids = (await searchGames(client, TITLE, { limit: 50 })).map((row) => row.media_item_id);

      expect(ids).toContain(items['game']!.mediaItemId);
      expect(ids).toContain(items['game2']!.mediaItemId);
      expect(ids).not.toContain(items['film']!.mediaItemId);
      expect(ids).not.toContain(items['series']!.mediaItemId);
    });

    it('finds the film only when it is asked for films', async () => {
      const rows = await searchGames(client, TITLE, { limit: 50, medium: 'movie' });
      const ids = rows.map((row) => row.media_item_id);

      expect(ids).toContain(items['film']!.mediaItemId);
      expect(ids).toContain(items['film2']!.mediaItemId);
      expect(ids).not.toContain(items['game']!.mediaItemId);
      expect(ids).not.toContain(items['series']!.mediaItemId);
    });

    it('takes a film row genres from movie_details, and leaves the game fields honestly empty', async () => {
      const row = (await searchGames(client, `${TITLE} Film`, { limit: 5, medium: 'movie' })).find(
        (hit) => hit.media_item_id === items['film']!.mediaItemId,
      )!;

      expect(row.genres).toEqual(['Science Fiction', 'Drama']);
      expect(row.igdb_id).toBeNull();
      expect(row.developer).toBeNull();
      expect(row.platforms).toEqual([]);
      expect(row.title).toBe(`${TITLE} Film`);
    });

    it('takes a series row genres from tv_details through the same coalesce', async () => {
      const row = (await searchGames(client, `${TITLE} Series`, { limit: 5, medium: 'tv' })).find(
        (hit) => hit.media_item_id === items['series']!.mediaItemId,
      )!;

      expect(row.genres).toEqual(['Mystery']);
    });
  });

  describe('popularGames', () => {
    it('orders films by TMDB vote count and never returns a game or a series', async () => {
      const rows = await popularGames(client, 50, 'movie');
      const ids = rows.map((row) => row.id);

      expect(ids.indexOf(items['film']!.mediaItemId)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(items['film']!.mediaItemId)).toBeLessThan(
        ids.indexOf(items['film2']!.mediaItemId),
      );
      expect(ids).not.toContain(items['game']!.mediaItemId);
      expect(ids).not.toContain(items['series']!.mediaItemId);
    });

    it('puts the series at the top of the series, in its own list', async () => {
      const rows = await popularGames(client, 50, 'tv');

      expect(rows[0]!.id).toBe(items['series']!.mediaItemId);
      // A game's field, and a series has none, so it is empty rather than absent.
      expect(rows[0]!.platforms).toEqual([]);
    });

    it('still answers a signed-out client, for films as it always did for games', async () => {
      const anon = anonClient();

      const rows = await popularGames(anon, 50, 'movie');
      expect(rows.map((row) => row.id)).toContain(items['film']!.mediaItemId);

      // And the table behind it is still closed, which is the whole claim.
      const { data } = await anon.from('media_items').select('id').limit(1);
      expect(data).toEqual([]);
    });

    it('is unchanged for a caller that passes a limit and nothing else', async () => {
      const rows = await popularGames(client, 5);

      // However many games the shared local catalog holds, the limit holds and
      // the films this suite seeded are not among them.
      expect(rows.length).toBeLessThanOrEqual(5);
      expect(rows.map((row) => row.id)).not.toContain(items['film']!.mediaItemId);
      expect(rows.map((row) => row.id)).not.toContain(items['series']!.mediaItemId);
    });
  });

  describe('the backlog', () => {
    beforeAll(async () => {
      // Interleaved on purpose: a film is added between the two games, which
      // under the old per-user numbering would have taken position 1 out of the
      // games' sequence.
      await moveToBacklog(client, items['game']!.mediaItemId);
      await moveToBacklog(client, items['film']!.mediaItemId);
      await moveToBacklog(client, items['game2']!.mediaItemId);
      await moveToBacklog(client, items['film2']!.mediaItemId);
    });

    it('numbers each medium from zero, so a film takes no number out of the games', async () => {
      const games = await backlog(client);
      const films = await backlog(client, { medium: 'movie' });

      expect(games.map((row) => row.mediaItemId)).toEqual([
        items['game']!.mediaItemId,
        items['game2']!.mediaItemId,
      ]);
      expect(films.map((row) => row.mediaItemId)).toEqual([
        items['film']!.mediaItemId,
        items['film2']!.mediaItemId,
      ]);
      expect(games.map((row) => row.entry.backlogPosition)).toEqual([0, 1]);
      expect(films.map((row) => row.entry.backlogPosition)).toEqual([0, 1]);
    });

    it('moves a film without touching the games, and the other way round', async () => {
      const filmEntry = (await backlog(client, { medium: 'movie' }))[1]!.entry.id;
      expect(await moveBacklogEntry(client, { entryId: filmEntry, position: 0 })).toBe(0);

      expect((await backlog(client, { medium: 'movie' })).map((row) => row.mediaItemId)).toEqual([
        items['film2']!.mediaItemId,
        items['film']!.mediaItemId,
      ]);
      expect((await backlog(client)).map((row) => row.mediaItemId)).toEqual([
        items['game']!.mediaItemId,
        items['game2']!.mediaItemId,
      ]);

      const gameEntry = (await backlog(client))[1]!.entry.id;
      expect(await moveBacklogEntry(client, { entryId: gameEntry, position: 0 })).toBe(0);

      expect((await backlog(client)).map((row) => row.mediaItemId)).toEqual([
        items['game2']!.mediaItemId,
        items['game']!.mediaItemId,
      ]);
      expect((await backlog(client, { medium: 'movie' })).map((row) => row.mediaItemId)).toEqual([
        items['film2']!.mediaItemId,
        items['film']!.mediaItemId,
      ]);
    });

    it('clamps to the end of the medium the entry is in, not of every list', async () => {
      const filmEntry = (await backlog(client, { medium: 'movie' }))[0]!.entry.id;

      // Two films, so the last legal index is 1 however far the drag overshoots.
      expect(await moveBacklogEntry(client, { entryId: filmEntry, position: 99 })).toBe(1);
      expect((await backlog(client, { medium: 'movie' })).map((row) => row.entry.backlogPosition)).toEqual([
        0, 1,
      ]);
      expect((await backlog(client)).map((row) => row.entry.backlogPosition)).toEqual([0, 1]);
    });
  });
});
