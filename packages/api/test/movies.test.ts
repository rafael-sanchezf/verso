/**
 * The movies reads against a real local stack: `movieWatchlist` with its
 * filters, `movieCalendar`, `movieReleaseState` and `unrankedCount`. See
 * test/support.ts for what the suite needs in the environment and why it skips
 * without it.
 *
 * The pgTAP suite (supabase/tests/movie_reads.test.sql) proves the placement
 * rule case by case; this proves the wrappers: that each call reaches its
 * function through supabase-js with the device's date, reads the region and
 * the services from the caller's profile, and comes back in camelCase; and
 * that the unranked count is a HEAD request PostgREST answers.
 *
 * The catalog facts (release dates, offers, the provider directory) are
 * written as the service role, the way the TMDB mirror writes them, with
 * provider ids above nine hundred and eighty thousand so a run never meets a
 * mirrored directory or another run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { logWatch } from '../src/diary';
import { setPlannedOn, setStatus } from '../src/entries';
import { movieCalendar, movieReleaseState, movieWatchlist, unrankedCount } from '../src/movies';
import { setWatchSettings } from '../src/profiles';
import { insertRankingEntry } from '../src/ranking';
import { live, localDate, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const stamp = Math.random().toString(36).slice(2, 8);
const DRAMA = `Movies Drama ${stamp}`;
const THRILLER = `Movies Thriller ${stamp}`;
const providerA = 980_000 + Math.floor(Math.random() * 9_000);
const providerB = providerA + 1;

describe.skipIf(!live)('the movies reads against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let films: Record<string, SeededGame>;
  const id = (key: string) => films[key]!.mediaItemId;

  beforeAll(async () => {
    alice = (await signUpUser('movies-a')).client;
    bob = (await signUpUser('movies-b')).client;

    films = await seedGames([
      { key: 'stream', medium: 'movie', title: 'Movies Stream', genres: [DRAMA], releaseDate: '2021-01-01' },
      { key: 'rent', medium: 'movie', title: 'Movies Rent', genres: [THRILLER], releaseDate: '2022-01-01' },
      { key: 'opening', medium: 'movie', title: 'Movies Opening', genres: [DRAMA], releaseDate: localDate(14) },
      { key: 'theaters', medium: 'movie', title: 'Movies Theaters', genres: [DRAMA], releaseDate: localDate(-10) },
      { key: 'soon', medium: 'movie', title: 'Movies Soon', genres: [DRAMA], releaseDate: localDate(30) },
      { key: 'planned', medium: 'movie', title: 'Movies Planned', genres: [DRAMA], releaseDate: localDate(14) },
    ]);

    const service = serviceClient();
    const writes = await Promise.all([
      service.from('movie_details').update({ runtime_minutes: 100 }).eq('media_item_id', id('stream')),
      service.from('movie_details').update({ runtime_minutes: 150 }).eq('media_item_id', id('rent')),
      service.from('watch_providers').upsert([
        { provider_id: providerA, name: `Movies A ${stamp}`, display_priorities: { US: 1 } },
        { provider_id: providerB, name: `Movies B ${stamp}`, display_priorities: { US: 2 } },
      ]),
      service.from('media_release_dates').insert([
        { media_item_id: id('opening'), region: 'US', release_type: 3, released_on: localDate(14) },
        { media_item_id: id('theaters'), region: 'US', release_type: 3, released_on: localDate(-10) },
        { media_item_id: id('soon'), region: 'US', release_type: 4, released_on: localDate(30) },
        { media_item_id: id('planned'), region: 'US', release_type: 3, released_on: localDate(14) },
      ]),
    ]);
    for (const { error } of writes) if (error) throw error;

    const { error: offersError } = await service.from('watch_availability').insert([
      { media_item_id: id('stream'), region: 'US', provider_id: providerA, offer_type: 'flatrate' },
      { media_item_id: id('rent'), region: 'US', provider_id: providerB, offer_type: 'rent' },
    ]);
    if (offersError) throw offersError;

    for (const key of ['stream', 'rent', 'opening', 'theaters', 'soon']) await setStatus(alice, id(key), 'backlog');
    await setPlannedOn(alice, id('planned'), localDate(16));
    await setWatchSettings(alice, { providerIds: [providerA] });
  });

  afterAll(async () => {
    await stopClients();
  });

  it('lists the Watchlist newest added first, with where each film streams', async () => {
    const rows = await movieWatchlist(alice);
    expect(rows.map((row) => row.title)).toEqual(['Movies Rent', 'Movies Stream']);
    expect(rows[1]).toMatchObject({
      mediaItemId: id('stream'),
      runtimeMinutes: 100,
      genres: [DRAMA],
      streamsOn: [providerA],
      onMyServices: [providerA],
      rentOrBuy: [],
      tmdbScore: null,
    });
    expect(rows[0]).toMatchObject({ streamsOn: [], onMyServices: [], rentOrBuy: [providerB] });
  });

  it("applies the finder's filters", async () => {
    expect((await movieWatchlist(alice, { onMyServices: true })).map((row) => row.title)).toEqual(['Movies Stream']);
    expect((await movieWatchlist(alice, { maxMinutes: 120 })).map((row) => row.title)).toEqual(['Movies Stream']);
    expect((await movieWatchlist(alice, { genres: [THRILLER] })).map((row) => row.title)).toEqual(['Movies Rent']);
    expect(await movieWatchlist(alice, { genres: [THRILLER], onMyServices: true })).toEqual([]);
    await expect(movieWatchlist(alice, { maxMinutes: 0 })).rejects.toBeInstanceOf(RangeError);
  });

  it('lists the Calendar with in theaters first, then by day', async () => {
    const rows = await movieCalendar(alice);
    expect(rows.map((row) => [row.title, row.kind, row.onDate])).toEqual([
      ['Movies Theaters', 'in_theaters', localDate(-10)],
      ['Movies Opening', 'opening', localDate(14)],
      ['Movies Planned', 'going', localDate(16)],
      ['Movies Soon', 'streaming_soon', localDate(30)],
    ]);
    expect(rows[2]).toMatchObject({ plannedOn: localDate(16), theatricalOn: localDate(14), status: 'backlog' });
  });

  it('says where one film sits, and nothing for a film id that is not one', async () => {
    expect(await movieReleaseState(alice, id('opening'), 'us')).toEqual({
      placement: 'opening',
      placementOn: localDate(14),
      theatricalOn: localDate(14),
      digitalOn: null,
      streamsNow: false,
    });
    expect((await movieReleaseState(alice, id('stream'), 'US'))!.placement).toBe('watchlist');
    expect(await movieReleaseState(alice, '00000000-0000-0000-0000-000000000000', 'US')).toBeNull();
  });

  it('counts watched films not ranked yet, per medium, with a HEAD request', async () => {
    expect(await unrankedCount(alice, 'movie')).toBe(0);
    await logWatch(alice, id('stream'));
    await logWatch(alice, id('rent'));
    expect(await unrankedCount(alice, 'movie')).toBe(2);
    expect(await unrankedCount(alice, 'game')).toBe(0);

    await insertRankingEntry(alice, { mediaItemId: id('stream'), medium: 'movie', tier: 'liked', position: 0 });
    expect(await unrankedCount(alice, 'movie')).toBe(1);
  });

  it('answers a second user from their own rows alone', async () => {
    expect(await movieWatchlist(bob)).toEqual([]);
    expect(await movieCalendar(bob)).toEqual([]);
    expect(await unrankedCount(bob, 'movie')).toBe(0);
  });
});
