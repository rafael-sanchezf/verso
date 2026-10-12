/**
 * `views.ts` against a real local stack: Home's three blocks, the Next tab's
 * two segments, and the game page.
 *
 * The centre of this suite is the Upcoming split, which is derived rather than
 * stored: a backlog game is upcoming only while its release date is in the
 * future, and it joins the ordinary backlog on its release day with nobody
 * writing anything. So the dates are seeded relative to today and the boundary
 * is tested on both sides of it and exactly on it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { moveBacklogEntry } from '../src/backlog';
import { coverCandidates } from '../src/covers';
import type { Client } from '../src/client';
import { removeEntry, setPlayedPlatforms, setStartedAt, setStatus } from '../src/entries';
import { insertRankingEntry } from '../src/ranking';
import {
  backlog,
  comingUp,
  gamePage,
  playing,
  trackedMediaItemIds,
  upcoming,
  upNext,
} from '../src/views';
import { live, localDate, seedGames, signUpUser, stopClients, type SeededGame } from './support';

describe.skipIf(!live)('screen read models against a local stack', () => {
  let client: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    const user = await signUpUser('views');
    client = user.client;
    games = await seedGames([
      { key: 'playingOld', releaseDate: '2018-05-01', year: 2018 },
      { key: 'playingNew', releaseDate: '2019-05-01', year: 2019 },
      { key: 'oldest', releaseDate: '2015-01-01', year: 2015 },
      { key: 'undated', releaseDate: null, year: null },
      { key: 'yesterday', releaseDate: localDate(-1) },
      { key: 'today', releaseDate: localDate(0) },
      { key: 'tomorrow', releaseDate: localDate(1) },
      { key: 'nextMonth', releaseDate: localDate(30) },
      { key: 'nextYear', releaseDate: localDate(365) },
      {
        key: 'page',
        title: 'The Game Page',
        steamAppId: 1145360,
        year: 2024,
        releaseDate: '2024-11-08',
        platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch'],
        genres: ['Role-playing (RPG)', 'Adventure'],
        developer: 'Page Studio',
        summary: 'The one the game page renders.',
        timeToBeat: { hastily: 90_000, normally: 126_000, completely: 216_000 },
        scores: [
          { source: 'metacritic', score: 88 },
          { source: 'steam', score: 92, scoreCount: 12_000 },
          { source: 'igdb_critics', score: 85, scoreCount: 40 },
          { source: 'igdb_users', score: 87, scoreCount: 900 },
        ],
      },
      { key: 'ranked2' },
      // Three films, so every list here has one it must not show: one being
      // watched, one released and waiting, one still to come out. Seeded with
      // dates that would put them at the top of the list they belong to, so a
      // missing filter shows up as a wrong first row rather than a long tail.
      { key: 'filmPlaying', medium: 'movie', title: 'A Film In Progress' },
      { key: 'filmBacklog', medium: 'movie', title: 'A Film To Watch', releaseDate: localDate(-2) },
      { key: 'filmComing', medium: 'movie', title: 'A Film Coming Out', releaseDate: localDate(10) },
    ]);

    // Added in this order, so the positions the trigger appends are known.
    for (const key of ['oldest', 'undated', 'yesterday', 'today', 'tomorrow', 'nextMonth', 'nextYear']) {
      await setStatus(client, games[key]!.mediaItemId, 'backlog');
    }

    await setStatus(client, games['playingOld']!.mediaItemId, 'playing');
    await setStatus(client, games['playingNew']!.mediaItemId, 'playing');
    // Explicit dates, so the order does not depend on two triggers firing in
    // the same millisecond.
    await setStartedAt(client, games['playingOld']!.mediaItemId, '2026-01-02T09:00:00.000Z');
    await setStartedAt(client, games['playingNew']!.mediaItemId, '2026-06-02T09:00:00.000Z');

    // The films go in last, so they hold the backlog positions after the games
    // and the order the tests above assert is the order they were added in.
    // The film being watched was started after either game, and the one coming
    // out lands between `tomorrow` and `nextMonth`: unfiltered, each would be
    // the first row of a list it does not belong in.
    await setStatus(client, games['filmBacklog']!.mediaItemId, 'backlog');
    await setStatus(client, games['filmComing']!.mediaItemId, 'backlog');
    await setStatus(client, games['filmPlaying']!.mediaItemId, 'playing');
    await setStartedAt(client, games['filmPlaying']!.mediaItemId, '2026-08-02T09:00:00.000Z');
  });

  afterAll(async () => {
    await stopClients();
  });

  it('lists what you are playing, most recently started first', async () => {
    const rows = await playing(client);

    expect(rows.map((row) => row.mediaItemId)).toEqual([
      games['playingNew']!.mediaItemId,
      games['playingOld']!.mediaItemId,
    ]);
    expect(rows[0]!.entry.status).toBe('playing');
    expect(rows[0]!.title).toBe(games['playingNew']!.title);
  });

  it('puts every released and undated backlog game in the backlog, in the user own order', async () => {
    const rows = await backlog(client);

    // The trigger appends, so before any drag the order is the order they were
    // added; the upcoming ones hold positions of their own and are filtered out.
    expect(rows.map((row) => row.mediaItemId)).toEqual([
      games['oldest']!.mediaItemId,
      games['undated']!.mediaItemId,
      games['yesterday']!.mediaItemId,
      games['today']!.mediaItemId,
    ]);
  });

  it('follows a drag, and leaves Upcoming ordered by date regardless', async () => {
    const rows = await backlog(client);
    const last = rows[rows.length - 1]!;

    await moveBacklogEntry(client, { entryId: last.entry.id, position: 0 });

    expect((await backlog(client))[0]!.mediaItemId).toBe(last.mediaItemId);
    expect((await upNext(client, 1))[0]!.mediaItemId).toBe(last.mediaItemId);

    // Upcoming is not user-ordered: it is the release calendar.
    expect((await upcoming(client)).map((row) => row.mediaItemId)).toEqual([
      games['tomorrow']!.mediaItemId,
      games['nextMonth']!.mediaItemId,
      games['nextYear']!.mediaItemId,
    ]);
  });

  it('counts a game released today as released, not as upcoming', async () => {
    const backlogIds = (await backlog(client)).map((row) => row.mediaItemId);
    const upcomingIds = (await upcoming(client)).map((row) => row.mediaItemId);

    expect(backlogIds).toContain(games['today']!.mediaItemId);
    expect(upcomingIds).not.toContain(games['today']!.mediaItemId);
  });

  it('orders upcoming games by release date, soonest first', async () => {
    const rows = await upcoming(client);

    expect(rows.map((row) => row.mediaItemId)).toEqual([
      games['tomorrow']!.mediaItemId,
      games['nextMonth']!.mediaItemId,
      games['nextYear']!.mediaItemId,
    ]);
    expect(rows[0]!.releaseDate).toBe(localDate(1));
  });

  it('moves a game out of Upcoming on its release day with no write', async () => {
    // Same rows, read as if it were a month from now: what was upcoming is not.
    const asOf = localDate(31);
    const backlogIds = (await backlog(client, { today: asOf })).map((row) => row.mediaItemId);
    const upcomingIds = (await upcoming(client, { today: asOf })).map((row) => row.mediaItemId);

    expect(backlogIds).toContain(games['nextMonth']!.mediaItemId);
    expect(upcomingIds).toEqual([games['nextYear']!.mediaItemId]);
  });

  it('gives Home three of each block by default', async () => {
    const next = await upNext(client);
    const coming = await comingUp(client);

    expect(next).toHaveLength(3);
    expect(next.map((row) => row.mediaItemId)).toEqual(
      (await backlog(client)).slice(0, 3).map((row) => row.mediaItemId),
    );
    expect(coming.map((row) => row.mediaItemId)).toEqual([
      games['tomorrow']!.mediaItemId,
      games['nextMonth']!.mediaItemId,
      games['nextYear']!.mediaItemId,
    ]);
    expect((await comingUp(client, 2)).map((row) => row.mediaItemId)).toEqual([
      games['tomorrow']!.mediaItemId,
      games['nextMonth']!.mediaItemId,
    ]);
  });

  it('carries the catalog facts a row needs without the screen unpicking anything', async () => {
    const row = (await backlog(client)).find((r) => r.mediaItemId === games['undated']!.mediaItemId)!;

    expect(row.title).toBe(games['undated']!.title);
    expect(row.year).toBeNull();
    expect(row.releaseDate).toBeNull();
    expect(row.coverImageId).toBe(`cover_${games['undated']!.igdbId}`);
    // The ids a cover is built from, for a game the catalog has no Steam id for.
    expect(row.externalIds).toEqual({ igdb: games['undated']!.igdbId });
    expect(coverCandidates(row)).toEqual([
      `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cover_${games['undated']!.igdbId}.jpg`,
    ]);
    expect(row.genres).toEqual(['Role-playing (RPG)']);
    expect(row.platforms).toEqual(['PC (Microsoft Windows)', 'Nintendo Switch']);
    expect(row.timeToBeat).toEqual({
      hastilySeconds: null,
      normallySeconds: null,
      completelySeconds: null,
    });
  });

  it('builds the game page: catalog, scores by source, the entry, and no score until it is ranked', async () => {
    const id = games['page']!.mediaItemId;
    await setStatus(client, id, 'playing');
    await setPlayedPlatforms(client, id, ['PlayStation 5']);

    const page = (await gamePage(client, id))!;

    expect(page.mediaItemId).toBe(id);
    expect(page.medium).toBe('game');
    expect(page.title).toBe('The Game Page');
    expect(page.year).toBe(2024);
    expect(page.releaseDate).toBe('2024-11-08');
    expect(page.coverImageId).toBe(`cover_${games['page']!.igdbId}`);
    expect(page.externalIds).toEqual({ igdb: games['page']!.igdbId, steam: 1145360 });
    // Steam behind IGDB, so the image can fall through if the cover is gone.
    expect(coverCandidates(page)).toHaveLength(4);
    expect(coverCandidates(page)[1]).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/library_600x900_2x.jpg',
    );

    expect(page.game).not.toBeNull();
    expect(page.game!.igdbId).toBe(games['page']!.igdbId);
    expect(page.game!.developer).toBe('Page Studio');
    expect(page.game!.genres).toEqual(['Role-playing (RPG)', 'Adventure']);
    expect(page.game!.timeToBeat).toEqual({
      hastilySeconds: 90_000,
      normallySeconds: 126_000,
      completelySeconds: 216_000,
    });

    // Every platform the game is on, with the one you played it on marked, and
    // no other flag: ownership left the product (decision 26).
    expect(page.game!.platforms).toEqual([
      { name: 'PC (Microsoft Windows)', played: false },
      { name: 'PlayStation 5', played: true },
      { name: 'Nintendo Switch', played: false },
    ]);

    expect(Object.keys(page.scores).sort()).toEqual(['igdb_critics', 'igdb_users', 'metacritic', 'steam']);
    expect(page.scores.metacritic!.score).toBeCloseTo(88);
    expect(page.scores.metacritic!.scoreCount).toBeNull();
    expect(page.scores.steam!.score).toBeCloseTo(92);
    expect(page.scores.steam!.scoreCount).toBe(12_000);
    expect(Date.parse(page.scores.steam!.fetchedAt)).not.toBeNaN();

    expect(page.entry).not.toBeNull();
    expect(page.entry!.status).toBe('playing');
    expect(page.entry!.playedPlatforms).toEqual(['PlayStation 5']);

    expect(page.ranking).toBeNull();
  });

  it('shows the derived score once the game is ranked', async () => {
    const id = games['page']!.mediaItemId;
    await insertRankingEntry(client, { mediaItemId: id, medium: 'game', tier: 'loved', position: 0 });
    await insertRankingEntry(client, {
      mediaItemId: games['ranked2']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 1,
    });

    const page = (await gamePage(client, id))!;

    expect(page.ranking).toEqual({ tier: 'loved', position: 0, tierSize: 2, score: 10 });
    expect((await gamePage(client, games['ranked2']!.mediaItemId))!.ranking).toEqual({
      tier: 'loved',
      position: 1,
      tierSize: 2,
      score: 8.5,
    });
  });

  it('returns nothing for a media item that does not exist', async () => {
    expect(await gamePage(client, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('has no entry on the page for a game you do not track', async () => {
    const page = (await gamePage(client, games['ranked2']!.mediaItemId))!;
    expect(page.entry).toBeNull();
    expect(page.game!.platforms.every((platform) => !platform.played)).toBe(true);
  });

  it('keeps another medium out of every list, and returns it when it is asked for', async () => {
    const films = new Set([
      games['filmPlaying']!.mediaItemId,
      games['filmBacklog']!.mediaItemId,
      games['filmComing']!.mediaItemId,
    ]);

    // The default is games, so nothing a caller already writes changes.
    const lists = [
      await playing(client),
      await backlog(client),
      await upcoming(client),
      await upNext(client, 50),
      await comingUp(client, 50),
    ];
    for (const rows of lists) {
      expect(rows.filter((row) => films.has(row.mediaItemId))).toEqual([]);
    }

    // And asked for films, each list is the film and only the film.
    const asFilm = { medium: 'movie' } as const;
    expect((await playing(client, asFilm)).map((row) => row.mediaItemId)).toEqual([
      games['filmPlaying']!.mediaItemId,
    ]);
    expect((await backlog(client, asFilm)).map((row) => row.mediaItemId)).toEqual([
      games['filmBacklog']!.mediaItemId,
    ]);
    expect((await upcoming(client, asFilm)).map((row) => row.mediaItemId)).toEqual([
      games['filmComing']!.mediaItemId,
    ]);
    expect((await upNext(client, 3, asFilm)).map((row) => row.mediaItemId)).toEqual([
      games['filmBacklog']!.mediaItemId,
    ]);
    expect((await comingUp(client, 3, asFilm)).map((row) => row.mediaItemId)).toEqual([
      games['filmComing']!.mediaItemId,
    ]);
  });

  it('says which medium the page is, since an id is already one medium', async () => {
    // No filter to pass: the id names the row. The page carries the medium it
    // found, which is what a caller checks rather than guessing from the tab.
    const page = (await gamePage(client, games['filmBacklog']!.mediaItemId))!;

    expect(page.medium).toBe('movie');
    expect(page.title).toBe('A Film To Watch');
    // No game_details behind a film, and the game page says so rather than
    // inventing an empty one.
    expect(page.game).toBeNull();
  });
});

/**
 * `trackedMediaItemIds`, the read Search uses to decide between a plus and a
 * check on a result row.
 *
 * The case worth the suite is the one the three-list version could not answer:
 * a game that is finished, or dropped, is in the library and in none of
 * Playing, Backlog or Upcoming. And the case worth it twice is the second
 * account, because the whole read leans on RLS rather than on a user id in the
 * query — if that policy were ever loosened this is the test that fails.
 */
