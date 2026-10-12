/**
 * `steam.ts` against a real local stack: the reads, and unlink.
 *
 * The two Edge Functions are not exercised here and cannot be: the CI stack
 * starts without `edge-runtime` (see the `db` job in .github/workflows/ci.yml),
 * and the interesting parts of both -- the OpenID checks, the Steam calls, the
 * four import outcomes -- run against fixtures in Deno instead
 * (supabase/functions/steam-link/*.test.ts, supabase/functions/steam-import/*.test.ts).
 * What is left for this file is exactly what lives in the database: what a
 * signed-in user can read, what they cannot, and what unlinking does.
 *
 * So the library rows go in the way the import writes them -- as the service
 * role, which bypasses RLS the same way the IGDB mirror does -- and come out
 * through the wrappers as an ordinary signed-in user.
 *
 * Two users throughout, with the same game in both libraries at different
 * figures, so "A sees their own" is a claim about rows that genuinely exist for
 * both rather than about an empty table.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { logPlaytime, setStatus } from '../src/entries';
import {
  getSteamLink,
  steamCandidates,
  steamPlaytimeFor,
  unlinkSteam,
} from '../src/steam';
import { live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const HOUR = 60 * 60 * 1000;

/**
 * A SteamID64 no other run will use.
 *
 * Fixed ids were fine until the migration added a unique index on
 * (platform, external_user_id): one Steam account belongs to one user, so a
 * second run of this suite against a database that still holds the first run's
 * rows would collide. Same reasoning as the randomised IGDB ids in
 * `seedGames`. Real SteamID64s start 7656119 and are 17 digits.
 */
function steamId(): string {
  return `7656119${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`;
}

/** One `steam_library` row, as the Edge Function would write it. */
function libraryRow(
  userId: string,
  steamAppId: number,
  mediaItemId: string | null,
  name: string,
  minutes: number,
  extra: { twoWeeks?: number | null; lastPlayedAt?: string | null } = {},
) {
  return {
    user_id: userId,
    steam_app_id: steamAppId,
    media_item_id: mediaItemId,
    name,
    playtime_forever_minutes: minutes,
    playtime_2weeks_minutes: extra.twoWeeks ?? null,
    last_played_at: extra.lastPlayedAt ?? null,
  };
}

