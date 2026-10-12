/**
 * `profile.ts` against a real local stack, with two users.
 *
 * Two users rather than one, because every query in `profile.ts` is unfiltered:
 * there is no user id in any of them, and a count that forgot Row Level
 * Security would still pass with one account in the database. So Bob ranks the
 * same game Alice ranks, and the tier size each of them sees is the proof.
 *
 * The other thing worth testing here is that the counts agree with the lists:
 * Profile's stats row links to the Next tab, and a badge saying 3 above a list
 * of 4 is the kind of quiet wrongness nobody reports and everybody notices.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { coverCandidates } from '../src/covers';
import { setStatus } from '../src/entries';
import { profileStats, recentRankings } from '../src/profile';
import { insertRankingEntry, moveRankingEntry } from '../src/ranking';
import { backlog, upcoming } from '../src/views';
import { anonClient, live, localDate, seedGames, signUpUser, stopClients, type SeededGame } from './support';

const STEAM_APP_ID = 1145360;

describe.skipIf(!live)('the Profile reads against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    const a = await signUpUser('profile-a');
    const b = await signUpUser('profile-b');
    alice = a.client;
    bob = b.client;

    games = await seedGames([
      { key: 'loved1', steamAppId: STEAM_APP_ID },
      { key: 'loved2' },
      { key: 'liked1' },
      { key: 'shelved' },
      { key: 'backlogOld', releaseDate: '2015-01-01' },
      { key: 'backlogRecent', releaseDate: localDate(-1) },
      { key: 'backlogUndated', releaseDate: null, year: null },
      { key: 'soon', releaseDate: localDate(7) },
      { key: 'later', releaseDate: localDate(200) },
      { key: 'playing1' },
      { key: 'played1' },
      { key: 'dropped1' },
      { key: 'bobOnly' },
      // One film per number on the stats row, plus one Alice has ranked, so
      // every count and the activity list each have something to leave out.
      { key: 'filmBacklog', releaseDate: localDate(-2), medium: 'movie' },
      { key: 'filmUpcoming', releaseDate: localDate(30), medium: 'movie' },
      { key: 'filmPlaying', medium: 'movie' },
      { key: 'filmPlayed', medium: 'movie' },
      { key: 'filmDropped', medium: 'movie' },
      { key: 'filmRanked', medium: 'movie' },
    ]);

    for (const key of ['backlogOld', 'backlogRecent', 'backlogUndated', 'soon', 'later']) {
      await setStatus(alice, games[key]!.mediaItemId, 'backlog');
    }
    await setStatus(alice, games['playing1']!.mediaItemId, 'playing');
    await setStatus(alice, games['played1']!.mediaItemId, 'played');
    await setStatus(alice, games['dropped1']!.mediaItemId, 'dropped');

    // Ranked one at a time, so each insert gets its own transaction clock and
    // the order below is the order they happened in. `loved2` goes in at the
    // end of its tier, so it shifts nothing and `loved1` keeps its timestamp.
    await insertRankingEntry(alice, {
      mediaItemId: games['loved1']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 0,
    });
    await insertRankingEntry(alice, {
      mediaItemId: games['loved2']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 1,
    });
    await insertRankingEntry(alice, {
      mediaItemId: games['liked1']!.mediaItemId,
      medium: 'game',
      tier: 'liked',
      position: 0,
    });

    // The same six facts about films that the six counts hold about games, and
    // one film ranked in `loved`, where Alice already has two games. Her loved
    // tier is two games long and one film long; the score each gets is the
    // proof that a tier is counted per medium and not across them.
    for (const key of ['filmBacklog', 'filmUpcoming']) {
      await setStatus(alice, games[key]!.mediaItemId, 'backlog');
    }
    await setStatus(alice, games['filmPlaying']!.mediaItemId, 'playing');
    await setStatus(alice, games['filmPlayed']!.mediaItemId, 'played');
    await setStatus(alice, games['filmDropped']!.mediaItemId, 'dropped');
    await insertRankingEntry(alice, {
      mediaItemId: games['filmRanked']!.mediaItemId,
      medium: 'movie',
      tier: 'loved',
      position: 0,
    });

    // Bob ranks a game Alice has also ranked, and nothing else. Same row of the
    // catalog, same tier, his own ranking.
    await setStatus(bob, games['bobOnly']!.mediaItemId, 'backlog');
    await insertRankingEntry(bob, {
      mediaItemId: games['loved1']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 0,
    });
  });

  afterAll(async () => {
    await stopClients();
  });

  it('counts the ranked list and every status', async () => {
    expect(await profileStats(alice)).toEqual({
      ranked: 3,
      backlog: 3,
      upcoming: 2,
      playing: 1,
      played: 1,
      dropped: 1,
    });
  });

  it('counts only the caller rows', async () => {
    expect(await profileStats(bob)).toEqual({
      ranked: 1,
      backlog: 1,
      upcoming: 0,
      playing: 0,
      played: 0,
      dropped: 0,
    });
  });

  it('gives a signed-out client zeroes rather than an error', async () => {
    expect(await profileStats(anonClient())).toEqual({
      ranked: 0,
      backlog: 0,
      upcoming: 0,
      playing: 0,
      played: 0,
      dropped: 0,
    });
  });

  it('agrees with the lists the stats row links to', async () => {
    const stats = await profileStats(alice);

    expect(stats.backlog).toBe((await backlog(alice)).length);
    expect(stats.upcoming).toBe((await upcoming(alice)).length);
  });

  it('splits backlog from upcoming on the same date the lists do', async () => {
    // Far enough ahead that both unreleased games have come out. Nothing is
    // written; Upcoming is derived, so the split just moves.
    const future = { today: localDate(400) };

    const stats = await profileStats(alice, future);
    expect(stats.backlog).toBe(5);
    expect(stats.upcoming).toBe(0);
    expect(stats.backlog).toBe((await backlog(alice, future)).length);
  });

  it('lists the most recently ranked games, newest first', async () => {
    const rows = await recentRankings(alice);

    expect(rows.map((row) => row.mediaItemId)).toEqual([
      games['liked1']!.mediaItemId,
      games['loved2']!.mediaItemId,
      games['loved1']!.mediaItemId,
    ]);
    expect(rows[0]!.title).toBe(games['liked1']!.title);
    expect(rows[0]!.year).toBe(2020);
    expect(Date.parse(rows[0]!.placedAt)).not.toBeNaN();
    expect(Date.parse(rows[0]!.updatedAt)).not.toBeNaN();
  });

  it('scores each row from the size of its tier', async () => {
    const byId = new Map((await recentRankings(alice)).map((row) => [row.mediaItemId, row]));

    // Two in loved: the top of the band and the bottom of it.
    expect(byId.get(games['loved1']!.mediaItemId)!.placement).toEqual({
      tier: 'loved',
      position: 0,
      tierSize: 2,
      score: 10,
    });
    expect(byId.get(games['loved2']!.mediaItemId)!.placement).toEqual({
      tier: 'loved',
      position: 1,
      tierSize: 2,
      score: 8.5,
    });
    // Alone in liked, so it sits at the middle of that band.
    expect(byId.get(games['liked1']!.mediaItemId)!.placement).toEqual({
      tier: 'liked',
      position: 0,
      tierSize: 1,
      score: 7.5,
    });
  });

  it('carries the ids a cover is built from', async () => {
    const row = (await recentRankings(alice)).find(
      (candidate) => candidate.mediaItemId === games['loved1']!.mediaItemId,
    )!;

    expect(coverCandidates(row)).toEqual([
      `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cover_${games['loved1']!.igdbId}.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${STEAM_APP_ID}/library_600x900_2x.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${STEAM_APP_ID}/library_600x900.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${STEAM_APP_ID}/header.jpg`,
    ]);
  });

  it('shows each user their own activity, and sizes the tier from their own list', async () => {
    const rows = await recentRankings(bob);

    expect(rows.map((row) => row.mediaItemId)).toEqual([games['loved1']!.mediaItemId]);
    // Alice has two in loved; Bob has one, so the same game scores differently
    // for each of them. This is the number RLS has to get right.
    expect(rows[0]!.placement).toEqual({ tier: 'loved', position: 0, tierSize: 1, score: 9.3 });
  });

  it('gives a signed-out client an empty list rather than an error', async () => {
    expect(await recentRankings(anonClient())).toEqual([]);
  });

  it('honours the limit', async () => {
    expect((await recentRankings(alice, 2)).map((row) => row.mediaItemId)).toEqual([
      games['liked1']!.mediaItemId,
      games['loved2']!.mediaItemId,
    ]);
    expect(await recentRankings(alice, 1)).toHaveLength(1);
  });

  it('refuses a limit that is not a whole number of rows', async () => {
    for (const bad of [0, -1, 2.5]) {
      await expect(recentRankings(alice, bad)).rejects.toThrow(RangeError);
    }
  });

  it('ignores a game that is ranked but not tracked, and vice versa', async () => {
    // Ranking and status are separate facts: `shelved` is in no list and no
    // ranking, and the three ranked games have no `user_entries` row at all.
    const stats = await profileStats(alice);
    const ranked = (await recentRankings(alice)).map((row) => row.mediaItemId);

    expect(ranked).not.toContain(games['shelved']!.mediaItemId);
    expect(ranked).not.toContain(games['playing1']!.mediaItemId);
    expect(stats.ranked).toBe(ranked.length);
  });

  it('is a list of placements, so a move does not put a game back on top', async () => {
    // The order of events: loved1 placed, then loved2, then liked1, and now
    // loved1 is dragged below loved2. The drag rewrites `updated_at` on both
    // loved rows with the same transaction clock, which is exactly what used to
    // push liked1 -- the game the user really ranked last -- off the top of
    // this list. `placed_at` says nothing was placed, so the order holds.
    const placedBefore = new Map(
      (await recentRankings(alice)).map((row) => [row.mediaItemId, row.placedAt]),
    );

    await moveRankingEntry(alice, {
      mediaItemId: games['loved1']!.mediaItemId,
      tier: 'loved',
      position: 1,
    });

    const rows = await recentRankings(alice);
    expect(rows.map((row) => row.mediaItemId)).toEqual([
      games['liked1']!.mediaItemId,
      games['loved2']!.mediaItemId,
      games['loved1']!.mediaItemId,
    ]);

    // The move did happen: loved1 is now below loved2 in the tier.
    const byId = new Map(rows.map((row) => [row.mediaItemId, row]));
    expect(byId.get(games['loved1']!.mediaItemId)!.placement.position).toBe(1);
    expect(byId.get(games['loved2']!.mediaItemId)!.placement.position).toBe(0);

    // And it re-dated nothing: not the row it moved, not the row it shifted.
    for (const row of rows) expect(row.placedAt).toBe(placedBefore.get(row.mediaItemId));
  });

  it('counts one medium at a time, films included only when they are asked for', async () => {
    // The six counts above are unchanged by six films, because the default is
    // games; asked for films, every one of them is the film.
    expect(await profileStats(alice, { medium: 'movie' })).toEqual({
      ranked: 1,
      backlog: 1,
      upcoming: 1,
      playing: 1,
      played: 1,
      dropped: 1,
    });
  });

  it('lists activity for one medium, and sizes the tier from that medium alone', async () => {
    const rows = await recentRankings(alice, 10, { medium: 'movie' });

    expect(rows.map((row) => row.mediaItemId)).toEqual([games['filmRanked']!.mediaItemId]);
    expect(rows[0]!.medium).toBe('movie');
    // Alone in loved among films, so the middle of that band -- not 10, which
    // is what the top of Alice's two-game loved tier scores.
    expect(rows[0]!.placement).toEqual({ tier: 'loved', position: 0, tierSize: 1, score: 9.3 });

    const byDefault = (await recentRankings(alice)).map((row) => row.mediaItemId);
    expect(byDefault).not.toContain(games['filmRanked']!.mediaItemId);
  });

  it('dates each row by when it was placed, newest first', async () => {
    const rows = await recentRankings(alice);
    const placed = rows.map((row) => Date.parse(row.placedAt));

    expect(placed).toEqual([...placed].sort((a, b) => b - a));
    // Every one of them was placed before the drag above, which is the last
    // thing this suite did to Alice's ranking.
    for (const row of rows) expect(Date.parse(row.placedAt)).toBeLessThanOrEqual(Date.parse(row.updatedAt));
  });
});
