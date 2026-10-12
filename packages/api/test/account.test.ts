/**
 * `account.ts` against a real local stack, with two users.
 *
 * Deleting an account is the one call in this package with no undo, so the
 * things worth proving are the two ends of it: that everything of the caller's
 * really goes -- the auth user, the profile, the entry, the ranking, and the
 * ability to sign in at all -- and that nothing of anyone else's does. Bob is
 * here for the second half. The pgTAP suite
 * (supabase/tests/delete_my_account.test.sql) already walks the cascade table
 * by table inside the database; this suite is about what a client sees, which
 * is the part the Settings screen depends on: the promise resolves, the stored
 * session is gone, and the email cannot be signed into afterwards.
 *
 * Skipped without a stack; see test/support.ts for the environment it wants.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteMyAccount } from '../src/account';
import type { Client } from '../src/client';
import { getEntry, NotSignedInError, setStatus } from '../src/entries';
import { getMyProfile } from '../src/profiles';
import { insertRankingEntry, tierList } from '../src/ranking';
import { anonClient, live, seedGames, serviceClient, signUpUser, stopClients } from './support';

/** The password `signUpUser` signs every test account up with (test/support.ts). */
const password = 'verso-test-password-123';

describe.skipIf(!live)('deleting an account against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let aliceId: string;
  let bobId: string;
  let aliceEmail: string;
  let gameId: string;
  let otherGameId: string;

  beforeAll(async () => {
    const a = await signUpUser('account-a');
    const b = await signUpUser('account-b');
    alice = a.client;
    aliceId = a.userId;
    aliceEmail = a.email;
    bob = b.client;
    bobId = b.userId;

    const seeded = await seedGames([{ key: 'one' }, { key: 'two' }]);
    gameId = seeded.one!.mediaItemId;
    otherGameId = seeded.two!.mediaItemId;

    // The same shape of data for both, so "Alice's went" and "Bob's stayed" are
    // the same assertion run twice.
    for (const [client, medium] of [
      [alice, gameId],
      [bob, gameId],
    ] as const) {
      await setStatus(client, medium, 'played');
      await insertRankingEntry(client, {
        mediaItemId: medium,
        medium: 'game',
        tier: 'loved',
        position: 0,
      });
    }

    await setStatus(alice, otherGameId, 'backlog');
  });

  afterAll(async () => {
    await stopClients();
  });

  it('throws rather than calling anything when there is no session', async () => {
    await expect(deleteMyAccount(anonClient())).rejects.toBeInstanceOf(NotSignedInError);
  });

  it('deletes the account, and the device forgets the session it was using', async () => {
    // Everything is really there first, or the assertions below would pass
    // against an account that never had anything in it.
    expect(await getEntry(alice, gameId)).not.toBeNull();
    expect((await tierList(alice, 'game', 'loved')).length).toBe(1);

    await expect(deleteMyAccount(alice)).resolves.toBeUndefined();

    const { data } = await alice.auth.getSession();
    expect(data.session).toBeNull();

    // And the client is a signed-out client now, not one holding a dead token.
    await expect(deleteMyAccount(alice)).rejects.toBeInstanceOf(NotSignedInError);
  });

  it('leaves nothing behind in the database, profile included', async () => {
    const service = serviceClient();

    const { data: profiles, error: profilesError } = await service
      .from('profiles')
      .select('id')
      .eq('id', aliceId);
    if (profilesError) throw profilesError;
    expect(profiles).toEqual([]);

    const { data: entries, error: entriesError } = await service
      .from('user_entries')
      .select('id')
      .eq('user_id', aliceId);
    if (entriesError) throw entriesError;
    expect(entries).toEqual([]);

    const { data: rankings, error: rankingsError } = await service
      .from('ranking_entries')
      .select('media_item_id')
      .eq('user_id', aliceId);
    if (rankingsError) throw rankingsError;
    expect(rankings).toEqual([]);
  });

  it('cannot be signed into afterwards: the account is gone, not merely emptied', async () => {
    const fresh = anonClient();
    const { data, error } = await fresh.auth.signInWithPassword({ email: aliceEmail, password });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it('leaves the other user with everything they had', async () => {
    const entry = await getEntry(bob, gameId);
    expect(entry?.status).toBe('played');

    const loved = await tierList(bob, 'game', 'loved');
    expect(loved.map((row) => row.media_item_id)).toEqual([gameId]);

    const profile = await getMyProfile(bob);
    expect(profile.id).toBe(bobId);
  });

  it('leaves the catalog alone: it belongs to IGDB, not to an account', async () => {
    const service = serviceClient();
    const { data, error } = await service
      .from('media_items')
      .select('id')
      .in('id', [gameId, otherGameId]);
    if (error) throw error;
    expect(data?.length).toBe(2);
  });
});
