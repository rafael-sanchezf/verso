/**
 * `profiles.ts` against a real local stack, with two users.
 *
 * Two users, because `profiles` is the one table in this package that every
 * signed-in user can read: the select policy is `using (true)` so the social
 * layer can show a friend's name. That makes it the one place where forgetting
 * a filter is invisible with a single account in the database and wrong with
 * two, so Bob exists mainly to prove that Alice's `getMyProfile` is Alice's.
 * He earns his keep twice more: usernames are unique across the whole table,
 * which is only testable with somebody to collide with, and the update policy
 * is only testable with somebody else's row to fail to write.
 *
 * The usernames carry a per-run stamp. The local stack is not reset between
 * `pnpm test` runs, and a username is unique forever, so a fixed one would pass
 * once and then fail with `username-taken` for the wrong reason.
 *
 * Skipped without a stack; see test/support.ts for the environment it wants.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { NotSignedInError } from '../src/entries';
import { getMyProfile, updateMyProfile, UsernameError } from '../src/profiles';
import { anonClient, live, signUpUser, stopClients } from './support';

/** Lowercase letters and digits only, so it already fits `^[a-z0-9_]{3,24}$`. */
const stamp = Math.random().toString(36).slice(2, 8);
const aliceUsername = `alice_${stamp}`;
const bobUsername = `bob_${stamp}`;

