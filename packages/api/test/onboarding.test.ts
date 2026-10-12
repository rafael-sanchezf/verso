/**
 * The onboarding backend against a real local stack: the profile's platforms
 * and media, the events, the provisional mark through the wrappers, the deck's
 * candidates with their boost, the batch's guesses, and the drain.
 *
 * The pgTAP suite (supabase/tests/onboarding_backend.test.sql) proves the
 * rules; this proves the wrappers: that each call reaches its function by
 * name through supabase-js, that two of them get through the security definer
 * boundary with the caller's session and nobody else's, and that the rows come
 * out in the camelCase shapes @verso/core reads, so `orderDeck` and a batch
 * item take them as they are.
 *
 * The local stack is not reset between runs and its catalog is shared with
 * every other suite, so every fixture a query could find by name (the deck's
 * platform, the profile's genres) carries a per-run stamp. The deck's games
 * carry small rating counts, 1 to 4: on this run's own platform nothing else
 * competes with them, and in the whole catalog they stay far below the
 * popularGames suite's fixtures, which must lead that list.
 */

import { orderDeck } from '@verso/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { markFinished, setStatus } from '../src/entries';
import { logEvent, type EventKind } from '../src/events';
import { batchPredictions, deckCandidates, playedNotRanked } from '../src/onboarding';
import { getMyProfile, setProfileMedia, setProfilePlatforms, updateMyProfile, UsernameError } from '../src/profiles';
import { finishInsertion, insertRankingEntry, moveRankingEntry, tierList } from '../src/ranking';
import { live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const stamp = Math.random().toString(36).slice(2, 8);
const DECK_PLATFORM = `Deck Platform ${stamp}`;
const OTHER_PLATFORM = `Deck Other ${stamp}`;
const LOVED_GENRE = `Loved Genre ${stamp}`;
const DISLIKED_GENRE = `Disliked Genre ${stamp}`;

/** Give catalog rows a rating count, the deck's popularity signal, the way the mirror writes it. */
async function setRatingCounts(counts: Record<string, number>): Promise<void> {
  const service = serviceClient();
  for (const [id, count] of Object.entries(counts)) {
    const { error } = await service.from('media_items').update({ metadata: { total_rating_count: count } }).eq('id', id);
    if (error) throw error;
  }
}

describe.skipIf(!live)('the onboarding backend against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let carol: Client;
  let aliceId: string;
  let games: Record<string, SeededGame>;
  const id = (key: string) => games[key]!.mediaItemId;

  beforeAll(async () => {
    const a = await signUpUser('onboard-a');
    alice = a.client;
    aliceId = a.userId;
    bob = (await signUpUser('onboard-b')).client;
    carol = (await signUpUser('onboard-c')).client;

    games = await seedGames([
      // Alice's ranked list: two loved games of one genre, two disliked of another.
      { key: 'loved1', genres: [LOVED_GENRE], platforms: [OTHER_PLATFORM] },
      { key: 'loved2', genres: [LOVED_GENRE], platforms: [OTHER_PLATFORM] },
      { key: 'disliked1', genres: [DISLIKED_GENRE], platforms: [OTHER_PLATFORM] },
      { key: 'disliked2', genres: [DISLIKED_GENRE], platforms: [OTHER_PLATFORM] },
      // The deck, on a platform of this run's own.
      { key: 'deckLoved', genres: [LOVED_GENRE], platforms: [DECK_PLATFORM] },
      { key: 'deckDisliked', genres: [DISLIKED_GENRE], platforms: [DECK_PLATFORM] },
      { key: 'deckPlain', genres: [`Plain ${stamp}`], platforms: [DECK_PLATFORM] },
      { key: 'deckTracked', genres: [`Plain ${stamp}`], platforms: [DECK_PLATFORM] },
      // Bob's drain.
      { key: 'drainOld', platforms: [OTHER_PLATFORM] },
      { key: 'drainNew', platforms: [OTHER_PLATFORM] },
    ]);

    await setRatingCounts({
      [id('deckTracked')]: 4,
      [id('deckPlain')]: 3,
      [id('deckDisliked')]: 2,
      [id('deckLoved')]: 1,
    });

    const rank = (key: string, tier: 'loved' | 'disliked', position: number) =>
      insertRankingEntry(alice, { mediaItemId: id(key), medium: 'game', tier, position });
    await rank('loved1', 'loved', 0);
    await rank('loved2', 'loved', 1);
    await rank('disliked1', 'disliked', 0);
    await rank('disliked2', 'disliked', 1);
    // In the backlog: tracked, so off the deck, and not played, so not in the drain.
    await setStatus(alice, id('deckTracked'), 'backlog');
  });

  afterAll(async () => {
    await stopClients();
  });

  describe('the profile', () => {
    it('starts with no platforms and no media, which is a new user', async () => {
      const profile = await getMyProfile(carol);
      expect(profile.platforms).toEqual([]);
      expect(profile.media).toBeNull();
    });

    it('stores the platforms as given, once each, and the media, once each', async () => {
      const withPlatforms = await setProfilePlatforms(carol, ['PlayStation 5', 'PlayStation 4', 'PlayStation 5']);
      expect(withPlatforms.platforms).toEqual(['PlayStation 5', 'PlayStation 4']);

      const withMedia = await setProfileMedia(carol, ['game', 'movie', 'game']);
      expect(withMedia.media).toEqual(['game', 'movie']);
      expect(withMedia.platforms).toEqual(['PlayStation 5', 'PlayStation 4']);
      expect(await getMyProfile(carol)).toEqual(withMedia);
    });

    it('takes an empty platform list as the skipped answer', async () => {
      expect((await setProfilePlatforms(carol, [])).platforms).toEqual([]);
    });

    it('refuses an empty media answer before any round trip', async () => {
      await expect(setProfileMedia(carol, [])).rejects.toBeInstanceOf(RangeError);
      expect((await getMyProfile(carol)).media).toEqual(['game', 'movie']);
    });

    it('does not read a refused platform as a refused username', async () => {
      const username = `carol_${stamp}`;
      const failure = await updateMyProfile(carol, { username, platforms: [''] }).catch((error: unknown) => error);
      expect(failure).not.toBeInstanceOf(UsernameError);
      expect((failure as { code?: string }).code).toBe('23514');
      expect((await getMyProfile(carol)).username).toBeNull();
    });
  });

  describe('events', () => {
    it('logs as the caller, and each user reads only their own', async () => {
      await logEvent(alice, 'first_session');
      await logEvent(alice, 'media_interest', { medium: 'tv' });

      const { data: mine, error } = await alice.from('events').select('kind, payload, user_id').order('kind');
      expect(error).toBeNull();
      expect(mine).toEqual([
        { kind: 'first_session', payload: {}, user_id: aliceId },
        { kind: 'media_interest', payload: { medium: 'tv' }, user_id: aliceId },
      ]);

      const { data: theirs } = await bob.from('events').select('id').eq('user_id', aliceId);
      expect(theirs).toEqual([]);
    });

    it('lets the database refuse a kind that is not a snake_case word', async () => {
      await expect(logEvent(alice, 'Not A Kind' as EventKind)).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('deckCandidates', () => {
    it("returns the platform's untracked games by popularity, ranked from 1, with the boost the profile gives", async () => {
      const rows = await deckCandidates(alice, [DECK_PLATFORM], 10, 0);
      expect(rows.map((row) => row.mediaItemId)).toEqual([id('deckPlain'), id('deckDisliked'), id('deckLoved')]);
      expect(rows.map((row) => row.popularityRank)).toEqual([1, 2, 3]);

      const boost = (key: string) => rows.find((row) => row.mediaItemId === id(key))!.boost;
      expect(boost('deckLoved')).toBeGreaterThan(0);
      expect(boost('deckDisliked')).toBeLessThan(0);
      expect(boost('deckPlain')).toBeCloseTo(0, 6);
    });

    it('hands orderDeck rows it reads as they are', async () => {
      const rows = await deckCandidates(alice, [DECK_PLATFORM], 10, 0);
      // Unpinned, the boost decides: the loved genre rises past the plain game.
      const ordered = orderDeck(rows, { pinned: 0 });
      expect(ordered.indexOf(rows.find((row) => row.mediaItemId === id('deckLoved'))!)).toBeLessThan(
        ordered.indexOf(rows.find((row) => row.mediaItemId === id('deckDisliked'))!),
      );
    });

    it('carries what a deck row draws', async () => {
      const [row] = await deckCandidates(alice, [DECK_PLATFORM], 1, 0);
      expect(row).toMatchObject({
        mediaItemId: id('deckPlain'),
        title: games['deckPlain']!.title,
        year: 2020,
        coverImageId: `cover_${games['deckPlain']!.igdbId}`,
        externalIds: { igdb: games['deckPlain']!.igdbId },
        genres: [`Plain ${stamp}`],
        platforms: [DECK_PLATFORM],
      });
    });

    it('pages by offset, and the ranks continue', async () => {
      const page = await deckCandidates(alice, [DECK_PLATFORM], 2, 2);
      expect(page.map((row) => [row.mediaItemId, row.popularityRank])).toEqual([[id('deckLoved'), 3]]);
    });

    it('answers another user from their own state: no entry, no profile, no boost', async () => {
      const rows = await deckCandidates(bob, [DECK_PLATFORM], 10, 0);
      expect(rows.map((row) => row.mediaItemId)).toEqual([
        id('deckTracked'),
        id('deckPlain'),
        id('deckDisliked'),
        id('deckLoved'),
      ]);
      expect(rows.every((row) => row.boost === 0)).toBe(true);
    });

    it('reads every platform when given none', async () => {
      const rows = await deckCandidates(bob, null, 5, 0);
      expect(rows.length).toBeLessThanOrEqual(5);
      expect(rows.map((row) => row.popularityRank)).toEqual(rows.map((_, index) => index + 1));
    });

    it('refuses a negative offset', async () => {
      await expect(deckCandidates(alice, [DECK_PLATFORM], 10, -1)).rejects.toMatchObject({ code: '22023' });
    });
  });

  describe('batchPredictions', () => {
    it("guesses from the caller's own list, in the order asked, in the shape a batch item takes", async () => {
      const unknown = '00000000-0000-0000-0000-000000000000';
      const rows = await batchPredictions(alice, 'game', [id('deckDisliked'), unknown, id('deckLoved')]);
      expect(rows.map((row) => row.mediaItemId)).toEqual([id('deckDisliked'), id('deckLoved')]);
      expect(rows.every((row) => row.confidence === 'needs_more_data')).toBe(true);
      const [disliked, loved] = rows;
      expect(loved!.predictedScore).toBeGreaterThan(disliked!.predictedScore);
    });

    it('gives a user with nothing ranked the prior alone', async () => {
      const rows = await batchPredictions(bob, 'game', [id('deckDisliked'), id('deckLoved')]);
      // No external score and no prior row: the default prior, 6.5, for both.
      expect(rows.map((row) => row.predictedScore)).toEqual([6.5, 6.5]);
    });

    it('answers an empty batch without asking', async () => {
      expect(await batchPredictions(alice, 'game', [])).toEqual([]);
    });
  });

  describe('the drain and the provisional mark', () => {
    it('lists played and unranked games newest first, and a ranked game leaves it', async () => {
      await markFinished(bob, id('drainOld'), { finishedAt: '2026-10-01' });
      await markFinished(bob, id('drainNew'), { finishedAt: '2026-10-03' });

      const before = await playedNotRanked(bob, 'game');
      expect(before.map((row) => [row.mediaItemId, row.finishedAt])).toEqual([
        [id('drainNew'), '2026-10-03'],
        [id('drainOld'), '2026-10-01'],
      ]);
      expect(before[0]).toMatchObject({ title: games['drainNew']!.title, platforms: [OTHER_PLATFORM] });
      expect(await playedNotRanked(alice, 'game')).toEqual([]);

      await finishInsertion(bob, {
        mediaItemId: id('drainNew'),
        medium: 'game',
        tier: 'fine',
        position: 0,
        comparisons: [],
        placedBy: 'prior',
      });
      expect((await playedNotRanked(bob, 'game')).map((row) => row.mediaItemId)).toEqual([id('drainOld')]);
    });

    it('carries the mark through tierList, and a move clears it', async () => {
      await finishInsertion(bob, {
        mediaItemId: id('drainOld'),
        medium: 'game',
        tier: 'fine',
        position: 1,
        comparisons: [],
      });
      expect((await tierList(bob, 'game', 'fine')).map((row) => [row.media_item_id, row.placed_by])).toEqual([
        [id('drainNew'), 'prior'],
        [id('drainOld'), 'user'],
      ]);

      await moveRankingEntry(bob, { mediaItemId: id('drainNew'), tier: 'fine', position: 1 });
      expect((await tierList(bob, 'game', 'fine')).map((row) => [row.media_item_id, row.placed_by])).toEqual([
        [id('drainOld'), 'user'],
        [id('drainNew'), 'user'],
      ]);
    });

    it('takes the mark on insertRankingEntry too', async () => {
      await insertRankingEntry(carol, {
        mediaItemId: id('deckPlain'),
        medium: 'game',
        tier: 'liked',
        position: 0,
        placedBy: 'prior',
      });
      expect((await tierList(carol, 'game', 'liked')).map((row) => row.placed_by)).toEqual(['prior']);
    });
  });
});
