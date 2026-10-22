/**
 * The joint profile's reads against a real local stack: `recentActivity`,
 * `activityMonth`, `rankerPercentile`, `profileHours`, the public flag on
 * `updateMyProfile`, and `uploadAvatar`. See test/support.ts for what the
 * suite needs in the environment and why it skips without it.
 *
 * The pgTAP suite (supabase/tests/profile_reads.test.sql) proves the rules
 * case by case on fixed dates; this proves the wrappers reach their functions
 * through supabase-js and come back in the shape the screens read.
 *
 * The avatar tests need storage-api, which CI's stack leaves out: they probe
 * the bucket first and skip themselves, with that reason, when it does not
 * answer.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { logSeen, logWatch } from '../src/diary';
import { getEntry, markFinished, setStatus, startRanking, todayLocal } from '../src/entries';
import { activityMonth, profileHours, rankerPercentile, recentActivity } from '../src/profile';
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, getMyProfile, updateMyProfile, uploadAvatar } from '../src/profiles';
import { insertRankingEntry } from '../src/ranking';
import { anonClient, live, seedGames, serviceClient, signUpUser, stopClients, url, type SeededGame } from './support';

// The smallest valid PNG: one transparent pixel.
const PIXEL_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
);

describe.skipIf(!live)('the profile reads against a local stack', () => {
  let alice: Client;
  let aliceId: string;
  let bob: Client;
  let bobId: string;
  let items: Record<string, SeededGame>;
  let storageUp = false;
  const id = (key: string) => items[key]!.mediaItemId;
  const today = todayLocal();
  const [year, month] = today.split('-').map(Number) as [number, number];

  beforeAll(async () => {
    ({ client: alice, userId: aliceId } = await signUpUser('profile-a'));
    ({ client: bob, userId: bobId } = await signUpUser('profile-b'));

    items = await seedGames([
      { key: 'logged', medium: 'movie', genres: ['Drama'] },
      { key: 'seen', medium: 'movie', genres: ['Drama'] },
      { key: 'imported', medium: 'movie', genres: ['Drama'] },
      { key: 'finished', medium: 'game' },
      { key: 'tapped', medium: 'game' },
    ]);

    const service = serviceClient();
    for (const [key, runtime] of [['logged', 120], ['seen', 90]] as const) {
      const { error } = await service.from('movie_details').update({ runtime_minutes: runtime }).eq('media_item_id', id(key));
      if (error) throw error;
    }

    // A film logged through the log sheet and ranked: one "watched" line.
    await logWatch(alice, id('logged'), { place: 'Netflix' });
    await insertRankingEntry(alice, { mediaItemId: id('logged'), medium: 'movie', tier: 'loved', position: 0 });
    // A film seen before Verso and ranked from the deck: one "ranked" line.
    await logSeen(alice, id('seen'));
    await insertRankingEntry(alice, { mediaItemId: id('seen'), medium: 'movie', tier: 'liked', position: 0 });
    // A Letterboxd row with a date: one "watched" line, no runtime in the catalog.
    const imported = await alice.from('watch_log').insert({ media_item_id: id('imported'), watched_on: today, source: 'import' });
    if (imported.error) throw imported.error;
    // A game finished from Playing on purpose, in the one write Home's "Done playing" sends, and ranked.
    await setStatus(alice, id('finished'), 'playing');
    const { error } = await alice
      .from('user_entries')
      .update({ status: 'played', finished_at: today, finished_from: 'playing', playtime_minutes: 600 })
      .eq('media_item_id', id('finished'));
    if (error) throw error;
    await insertRankingEntry(alice, { mediaItemId: id('finished'), medium: 'game', tier: 'loved', position: 0 });
    // A game finished from Playing without finished_from (any finish but "Done playing"): played, no line.
    await setStatus(alice, id('tapped'), 'playing');
    await markFinished(alice, id('tapped'));

    const probe = await service.storage.getBucket(AVATAR_BUCKET);
    storageUp = !probe.error;
  });

  afterAll(async () => {
    await stopClients();
  });

  it('lists Recent across media with the verb by source and the score', async () => {
    const recent = await recentActivity(alice);
    expect(recent).toHaveLength(4);
    const byItem = new Map(recent.map((event) => [event.mediaItemId, event]));
    expect(byItem.get(id('imported'))).toMatchObject({ kind: 'watched', onDate: today, score: null });
    expect(byItem.has(id('tapped'))).toBe(false);
    expect((await getEntry(alice, id('tapped')))!.status).toBe('played');

    expect(byItem.get(id('logged'))).toMatchObject({
      kind: 'watched',
      onDate: today,
      medium: 'movie',
      title: items.logged!.title,
      place: 'Netflix',
      // Alone in Loved: the band's midpoint.
      score: 9.3,
    });
    expect(byItem.get(id('seen'))).toMatchObject({ kind: 'ranked', onDate: today, place: null, score: 7.5 });
    expect(byItem.get(id('finished'))).toMatchObject({ kind: 'finished', onDate: today, medium: 'game', occurredAt: null });
    expect(byItem.get(id('finished'))!.score).toBeCloseTo(9.3);
    expect(typeof byItem.get(id('seen'))!.occurredAt).toBe('string');
  });

  it('filters by medium and caps by limit', async () => {
    const games = await recentActivity(alice, { medium: 'game' });
    expect(games.map((event) => event.mediaItemId)).toEqual([id('finished')]);
    expect(await recentActivity(alice, { limit: 1 })).toHaveLength(1);
    await expect(recentActivity(alice, { limit: 0 })).rejects.toThrow(RangeError);
  });

  it('reads a time zone it does not know as UTC rather than failing', async () => {
    // Compared with UTC rather than with a count: in the evening west of
    // Greenwich today's placements fall on tomorrow in UTC and stop folding.
    const utc = await recentActivity(alice, { timeZone: 'UTC' });
    expect(await recentActivity(alice, { timeZone: 'Not/AZone' })).toEqual(utc);
    expect(await recentActivity(alice, { timeZone: '+05:00' })).toEqual(utc);
  });

  it('reads the month with a day on each row', async () => {
    const rows = await activityMonth(alice, { year, month });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.day === Number(today.slice(8)))).toBe(true);
    expect(await activityMonth(alice, { year, month, medium: 'movie' })).toHaveLength(3);
    expect(await activityMonth(alice, { year: year - 1, month })).toEqual([]);
    await expect(activityMonth(alice, { year, month: 13 })).rejects.toThrow(RangeError);
  });

  it('keeps one user’s activity from another', async () => {
    expect(await recentActivity(bob)).toEqual([]);
    expect(await activityMonth(bob, { year, month })).toEqual([]);
  });

  it('sums the hours: game playtime and one runtime per diary row', async () => {
    expect(await profileHours(alice, { medium: 'game' })).toBe(10);
    expect(await profileHours(alice, { medium: 'movie' })).toBe(3.5);
    expect(await profileHours(alice)).toBe(13.5);
    expect(await profileHours(bob)).toBe(0);
  });

  it('answers the ranker percentile as a share or as null, never for a non-ranker', async () => {
    const share = await rankerPercentile(alice);
    // The cohort is every ranker in this database, which other runs share, so
    // the number is whatever it is; its range and the null rules are not.
    if (share !== null) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(100);
    }
    expect(await rankerPercentile(bob)).toBeNull();
    // Signed out is anon, which may not call it at all.
    await expect(rankerPercentile(anonClient())).rejects.toMatchObject({ code: '42501' });
  });

  it('turns the public flag on for the owner, readable by others', async () => {
    expect((await getMyProfile(alice)).isPublic).toBe(false);
    expect((await updateMyProfile(alice, { isPublic: true })).isPublic).toBe(true);

    const { data, error } = await bob.from('profiles').select('public').eq('id', aliceId).single();
    expect(error).toBeNull();
    expect(data!.public).toBe(true);

    const attempt = await bob.from('profiles').update({ public: false }).eq('id', aliceId).select('id');
    expect(attempt.data ?? []).toEqual([]);
    expect((await getMyProfile(alice)).isPublic).toBe(true);
  });

  it('refuses a photo the bucket would refuse, without a round trip', async () => {
    await expect(uploadAvatar(alice, PIXEL_PNG, { contentType: 'image/gif' as never })).rejects.toThrow(RangeError);
    await expect(uploadAvatar(alice, new Uint8Array(0), { contentType: 'image/png' })).rejects.toThrow(RangeError);
    await expect(
      uploadAvatar(alice, new Uint8Array(AVATAR_MAX_BYTES + 1), { contentType: 'image/png' }),
    ).rejects.toThrow(RangeError);
  });

  it('uploads a photo into the owner’s folder and points avatar_url at it', async (context) => {
    if (!storageUp) context.skip('storage-api is not running on this stack (CI leaves it out)');

    const first = await uploadAvatar(alice, PIXEL_PNG, { contentType: 'image/png' });
    expect(first.avatarUrl).toMatch(new RegExp(`^${url}/storage/v1/object/public/${AVATAR_BUCKET}/${aliceId}/[a-z0-9]+\\.png$`));
    const served = await fetch(first.avatarUrl!);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');

    // A second photo replaces the first: a new URL, and the old file is gone.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await uploadAvatar(alice, PIXEL_PNG, { contentType: 'image/png' });
    expect(second.avatarUrl).not.toBe(first.avatarUrl);
    const listed = await alice.storage.from(AVATAR_BUCKET).list(aliceId);
    expect(listed.error).toBeNull();
    expect(listed.data!.map((object) => `${aliceId}/${object.name}`)).toEqual([
      second.avatarUrl!.split(`/${AVATAR_BUCKET}/`)[1],
    ]);

    // A file written after this call's (a second upload racing it) is never
    // removed by this call's clean-up: only older names go.
    const later = await alice.storage
      .from(AVATAR_BUCKET)
      .upload(`${aliceId}/zzzzzzzz.png`, PIXEL_PNG, { contentType: 'image/png' });
    expect(later.error).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = await uploadAvatar(alice, PIXEL_PNG, { contentType: 'image/png' });
    const names = (await alice.storage.from(AVATAR_BUCKET).list(aliceId)).data!.map((object) => object.name).sort();
    expect(names).toEqual([third.avatarUrl!.split('/').pop()!, 'zzzzzzzz.png'].sort());
  });

  it('keeps one user out of another’s avatar folder', async (context) => {
    if (!storageUp) context.skip('storage-api is not running on this stack (CI leaves it out)');

    const intrusion = await bob.storage
      .from(AVATAR_BUCKET)
      .upload(`${aliceId}/intruder.png`, PIXEL_PNG, { contentType: 'image/png' });
    expect(intrusion.error).not.toBeNull();

    const own = await bob.storage.from(AVATAR_BUCKET).upload(`${bobId}/mine.png`, PIXEL_PNG, { contentType: 'image/png' });
    expect(own.error).toBeNull();
    const peek = await bob.storage.from(AVATAR_BUCKET).list(aliceId);
    expect(peek.data ?? []).toEqual([]);
  });
});

// VER-224, feature-ideas item 13: ranking a game from Playing is not a finish.
describe.skipIf(!live)('a game ranked from Playing, against a local stack', () => {
  let carol: Client;
  let items: Record<string, SeededGame>;
  const today = todayLocal();

  beforeAll(async () => {
    ({ client: carol } = await signUpUser('profile-rank-this'));
    items = await seedGames([
      { key: 'ranked', medium: 'game' },
      { key: 'done', medium: 'game' },
    ]);

    // "Rank this" on a Playing game: no write, then the log flow places it.
    await setStatus(carol, items.ranked!.mediaItemId, 'playing');
    await startRanking(carol, items.ranked!.mediaItemId);
    await insertRankingEntry(carol, { mediaItemId: items.ranked!.mediaItemId, medium: 'game', tier: 'loved', position: 0 });

    // "Done playing": the explicit finish from Playing.
    await setStatus(carol, items.done!.mediaItemId, 'playing');
    await markFinished(carol, items.done!.mediaItemId, { finishedFrom: 'playing' });
  });

  afterAll(async () => {
    await stopClients();
  });

  it('reads "Ranked", keeps the game in Playing, and keeps "Finished" for the explicit finish', async () => {
    const recent = await recentActivity(carol);
    const byItem = new Map(recent.map((event) => [event.mediaItemId, event]));

    expect(byItem.get(items.ranked!.mediaItemId)).toMatchObject({ kind: 'ranked', onDate: today });
    expect(byItem.get(items.ranked!.mediaItemId)!.score).toBeCloseTo(9.3);
    const entry = await getEntry(carol, items.ranked!.mediaItemId);
    expect(entry!.status).toBe('playing');
    expect(entry!.finishedAt).toBeNull();

    expect(byItem.get(items.done!.mediaItemId)).toMatchObject({ kind: 'finished', onDate: today, score: null });
  });
});