describe.skipIf(!live)('the profile reads and writes against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let aliceId: string;
  let bobId: string;
  let aliceEmail: string;

  beforeAll(async () => {
    const a = await signUpUser('profiles-a');
    const b = await signUpUser('profiles-b');
    alice = a.client;
    aliceId = a.userId;
    aliceEmail = a.email;
    bob = b.client;
    bobId = b.userId;
  });

  afterAll(async () => {
    await stopClients();
  });

  it('returns the row the trigger made, with nothing seeded by an email sign-up', async () => {
    const profile = await getMyProfile(alice);

    expect(profile.id).toBe(aliceId);
    expect(profile.username).toBeNull();
    expect(profile.displayName).toBeNull();
    expect(profile.avatarUrl).toBeNull();
    expect(Number.isNaN(Date.parse(profile.createdAt))).toBe(false);
  });

  it('never puts the email in the profile, which every signed-in user can read', async () => {
    const profile = await getMyProfile(alice);

    expect(JSON.stringify(profile)).not.toContain(aliceEmail);
  });

  it('seeds the name and picture a provider sends, through the real auth API', async () => {
    // Google's callback cannot be driven from a test, but what it leaves behind
    // can: `options.data` is written to the same `auth.users.raw_user_meta_data`
    // the provider's claims land in, which is the column the trigger reads. The
    // full matrix of metadata shapes is in supabase/tests/profiles.test.sql;
    // this is the one that proves the path from a real sign-up to the row.
    const client = anonClient();
    const email = `verso-profiles-google-${Date.now().toString(36)}@example.com`;
    const { error } = await client.auth.signUp({
      email,
      password: 'verso-test-password-123',
      options: {
        data: {
          full_name: 'Grace Hopper',
          name: 'Grace H',
          avatar_url: 'https://lh3.googleusercontent.com/grace-avatar-url',
          picture: 'https://lh3.googleusercontent.com/grace-picture',
        },
      },
    });
    expect(error).toBeNull();

    const profile = await getMyProfile(client);
    expect(profile.displayName).toBe('Grace Hopper');
    expect(profile.avatarUrl).toBe('https://lh3.googleusercontent.com/grace-avatar-url');
    expect(profile.username).toBeNull();
    expect(JSON.stringify(profile)).not.toContain(email);
  });

  it('gives each user their own row, not the first row of a table they can all read', async () => {
    const forAlice = await getMyProfile(alice);
    const forBob = await getMyProfile(bob);

    expect(forAlice.id).toBe(aliceId);
    expect(forBob.id).toBe(bobId);
    expect(forBob.id).not.toBe(forAlice.id);
  });

  it('throws NotSignedInError when there is no session', async () => {
    await expect(getMyProfile(anonClient())).rejects.toBeInstanceOf(NotSignedInError);
    await expect(updateMyProfile(anonClient(), { displayName: 'Nobody' })).rejects.toBeInstanceOf(
      NotSignedInError,
    );
  });

  it('writes the three fields the owner owns and returns the row as it now stands', async () => {
    const updated = await updateMyProfile(alice, {
      displayName: 'Alice Ashby',
      username: aliceUsername,
      avatarUrl: 'https://example.com/alice.png',
    });

    expect(updated).toMatchObject({
      id: aliceId,
      displayName: 'Alice Ashby',
      username: aliceUsername,
      avatarUrl: 'https://example.com/alice.png',
    });
    // And it is not just the returned object: the row really changed.
    expect(await getMyProfile(alice)).toEqual(updated);
  });

  it('leaves the fields a patch does not mention alone', async () => {
    const updated = await updateMyProfile(alice, { displayName: 'Alice A.' });

    expect(updated.displayName).toBe('Alice A.');
    expect(updated.username).toBe(aliceUsername);
    expect(updated.avatarUrl).toBe('https://example.com/alice.png');
  });

  it('trims what it is given and stores blank as null', async () => {
    const trimmed = await updateMyProfile(alice, { displayName: '  Alice Ashby  ' });
    expect(trimmed.displayName).toBe('Alice Ashby');

    const blanked = await updateMyProfile(alice, { displayName: '   ' });
    expect(blanked.displayName).toBeNull();

    const restored = await updateMyProfile(alice, { displayName: 'Alice Ashby' });
    expect(restored.displayName).toBe('Alice Ashby');
  });

  it('clears a field on an explicit null', async () => {
    const cleared = await updateMyProfile(alice, { avatarUrl: null });
    expect(cleared.avatarUrl).toBeNull();
    // Clearing one field is not clearing the row.
    expect(cleared.displayName).toBe('Alice Ashby');
    expect(cleared.username).toBe(aliceUsername);

    const restored = await updateMyProfile(alice, { avatarUrl: 'https://example.com/alice.png' });
    expect(restored.avatarUrl).toBe('https://example.com/alice.png');
  });

  it('reads instead of writing when the patch is empty', async () => {
    const profile = await updateMyProfile(alice, {});

    expect(profile).toEqual(await getMyProfile(alice));
  });

  it('reports a username somebody else holds as username-taken', async () => {
    let caught: unknown;
    try {
      await updateMyProfile(bob, { username: aliceUsername });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UsernameError);
    const error = caught as UsernameError;
    expect(error.kind).toBe('username-taken');
    expect(error.username).toBe(aliceUsername);
    // profile.md puts this message on screen, so it has to read like a sentence.
    expect(error.message).toBe('That username is taken');
    expect(error.cause).toBeTruthy();

    // The refused write left Bob's row exactly as it was.
    expect((await getMyProfile(bob)).username).toBeNull();
  });

  it('reports a username the pattern refuses as username-invalid', async () => {
    for (const bad of ['Alice', 'ab', 'a'.repeat(25), 'alice-ashby', 'alice ashby']) {
      let caught: unknown;
      try {
        await updateMyProfile(bob, { username: bad });
      } catch (error) {
        caught = error;
      }

      expect(caught, `expected ${JSON.stringify(bad)} to be refused`).toBeInstanceOf(UsernameError);
      expect((caught as UsernameError).kind).toBe('username-invalid');
      expect((caught as UsernameError).username).toBe(bad);
    }

    expect((await getMyProfile(bob)).username).toBeNull();
  });

  it('accepts a username nobody holds, and lets it be cleared and taken again', async () => {
    expect((await updateMyProfile(bob, { username: bobUsername })).username).toBe(bobUsername);
    expect((await updateMyProfile(bob, { username: null })).username).toBeNull();
    expect((await updateMyProfile(bob, { username: bobUsername })).username).toBe(bobUsername);
  });

  it('will not let one user write another user row even when they name it by id', async () => {
    // No function here does this; the point is that if one ever tried, RLS would
    // match nothing rather than the write going through.
    const { data, error } = await bob
      .from('profiles')
      .update({ display_name: 'written by bob' })
      .eq('id', aliceId)
      .select('id');

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await getMyProfile(alice)).displayName).toBe('Alice Ashby');
  });

  it('will not let one user insert a profile row', async () => {
    // There is no insert policy: the trigger owns creation.
    const { error } = await bob.from('profiles').insert({ id: crypto.randomUUID() });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('can read another user profile, because the social layer will need to', async () => {
    const { data, error } = await bob
      .from('profiles')
      .select('id, display_name')
      .eq('id', aliceId)
      .single();

    expect(error).toBeNull();
    expect(data!.display_name).toBe('Alice Ashby');
  });
});
