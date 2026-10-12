/**
 * Two users, one catalog: nothing in this package takes a user id, so this is
 * the suite that proves the boundary actually holds.
 *
 * Every function here reaches the same tables with the same filters for both
 * users. What separates them is Row Level Security and nothing else, so the
 * tests go at it from both directions: the hooks, and then raw PostgREST calls
 * that name the other user's row outright.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { getEntry, removeEntry, setNotes, setStatus } from '../src/entries';
import { exportUserData } from '../src/export';
import { insertRankingEntry } from '../src/ranking';
import { backlog, gamePage, playing } from '../src/views';
import { live, seedGames, signUpUser, stopClients, type SeededGame } from './support';

describe.skipIf(!live)('two users against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let aliceId: string;
  let games: Record<string, SeededGame>;
  let aliceEntryId: string;

  beforeAll(async () => {
    const a = await signUpUser('iso-a');
    const b = await signUpUser('iso-b');
    alice = a.client;
    aliceId = a.userId;
    bob = b.client;

    games = await seedGames([{ key: 'shared' }, { key: 'aliceOnly' }, { key: 'bobOnly' }]);

    const entry = await setStatus(alice, games['shared']!.mediaItemId, 'playing');
    aliceEntryId = entry.id;
    await setNotes(alice, games['shared']!.mediaItemId, "alice's note");
    await setStatus(alice, games['aliceOnly']!.mediaItemId, 'backlog');
    await insertRankingEntry(alice, {
      mediaItemId: games['shared']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 0,
    });

    await setStatus(bob, games['bobOnly']!.mediaItemId, 'backlog');
  });

  afterAll(async () => {
    await stopClients();
  });

  it('both users can read the same catalog row', async () => {
    const forAlice = await gamePage(alice, games['shared']!.mediaItemId);
    const forBob = await gamePage(bob, games['shared']!.mediaItemId);

    expect(forAlice!.title).toBe(games['shared']!.title);
    expect(forBob!.title).toBe(forAlice!.title);
  });

  it('does not show one user the other user entry', async () => {
    expect(await getEntry(bob, games['shared']!.mediaItemId)).toBeNull();
    expect(await getEntry(alice, games['bobOnly']!.mediaItemId)).toBeNull();
  });

  it('keeps the lists apart', async () => {
    expect((await playing(bob)).map((row) => row.mediaItemId)).toEqual([]);
    expect((await backlog(bob)).map((row) => row.mediaItemId)).toEqual([
      games['bobOnly']!.mediaItemId,
    ]);
    expect((await backlog(alice)).map((row) => row.mediaItemId)).toEqual([
      games['aliceOnly']!.mediaItemId,
    ]);
  });

  it('shows each user their own entry and ranking on the same game page', async () => {
    const forAlice = (await gamePage(alice, games['shared']!.mediaItemId))!;
    const forBob = (await gamePage(bob, games['shared']!.mediaItemId))!;

    expect(forAlice.entry!.notes).toBe("alice's note");
    expect(forAlice.ranking).toMatchObject({ tier: 'loved', position: 0 });

    expect(forBob.entry).toBeNull();
    expect(forBob.ranking).toBeNull();
  });

  it('gives each user their own row for the same game, with no effect on the other', async () => {
    const before = (await getEntry(alice, games['shared']!.mediaItemId))!;

    const bobEntry = await setStatus(bob, games['shared']!.mediaItemId, 'dropped');
    expect(bobEntry.id).not.toBe(before.id);
    expect(bobEntry.notes).toBeNull();

    const after = (await getEntry(alice, games['shared']!.mediaItemId))!;
    expect(after).toEqual(before);
  });

  it('removes only the caller entry', async () => {
    await removeEntry(bob, games['shared']!.mediaItemId);

    expect(await getEntry(bob, games['shared']!.mediaItemId)).toBeNull();
    expect((await getEntry(alice, games['shared']!.mediaItemId))!.notes).toBe("alice's note");
  });

  it('exports only the caller data', async () => {
    const document = await exportUserData(bob);

    expect(document.entries.map((entry) => entry.item.igdbId)).toEqual([games['bobOnly']!.igdbId]);
    expect(document.rankings).toEqual([]);
    expect(document.comparisons).toEqual([]);
  });

  it('will not let one user edit another user row even when they name it by id', async () => {
    // No hook does this; the point is that if one ever tried, RLS would silently
    // match nothing rather than the write going through.
    const { data, error } = await bob
      .from('user_entries')
      .update({ notes: 'written by bob' })
      .eq('id', aliceEntryId)
      .select('id');

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await getEntry(alice, games['shared']!.mediaItemId))!.notes).toBe("alice's note");
  });

  it('will not let one user insert a row owned by another', async () => {
    // The insert half of every upsert here carries a user id read from the
    // session. This is the check that makes that safe: a forged one is refused.
    const { error } = await bob.from('user_entries').insert({
      user_id: aliceId,
      media_item_id: games['bobOnly']!.mediaItemId,
      status: 'played',
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});
