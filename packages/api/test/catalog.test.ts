/**
 * `popularGames` against a real local stack.
 *
 * The point of this function is that it works when nothing else does, so the
 * test that matters most runs on a client with no session at all: the same
 * `anonClient` the other suites use to prove a read is empty signed out. Here
 * it has to come back full, while a direct read of the table it came from
 * stays empty.
 *
 * The local catalog is shared with every other suite in this package, and
 * with every earlier run of this one on a stack that was not reset. So the
 * games seeded here carry rating counts above anything else in the database:
 * a base taken from the clock, so each run outranks the last, plus the real
 * mirrored catalog never reaches ten billion. The top of the list is then
 * this run's games, whatever else is there.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { popularGames, releaseDates } from '../src/catalog';
import type { Client } from '../src/client';
import { anonClient, live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const STEAM_APP_ID = 1145360;

/**
 * Rating counts nothing else in the local database comes close to, and that a
 * previous run of this suite cannot tie: the clock only goes forward.
 */
const BASE = 10_000_000_000 + Date.now();
const COUNTS: Record<string, number> = {
  most: BASE + 3,
  middle: BASE + 2,
  least: BASE + 1,
};

describe.skipIf(!live)('popularGames against a local stack', () => {
  let signedIn: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    signedIn = (await signUpUser('popular')).client;

    games = await seedGames([
      { key: 'most', steamAppId: STEAM_APP_ID, platforms: ['PC (Microsoft Windows)'] },
      { key: 'middle' },
      { key: 'least' },
      // Left out of the rating counts below: the mirror writes null for a game
      // nobody has rated, and those sort last.
      { key: 'unrated' },
    ]);

    // `metadata` is the mirror's column, so it is written the way the mirror
    // writes it: as the service role, which is how the catalog is filled.
    const service = serviceClient();
    for (const [key, count] of Object.entries(COUNTS)) {
      const { error } = await service
        .from('media_items')
        .update({ metadata: { total_rating_count: count } })
        .eq('id', games[key]!.mediaItemId);
      if (error) throw error;
    }
  });

  afterAll(async () => {
    await stopClients();
  });

  it('answers a signed-out client, which no other catalog read does', async () => {
    const anon = anonClient();

    const rows = await popularGames(anon, 3);
    expect(rows.map((row) => row.title)).toEqual([
      games['most']!.title,
      games['middle']!.title,
      games['least']!.title,
    ]);

    // And the table behind it is still closed: this is the whole claim.
    const { data } = await anon.from('media_items').select('id').limit(1);
    expect(data).toEqual([]);
  });

  it('returns the columns a Search row and a cover need', async () => {
    const row = (await popularGames(anonClient(), 1))[0]!;

    expect(row).toEqual({
      id: games['most']!.mediaItemId,
      title: games['most']!.title,
      year: 2020,
      cover_image_id: `cover_${games['most']!.igdbId}`,
      external_ids: { igdb: games['most']!.igdbId, steam: STEAM_APP_ID },
      platforms: ['PC (Microsoft Windows)'],
    });
  });

  it('gives a signed-in client the same list', async () => {
    const [mine, theirs] = await Promise.all([
      popularGames(signedIn, 3),
      popularGames(anonClient(), 3),
    ]);

    expect(mine).toEqual(theirs);
  });

  it('honours the limit, and lets the database clamp it', async () => {
    expect(await popularGames(anonClient(), 1)).toHaveLength(1);
    expect(await popularGames(anonClient(), 2)).toHaveLength(2);

    // Capped at fifty however much is asked for, and never fewer than one.
    expect((await popularGames(anonClient(), 1_000)).length).toBeLessThanOrEqual(50);
    expect(await popularGames(anonClient(), 0)).toHaveLength(1);
    expect(await popularGames(anonClient(), -5)).toHaveLength(1);
  });

  it('sorts a game nobody has rated below every game somebody has', async () => {
    const rows = await popularGames(anonClient(), 50);
    const titles = rows.map((row) => row.title);

    const least = titles.indexOf(games['least']!.title);
    const unrated = titles.indexOf(games['unrated']!.title);

    expect(least).toBeGreaterThanOrEqual(0);
    // Either it fell off the end of the fifty, or it is below the rated ones.
    expect(unrated === -1 || unrated > least).toBe(true);
  });

  it('defaults to twenty when no limit is given', async () => {
    const rows = await popularGames(anonClient());

    expect(rows.length).toBeLessThanOrEqual(20);
    expect(rows[0]!.title).toBe(games['most']!.title);
  });
});

describe.skipIf(!live)('releaseDates against a local stack', () => {
  let signedIn: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    signedIn = (await signUpUser('release-dates')).client;
    games = await seedGames([
      { key: 'out', releaseDate: '2020-09-17' },
      { key: 'soon', releaseDate: '2099-11-19' },
      { key: 'undated', releaseDate: null },
    ]);
  });

  afterAll(async () => {
    await stopClients();
  });

  it('gives each id its date, null where the catalog has none', async () => {
    const ids = ['out', 'soon', 'undated'].map((key) => games[key]!.mediaItemId);
    // A repeated id is asked about once.
    const rows = await releaseDates(signedIn, [...ids, ids[0]!]);

    expect(new Map(rows.map((row) => [row.mediaItemId, row.releaseDate]))).toEqual(
      new Map([
        [games['out']!.mediaItemId, '2020-09-17'],
        [games['soon']!.mediaItemId, '2099-11-19'],
        [games['undated']!.mediaItemId, null],
      ]),
    );
  });

  it('never reaches the network for no ids', async () => {
    expect(await releaseDates(signedIn, [])).toEqual([]);
  });
});