describe.skipIf(!live)('trackedMediaItemIds against a local stack', () => {
  let client: Client;
  let other: Client;
  let games: Record<string, SeededGame>;

  const id = (key: string) => games[key]!.mediaItemId;

  beforeAll(async () => {
    client = (await signUpUser('tracked')).client;
    other = (await signUpUser('tracked-other')).client;

    games = await seedGames([
      { key: 'inBacklog' },
      { key: 'playing' },
      { key: 'upcoming', releaseDate: localDate(90) },
      { key: 'played' },
      { key: 'dropped' },
      { key: 'untracked' },
      { key: 'theirs' },
    ]);

    await setStatus(client, id('inBacklog'), 'backlog');
    await setStatus(client, id('playing'), 'playing');
    await setStatus(client, id('upcoming'), 'backlog');
    await setStatus(client, id('played'), 'played');
    await setStatus(client, id('dropped'), 'dropped');

    await setStatus(other, id('theirs'), 'backlog');
  });

  afterAll(async () => {
    await stopClients();
  });

  it('answers for every status, not only the three lists a screen draws', async () => {
    const tracked = await trackedMediaItemIds(client, [
      id('inBacklog'),
      id('playing'),
      id('upcoming'),
      id('played'),
      id('dropped'),
      id('untracked'),
    ]);

    // `played` and `dropped` are the two the old three-query version missed.
    expect(new Set(tracked)).toEqual(
      new Set([id('inBacklog'), id('playing'), id('upcoming'), id('played'), id('dropped')]),
    );
    expect(tracked).not.toContain(id('untracked'));
  });

  it('sees nothing of another account, because the query names no user', async () => {
    expect(await trackedMediaItemIds(client, [id('theirs')])).toEqual([]);
    expect(await trackedMediaItemIds(other, [id('theirs')])).toEqual([id('theirs')]);
    expect(await trackedMediaItemIds(other, [id('inBacklog')])).toEqual([]);
  });

  it('asks nothing of the network for an empty list', async () => {
    expect(await trackedMediaItemIds(client, [])).toEqual([]);
  });

  it('collapses duplicates rather than returning a row twice', async () => {
    expect(await trackedMediaItemIds(client, [id('playing'), id('playing')])).toEqual([id('playing')]);
  });

  it('follows a removal', async () => {
    expect(await trackedMediaItemIds(client, [id('dropped')])).toEqual([id('dropped')]);

    await removeEntry(client, id('dropped'));

    expect(await trackedMediaItemIds(client, [id('dropped')])).toEqual([]);
  });
});
