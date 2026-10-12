/**
 * A Search hit draws its cover, against a real local stack.
 *
 * `search_games` returned `cover_image_id` and not `external_ids` until
 * supabase/migrations/20261008100000_search_games_external_ids.sql, so a game
 * IGDB has no cover for drew the placeholder on Search even when it has a Steam
 * app id. The claim worth a live test is the one `ranking.test.ts` makes for a
 * tier row: the column arrives through the RPC and out of supabase-js as
 * something `coverCandidates` takes without the screen rewriting it first.
 *
 * The local catalog is shared with every other suite in this package, so the
 * titles carry a number taken from the clock and every assertion is scoped to
 * this run's own ids.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { searchGames } from '../src/catalog';
import type { Client } from '../src/client';
import { coverCandidates, steamCoverUrls } from '../src/covers';
import { live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

/** A title nothing else in the catalog shares, so a search for it is a search for these rows. */
const TITLE = `Verso Search Covers ${Date.now()}`;

const STEAM_APP_ID = 1145360;
const IGDB = 'https://images.igdb.com/igdb/image/upload';

describe.skipIf(!live)('searchGames hits and their covers', () => {
  let client: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    client = (await signUpUser('search-covers')).client;

    games = await seedGames([
      // The bug: no IGDB cover, a Steam app id behind it.
      { key: 'steamOnly', title: `${TITLE} Steam Only`, steamAppId: STEAM_APP_ID },
      // Both sources: IGDB first, Steam after.
      { key: 'both', title: `${TITLE} Both`, steamAppId: STEAM_APP_ID },
      // IGDB's cover and nothing behind it.
      { key: 'igdbOnly', title: `${TITLE} IGDB Only` },
    ]);

    // seedGames gives every row a cover; the mirror writes null where IGDB has
    // none, and so does this, as the service role that fills the catalog.
    const { error } = await serviceClient()
      .from('media_items')
      .update({ cover_image_id: null })
      .eq('id', games['steamOnly']!.mediaItemId);
    if (error) throw error;
  });

  afterAll(async () => {
    await stopClients();
  });

  async function hit(key: string) {
    const rows = await searchGames(client, games[key]!.title, { limit: 50 });
    const row = rows.find((r) => r.media_item_id === games[key]!.mediaItemId);
    expect(row, `${key} is among the hits`).toBeDefined();
    return row!;
  }

  it('returns external_ids on every hit, as media_items stores it', async () => {
    expect((await hit('steamOnly')).external_ids).toEqual({
      igdb: games['steamOnly']!.igdbId,
      steam: STEAM_APP_ID,
    });
    expect((await hit('igdbOnly')).external_ids).toEqual({ igdb: games['igdbOnly']!.igdbId });
  });

  it('hands a hit with no IGDB cover to coverCandidates, which falls back to Steam', async () => {
    const row = await hit('steamOnly');

    expect(row.cover_image_id).toBeNull();
    expect(coverCandidates(row)).toEqual(steamCoverUrls(STEAM_APP_ID));
  });

  it('keeps IGDB first when a hit has both', async () => {
    const row = await hit('both');

    expect(coverCandidates(row)).toEqual([
      `${IGDB}/t_cover_big_2x/cover_${games['both']!.igdbId}.jpg`,
      ...steamCoverUrls(STEAM_APP_ID),
    ]);
  });

  it('gives a hit with no Steam id its IGDB cover alone', async () => {
    const row = await hit('igdbOnly');

    expect(coverCandidates(row)).toEqual([
      `${IGDB}/t_cover_big_2x/cover_${games['igdbOnly']!.igdbId}.jpg`,
    ]);
  });
});
