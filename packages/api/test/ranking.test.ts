/**
 * `tierList` against a real local stack.
 *
 * The other ranking wrappers are exercised by the pgTAP suite (the position
 * shuffle is the database's job and that is where it is tested) and by the
 * suites that rank games to have something to read. What needs a live test of
 * its own is the shape of a tier row, because the Ranking tab draws a cover
 * from it: the row has to carry `external_ids` all the way from `media_items`
 * through the RPC and out of supabase-js as something `coverCandidates` will
 * take without being rewritten first.
 *
 * Two users, because `tier_list` takes no user id and never has.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { coverCandidates } from '../src/covers';
import { insertRankingEntry, tierList } from '../src/ranking';
import { anonClient, live, seedGames, signUpUser, stopClients, type SeededGame } from './support';

const STEAM_APP_ID = 1145360;
const IGDB = 'https://images.igdb.com/igdb/image/upload';
const STEAM = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

describe.skipIf(!live)('tierList against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    alice = (await signUpUser('tier-a')).client;
    bob = (await signUpUser('tier-b')).client;

    games = await seedGames([
      // On Steam: the row that proves the fallback is reachable from a ranking.
      { key: 'onSteam', steamAppId: STEAM_APP_ID, genres: ['Role-playing (RPG)'], platforms: ['PC (Microsoft Windows)'] },
      // Not on Steam: IGDB's cover and nothing behind it.
      { key: 'igdbOnly' },
      { key: 'bobOnly' },
    ]);

    await insertRankingEntry(alice, {
      mediaItemId: games['onSteam']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 0,
    });
    await insertRankingEntry(alice, {
      mediaItemId: games['igdbOnly']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 1,
    });
    await insertRankingEntry(bob, {
      mediaItemId: games['bobOnly']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 0,
    });
  });

  afterAll(async () => {
    await stopClients();
  });

  it('returns the tier in order, with the catalog columns the screen reads', async () => {
    const rows = await tierList(alice, 'game', 'loved');

    expect(rows.map((row) => row.media_item_id)).toEqual([
      games['onSteam']!.mediaItemId,
      games['igdbOnly']!.mediaItemId,
    ]);
    expect(rows[0]).toMatchObject({
      position: 0,
      title: games['onSteam']!.title,
      year: 2020,
      cover_image_id: `cover_${games['onSteam']!.igdbId}`,
      genres: ['Role-playing (RPG)'],
      platforms: ['PC (Microsoft Windows)'],
    });
  });

  it('carries external_ids, which is the whole point of this change', async () => {
    const rows = await tierList(alice, 'game', 'loved');

    expect(rows[0]!.external_ids).toEqual({
      igdb: games['onSteam']!.igdbId,
      steam: STEAM_APP_ID,
    });
    expect(rows[1]!.external_ids).toEqual({ igdb: games['igdbOnly']!.igdbId });
  });

  it('hands a ranking row to coverCandidates without rewriting it', async () => {
    const rows = await tierList(alice, 'game', 'loved');

    // The Steam-backed game: IGDB first, then the three Steam paths. Before
    // this change the last three were unreachable from the Ranking tab.
    expect(coverCandidates(rows[0]!)).toEqual([
      `${IGDB}/t_cover_big_2x/cover_${games['onSteam']!.igdbId}.jpg`,
      `${STEAM}/${STEAM_APP_ID}/library_600x900_2x.jpg`,
      `${STEAM}/${STEAM_APP_ID}/library_600x900.jpg`,
      `${STEAM}/${STEAM_APP_ID}/header.jpg`,
    ]);

    // Not on Steam: IGDB's cover is the only candidate, as it always was.
    expect(coverCandidates(rows[1]!)).toEqual([
      `${IGDB}/t_cover_big_2x/cover_${games['igdbOnly']!.igdbId}.jpg`,
    ]);

    // And the size argument still applies to the IGDB URL only.
    expect(coverCandidates(rows[0]!, 't_cover_small')[0]).toBe(
      `${IGDB}/t_cover_small/cover_${games['onSteam']!.igdbId}.jpg`,
    );
  });

  it('shows each user only their own tier', async () => {
    const hers = await tierList(alice, 'game', 'loved');
    const his = await tierList(bob, 'game', 'loved');

    expect(hers).toHaveLength(2);
    expect(his.map((row) => row.media_item_id)).toEqual([games['bobOnly']!.mediaItemId]);
    expect(his[0]!.external_ids).toEqual({ igdb: games['bobOnly']!.igdbId });
  });

  it('returns an empty tier as an empty list, and refuses a signed-out caller outright', async () => {
    expect(await tierList(alice, 'game', 'disliked')).toEqual([]);
    // Unlike the Profile counts, which read tables and come back as zeroes,
    // execute on this function is revoked from anon: there is no such thing as
    // a signed-out tier.
    await expect(tierList(anonClient(), 'game', 'loved')).rejects.toThrow();
  });
});