describe.skipIf(!live)('the Steam link against a local stack', () => {
  let a: Client;
  let b: Client;
  let aId: string;
  let bId: string;
  let games: Record<string, SeededGame>;
  const steamIds = { a: steamId(), b: steamId() };

  beforeAll(async () => {
    const userA = await signUpUser('steam-a');
    const userB = await signUpUser('steam-b');
    a = userA.client;
    b = userB.client;
    aId = userA.userId;
    bId = userB.userId;

    games = await seedGames([
      { key: 'tracked', title: 'Hades', steamAppId: 1145360 },
      { key: 'manual', title: 'Celeste', steamAppId: 504230 },
      { key: 'untouched', title: 'Tunic', steamAppId: 553420 },
      { key: 'zero', title: 'Dredge', steamAppId: 1562430 },
      { key: 'notOnSteam', title: 'Console Only' },
    ]);

    const service = serviceClient();

    const { error: linkError } = await service.from('platform_links').insert([
      { user_id: aId, platform: 'steam', external_user_id: steamIds.a, sync_status: 'ok' },
      { user_id: bId, platform: 'steam', external_user_id: steamIds.b, sync_status: 'linked' },
    ]);
    if (linkError) throw linkError;

    const { error: libraryError } = await service.from('steam_library').insert([
      libraryRow(aId, 1145360, games['tracked']!.mediaItemId, 'Hades', 1200, {
        twoWeeks: 60,
        lastPlayedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      }),
      libraryRow(aId, 504230, games['manual']!.mediaItemId, 'Celeste', 300),
      libraryRow(aId, 553420, games['untouched']!.mediaItemId, 'Tunic', 450),
      libraryRow(aId, 1562430, games['zero']!.mediaItemId, 'Dredge', 0),
      // Unresolved: a tool, a demo, or a game the catalog has not mirrored.
      libraryRow(aId, 999_999, null, 'Some Level Editor', 10),
      // B owns Hades too, with a different figure.
      libraryRow(bId, 1145360, games['tracked']!.mediaItemId, 'Hades', 5000),
    ]);
    if (libraryError) throw libraryError;

    // A tracks two of the five: the rest are what "owned but untracked" means.
    await setStatus(a, games['tracked']!.mediaItemId, 'playing');
    await setStatus(a, games['manual']!.mediaItemId, 'played');
    await logPlaytime(a, games['manual']!.mediaItemId, 999);
  });

  afterAll(async () => {
    await stopClients();
  });

  it('reads the caller own link, and only theirs', async () => {
    const linkA = await getSteamLink(a);
    const linkB = await getSteamLink(b);

    expect(linkA?.steamId).toBe(steamIds.a);
    expect(linkA?.syncStatus).toBe('ok');
    // Same table, no user id in the query: RLS has already filtered it.
    expect(linkB?.steamId).toBe(steamIds.b);
  });

  it('has no link for someone who has never linked one', async () => {
    const user = await signUpUser('steam-unlinked');

    expect(await getSteamLink(user.client)).toBeNull();
  });

  it('reads one game playtime, with the two-week figure and when it was last played', async () => {
    const playtime = await steamPlaytimeFor(a, games['tracked']!.mediaItemId);

    expect(playtime?.steamAppId).toBe(1145360);
    expect(playtime?.playtimeForeverMinutes).toBe(1200);
    expect(playtime?.playtime2weeksMinutes).toBe(60);
    expect(playtime?.lastPlayedAt).not.toBeNull();
    expect(Date.parse(playtime!.fetchedAt)).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('reads null rather than zero for a game the library says nothing about', async () => {
    expect(await steamPlaytimeFor(a, games['notOnSteam']!.mediaItemId)).toBeNull();
  });

  it('keeps a real zero distinct from "no figure"', async () => {
    // Steam said zero, which may mean never played or may mean the total is
    // hidden. Either way it is an answer and null is not.
    const playtime = await steamPlaytimeFor(a, games['zero']!.mediaItemId);

    expect(playtime?.playtimeForeverMinutes).toBe(0);
  });

  it('never reads another user figure for the same game', async () => {
    const forA = await steamPlaytimeFor(a, games['tracked']!.mediaItemId);
    const forB = await steamPlaytimeFor(b, games['tracked']!.mediaItemId);

    expect(forA?.playtimeForeverMinutes).toBe(1200);
    expect(forB?.playtimeForeverMinutes).toBe(5000);
  });

  it('cannot reach another user library rows at all', async () => {
    const { data, error } = await b
      .from('steam_library')
      .select('steam_app_id')
      .eq('user_id', aId);

    // Not an error: RLS filters rather than refuses, which is what makes an
    // accidental cross-user query return nothing instead of half an answer.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('offers the games owned on Steam and not tracked here, least played first', async () => {
    const candidates = await steamCandidates(a);

    expect(candidates.map((candidate) => candidate.title)).toEqual(['Dredge', 'Tunic']);
    expect(candidates[0]!.playtimeForeverMinutes).toBe(0);
    expect(candidates[0]!.mediaItemId).toBe(games['zero']!.mediaItemId);
    // Enough to draw a row and to accept it as an entry.
    expect(candidates[0]!.steamAppId).toBe(1562430);
    expect(candidates[0]!.coverImageId).not.toBeNull();
    expect(candidates[0]!.externalIds).toMatchObject({ steam: 1562430 });
  });

  it('leaves an app the catalog cannot resolve out of the offer', async () => {
    const candidates = await steamCandidates(a);

    // Stored, because dropping it would make every import re-fetch and re-fail
    // on it, but never offered: there is no game for the app to show or rank.
    expect(candidates.some((candidate) => candidate.name === 'Some Level Editor')).toBe(false);
  });

  it('stops offering a game the moment it is tracked', async () => {
    const before = await steamCandidates(a);
    expect(before.some((candidate) => candidate.title === 'Tunic')).toBe(true);

    await setStatus(a, games['untouched']!.mediaItemId, 'backlog');
    const after = await steamCandidates(a);

    expect(after.map((candidate) => candidate.title)).toEqual(['Dredge']);

    // Put it back, so the suite's order does not matter to anything after this.
    await a.from('user_entries').delete().eq('media_item_id', games['untouched']!.mediaItemId);
  });

  it('honours a limit and clamps an absurd one', async () => {
    expect(await steamCandidates(a, 1)).toHaveLength(1);
    expect(await steamCandidates(a, 100_000)).toHaveLength(2);
  });

  it('offers each user their own library and nobody else', async () => {
    // B owns Hades at a different figure and tracks nothing, so Hades is B's
    // one candidate -- and A, who is playing it, is never offered it.
    const forB = await steamCandidates(b);
    expect(forB.map((candidate) => candidate.title)).toEqual(['Hades']);
    expect(forB[0]!.playtimeForeverMinutes).toBe(5000);
    expect((await steamCandidates(a)).some((c) => c.title === 'Hades')).toBe(false);
  });

  it('offers nothing to a user with no library', async () => {
    const fresh = await signUpUser('steam-empty');

    expect(await steamCandidates(fresh.client)).toEqual([]);
  });
});

describe.skipIf(!live)('unlinking Steam', () => {
  let client: Client;
  let userId: string;
  let other: Client;
  let otherId: string;
  let games: Record<string, SeededGame>;
  const steamIds = { mine: steamId(), other: steamId() };

  // Its own users, because unlinking is destructive and a suite that shares
  // fixtures with it would depend on the order the tests happen to run in.
  beforeAll(async () => {
    const user = await signUpUser('steam-unlink');
    const bystander = await signUpUser('steam-bystander');
    client = user.client;
    userId = user.userId;
    other = bystander.client;
    otherId = bystander.userId;

    games = await seedGames([
      { key: 'played', title: 'Outer Wilds', steamAppId: 753640 },
      { key: 'owned', title: 'Stardew Valley', steamAppId: 413150 },
    ]);

    const service = serviceClient();
    const { error: linkError } = await service.from('platform_links').insert([
      { user_id: userId, platform: 'steam', external_user_id: steamIds.mine },
      { user_id: otherId, platform: 'steam', external_user_id: steamIds.other },
    ]);
    if (linkError) throw linkError;

    const { error: libraryError } = await service.from('steam_library').insert([
      libraryRow(userId, 753640, games['played']!.mediaItemId, 'Outer Wilds', 900),
      libraryRow(userId, 413150, games['owned']!.mediaItemId, 'Stardew Valley', 120),
      libraryRow(otherId, 753640, games['played']!.mediaItemId, 'Outer Wilds', 42),
    ]);
    if (libraryError) throw libraryError;

    await setStatus(client, games['played']!.mediaItemId, 'played');

    // Stand in for what the import writes: the figure and its source.
    const { error } = await serviceClient()
      .from('user_entries')
      .update({ playtime_minutes: 900, playtime_source: 'steam' })
      .eq('user_id', userId)
      .eq('media_item_id', games['played']!.mediaItemId);
    if (error) throw error;
  });

  afterAll(async () => {
    await stopClients();
  });

  it('drops the link and the stored library, and keeps the playtime', async () => {
    await unlinkSteam(client);

    expect(await getSteamLink(client)).toBeNull();
    expect(await steamPlaytimeFor(client, games['played']!.mediaItemId)).toBeNull();
    expect(await steamCandidates(client)).toEqual([]);

    // The number is the user's data now, and it still says where it came from:
    // rule 21, every number carries its source.
    const { data, error } = await client
      .from('user_entries')
      .select('playtime_minutes, playtime_source')
      .eq('media_item_id', games['played']!.mediaItemId)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ playtime_minutes: 900, playtime_source: 'steam' });
  });

  it('leaves everyone else alone', async () => {
    const link = await getSteamLink(other);

    expect(link?.steamId).toBe(steamIds.other);
    expect((await steamPlaytimeFor(other, games['played']!.mediaItemId))?.playtimeForeverMinutes)
      .toBe(42);
  });

  it('is not an error when there is nothing to unlink', async () => {
    await expect(unlinkSteam(client)).resolves.toBeUndefined();
  });
});
