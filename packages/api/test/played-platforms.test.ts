/**
 * Played-on platforms (decision 19, work queue item 28) against a real local
 * stack: `setPlayedPlatforms`, and the two reads that carry the list, the game
 * page and a tier row. See test/support.ts for what the suite needs in the
 * environment and why it skips without it.
 *
 * The database enforces the rules (catalog spelling and order, no unknown
 * names, an empty list clears), and since decision 26 took ownership out of
 * the product this is the only per-entry platform list there is: the reads
 * carry it, and nothing carries an owned list beside it.
 *
 * Two users, because `set_played_platforms` takes no user id and never will.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import {
  getEntry,
  markFinished,
  setPlayedPlatforms,
  UnknownPlatformError,
} from '../src/entries';
import { insertRankingEntry, tierList } from '../src/ranking';
import { gamePage } from '../src/views';
import { anonClient, live, seedGames, signUpUser, stopClients, type SeededGame } from './support';

const PLATFORMS = ['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch'];

describe.skipIf(!live)('played-on platforms against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    alice = (await signUpUser('played-a')).client;
    bob = (await signUpUser('played-b')).client;
    games = await seedGames([
      { key: 'multi', platforms: PLATFORMS },
      { key: 'fresh', platforms: PLATFORMS },
      { key: 'film', medium: 'movie', title: 'A Film' },
    ]);

    // The flow this exists for: finished, then ranked, then asked where.
    await markFinished(alice, games['multi']!.mediaItemId);
  });

  afterAll(async () => {
    await stopClients();
  });

  it('starts every entry with nothing recorded', async () => {
    const entry = (await getEntry(alice, games['multi']!.mediaItemId))!;
    expect(entry.playedPlatforms).toEqual([]);
  });

  it('stores played platforms with the catalog spelling, in catalog order, duplicates collapsed', async () => {
    const entry = await setPlayedPlatforms(alice, games['multi']!.mediaItemId, [
      'nintendo switch',
      ' PLAYSTATION 5 ',
      'Nintendo Switch',
    ]);

    expect(entry.playedPlatforms).toEqual(['PlayStation 5', 'Nintendo Switch']);
    expect(await getEntry(alice, games['multi']!.mediaItemId)).toEqual(entry);
  });

  it('replaces the list on each write and leaves the status alone', async () => {
    const played = await setPlayedPlatforms(alice, games['multi']!.mediaItemId, ['PlayStation 5']);
    expect(played.playedPlatforms).toEqual(['PlayStation 5']);
    // The status it was finished with is untouched.
    expect(played.status).toBe('played');
    // Decision 26: no owned list rides along.
    expect(played).not.toHaveProperty('ownedPlatforms');
  });

  it('refuses a platform the game is not on with UnknownPlatformError, and writes nothing', async () => {
    const error = await setPlayedPlatforms(alice, games['multi']!.mediaItemId, [
      'PlayStation 5',
      'Dreamcast',
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnknownPlatformError);
    const unknownPlatform = error as UnknownPlatformError;
    expect(unknownPlatform.unknown).toEqual(['Dreamcast']);
    expect(unknownPlatform.known).toEqual(PLATFORMS);
    expect(unknownPlatform.message).toBe('not a platform this game is on: Dreamcast');

    expect((await getEntry(alice, games['multi']!.mediaItemId))!.playedPlatforms).toEqual([
      'PlayStation 5',
    ]);
  });

  it('refuses any platform for a title the catalog lists none for, with an empty known list', async () => {
    const error = await setPlayedPlatforms(alice, games['film']!.mediaItemId, ['PC (Microsoft Windows)']).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(UnknownPlatformError);
    expect((error as UnknownPlatformError).known).toEqual([]);
  });

  it('clears the list with an empty array', async () => {
    const id = games['multi']!.mediaItemId;
    expect((await setPlayedPlatforms(alice, id, [])).playedPlatforms).toEqual([]);
    // Leave it recorded for the reads below.
    await setPlayedPlatforms(alice, id, ['PlayStation 5']);
  });

  it('creates the entry, in the backlog, for a game not tracked yet', async () => {
    const entry = await setPlayedPlatforms(alice, games['fresh']!.mediaItemId, ['PC (Microsoft Windows)']);

    expect(entry.mediaItemId).toBe(games['fresh']!.mediaItemId);
    expect(entry.status).toBe('backlog');
    expect(entry.playedPlatforms).toEqual(['PC (Microsoft Windows)']);
  });

  it('marks each platform on the game page as played or not, and nothing else', async () => {
    const page = (await gamePage(alice, games['multi']!.mediaItemId))!;

    expect(page.entry!.playedPlatforms).toEqual(['PlayStation 5']);
    expect(page.game!.platforms).toEqual([
      { name: 'PC (Microsoft Windows)', played: false },
      { name: 'PlayStation 5', played: true },
      { name: 'Nintendo Switch', played: false },
    ]);
  });

  it('carries the played list on every tier row, and no owned list', async () => {
    await insertRankingEntry(alice, {
      mediaItemId: games['multi']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 0,
    });

    const [row] = await tierList(alice, 'game', 'loved');

    expect(row).toMatchObject({
      media_item_id: games['multi']!.mediaItemId,
      platforms: PLATFORMS,
      played_platforms: ['PlayStation 5'],
    });
    expect(row).not.toHaveProperty('owned_platforms');
  });

  it('keeps one user out of the other user lists', async () => {
    // Bob plays the same game somewhere else. There is no user id to pass, so
    // this can only ever be Bob's own entry.
    const his = await setPlayedPlatforms(bob, games['multi']!.mediaItemId, ['PC (Microsoft Windows)']);
    expect(his.playedPlatforms).toEqual(['PC (Microsoft Windows)']);

    expect((await getEntry(alice, games['multi']!.mediaItemId))!.playedPlatforms).toEqual([
      'PlayStation 5',
    ]);
    expect((await gamePage(bob, games['multi']!.mediaItemId))!.entry!.playedPlatforms).toEqual([
      'PC (Microsoft Windows)',
    ]);
    // Bob has ranked nothing, so none of Alice's tier comes back to him.
    expect(await tierList(bob, 'game', 'loved')).toEqual([]);

    // A raw write aimed at Alice's row reaches nothing.
    const { data, error } = await bob
      .from('user_entries')
      .update({ played_platforms: ['Nintendo Switch'] })
      .eq('id', (await getEntry(alice, games['multi']!.mediaItemId))!.id)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await getEntry(alice, games['multi']!.mediaItemId))!.playedPlatforms).toEqual([
      'PlayStation 5',
    ]);
  });

  it('refuses a signed-out caller outright', async () => {
    await expect(
      setPlayedPlatforms(anonClient(), games['multi']!.mediaItemId, ['PlayStation 5']),
    ).rejects.toThrow();
  });
});
