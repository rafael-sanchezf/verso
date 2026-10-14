/**
 * The movie screens' reads against a real local stack: `moviePage`,
 * `movieHomeRows`, `searchGames`'s `person_match`, `logSeen` and the diary's
 * source, and `deckCandidates` for films. See test/support.ts for what the
 * suite needs in the environment and why it skips without it.
 *
 * The pgTAP suite (supabase/tests/movie_screens.test.sql) proves the rules
 * case by case and the cost on 25,000 films; this proves the wrappers: that
 * each call reaches its function through supabase-js and comes back in the
 * shape the screens read, camelCase where the module's other reads are.
 *
 * Names carry a per-run stamp and provider ids sit above nine hundred and
 * seventy thousand, so a run never meets a mirrored catalog or another run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { searchGames } from '../src/catalog';
import { diaryFor, logSeen, logWatch, removeWatch } from '../src/diary';
import { getEntry, setStatus } from '../src/entries';
import { movieHomeRows, moviePage } from '../src/movies';
import { deckCandidates } from '../src/onboarding';
import { setWatchSettings } from '../src/profiles';
import { insertRankingEntry, tierList } from '../src/ranking';
import { live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const stamp = Math.random().toString(36).slice(2, 8);
const HORROR = `Screens Horror ${stamp}`;
const COMEDY = `Screens Comedy ${stamp}`;
const DIRECTOR = `Qorv${stamp} Villenx`;
const ACTOR = `Tymo${stamp} Chalx`;
const providerA = 970_000 + Math.floor(Math.random() * 9_000);
const providerB = providerA + 1;

describe.skipIf(!live)('the movie screens against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let films: Record<string, SeededGame>;
  const id = (key: string) => films[key]!.mediaItemId;

  beforeAll(async () => {
    alice = (await signUpUser('screens-a')).client;
    bob = (await signUpUser('screens-b')).client;

    const outside = [{ source: 'tmdb', score: 99, scoreCount: 500 }];
    films = await seedGames([
      { key: 'page', medium: 'movie', title: `Screens Page ${stamp}`, genres: ['Sci-Fi'], releaseDate: '2021-10-22', year: 2021 },
      { key: 'r1', medium: 'movie', genres: [HORROR], releaseDate: '2001-01-01' },
      { key: 'r2', medium: 'movie', genres: [HORROR], releaseDate: '2002-01-01' },
      { key: 'r3', medium: 'movie', genres: [HORROR], releaseDate: '2003-01-01' },
      { key: 'r4', medium: 'movie', genres: [COMEDY], releaseDate: '2004-01-01' },
      ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'].map((key) => ({
        key,
        medium: 'movie' as const,
        genres: [HORROR],
        releaseDate: '2010-01-01',
        scores: outside,
        // over the 50 votes a film needs to be offered outside the watchlist
        metadata: { vote_count: 500 },
      })),
      // a horror film with a perfect average from four votes (VER-202)
      {
        key: 'few',
        medium: 'movie',
        genres: [HORROR],
        releaseDate: '2010-01-01',
        scores: [{ source: 'tmdb', score: 100, scoreCount: 4 }],
        metadata: { vote_count: 4 },
      },
      { key: 'watch', medium: 'movie', genres: [COMEDY], releaseDate: '2015-01-01' },
      { key: 'seen', medium: 'movie', genres: [COMEDY], releaseDate: '2016-01-01' },
      { key: 'game', title: `Screens Game ${stamp}` },
    ]);

    const service = serviceClient();
    const writes = await Promise.all([
      service
        .from('movie_details')
        .update({
          runtime_minutes: 155,
          directors: [DIRECTOR],
          writers: ['Screens Writer'],
          top_cast: [{ tmdb_person_id: 1, name: ACTOR, character: 'Paul', profile_path: '/a.jpg' }],
          collection_name: 'Screens Collection',
        })
        .eq('media_item_id', id('page')),
      service.from('movie_details').update({ directors: [DIRECTOR] }).eq('media_item_id', id('r1')),
      service.from('watch_providers').upsert([
        { provider_id: providerA, name: `Screens A ${stamp}`, logo_image_id: '/a.png', display_priorities: { US: 2 } },
        { provider_id: providerB, name: `Screens B ${stamp}`, display_priorities: { US: 1 } },
      ]),
      service.from('media_certifications').insert({ media_item_id: id('page'), region: 'US', certification: 'PG-13' }),
      service.from('external_scores').insert([
        { media_item_id: id('page'), source: 'tmdb', score: 79, score_count: 1200 },
        { media_item_id: id('page'), source: 'rotten_tomatoes', score: 93 },
      ]),
    ]);
    for (const { error } of writes) if (error) throw error;

    const { error: offersError } = await service.from('watch_availability').insert([
      { media_item_id: id('page'), region: 'US', provider_id: providerA, offer_type: 'flatrate' },
      { media_item_id: id('page'), region: 'US', provider_id: providerB, offer_type: 'rent' },
      { media_item_id: id('h1'), region: 'US', provider_id: providerA, offer_type: 'flatrate' },
      { media_item_id: id('h1'), region: 'US', provider_id: providerB, offer_type: 'ads' },
    ]);
    if (offersError) throw offersError;

    await setWatchSettings(alice, { providerIds: [providerA] });
    await insertRankingEntry(alice, { mediaItemId: id('r1'), medium: 'movie', tier: 'loved', position: 0 });
    await insertRankingEntry(alice, { mediaItemId: id('r2'), medium: 'movie', tier: 'loved', position: 1 });
    await insertRankingEntry(alice, { mediaItemId: id('r3'), medium: 'movie', tier: 'liked', position: 0 });
    await insertRankingEntry(alice, { mediaItemId: id('r4'), medium: 'movie', tier: 'disliked', position: 0 });
    await setStatus(alice, id('watch'), 'backlog');

    // The nightly refresh the Home pools walk.
    const { error: refreshError } = await service.rpc('refresh_item_priors', { p_medium: 'movie' });
    if (refreshError) throw refreshError;
  });

  afterAll(async () => {
    await stopClients();
  });

  it('reads the movie page in one call, with the caller’s services marked', async () => {
    const page = await moviePage(alice, id('page'), { region: 'us' });
    expect(page).toMatchObject({
      mediaItemId: id('page'),
      title: `Screens Page ${stamp}`,
      year: 2021,
      runtimeMinutes: 155,
      genres: ['Sci-Fi'],
      directors: [DIRECTOR],
      writers: ['Screens Writer'],
      topCast: [{ tmdbPersonId: 1, name: ACTOR, character: 'Paul', profilePath: '/a.jpg' }],
      collectionName: 'Screens Collection',
      certification: 'PG-13',
      awards: null,
      releaseState: { placement: 'watchlist', streamsNow: true },
      availability: [
        { providerId: providerB, offerType: 'rent', mine: false },
        { providerId: providerA, name: `Screens A ${stamp}`, logoImageId: '/a.png', offerType: 'flatrate', mine: true },
      ],
    });
    expect(page!.scores['tmdb']).toMatchObject({ source: 'tmdb', score: 79, scoreCount: 1200 });
    expect(page!.scores['rotten_tomatoes']).toMatchObject({ score: 93, scoreCount: null });
    expect(await moviePage(alice, id('game'))).toBeNull();
  });

  it('finds a film by its director and says who, and a title match says nothing', async () => {
    const byPerson = await searchGames(alice, DIRECTOR, { medium: 'movie', limit: 20 });
    const page = byPerson.find((row) => row.media_item_id === id('page'));
    expect(page).toMatchObject({ person_match: DIRECTOR, year: 2021, genres: ['Sci-Fi'] });

    const byActor = await searchGames(alice, ACTOR, { medium: 'movie', limit: 20 });
    expect(byActor.find((row) => row.media_item_id === id('page'))?.person_match).toBe(ACTOR);

    const byTitle = await searchGames(alice, `Screens Page ${stamp}`, { medium: 'movie', limit: 5 });
    expect(byTitle[0]).toMatchObject({ media_item_id: id('page'), person_match: null });

    const game = await searchGames(alice, `Screens Game ${stamp}`, { limit: 5 });
    expect(game[0]).toMatchObject({ media_item_id: id('game'), person_match: null });
  });

  it('marks a film seen with an undated bulk row, and the diary keeps it last', async () => {
    const seen = await logSeen(alice, id('seen'));
    expect(seen.watch).toMatchObject({ mediaItemId: id('seen'), source: 'bulk', watchedOn: null });
    expect(seen.entry).toMatchObject({ status: 'played', finishedAt: null });
    expect(seen.alreadyRanked).toBe(false);

    const logged = await logWatch(alice, id('seen'), { watchedOn: '2026-09-02' });
    expect(logged.watch).toMatchObject({ source: 'log', watchedOn: '2026-09-02' });
    expect(logged.entry.finishedAt).toBe('2026-09-02');

    expect((await diaryFor(alice, id('seen'))).map((row) => [row.source, row.watchedOn])).toEqual([
      ['log', '2026-09-02'],
      ['bulk', null],
    ]);
  });

  it('marks a film seen once however often it is ticked, and removing rows moves finished_at only for a dated one', async () => {
    const before = await diaryFor(alice, id('seen'));
    const bulk = before.find((row) => row.source === 'bulk')!;
    const dated = before.find((row) => row.source === 'log')!;

    const again = await logSeen(alice, id('seen'));
    expect(again.watch.id).toBe(bulk.id);
    expect(again.entry.finishedAt).toBe('2026-09-02');
    expect(await diaryFor(alice, id('seen'))).toHaveLength(2);

    await removeWatch(alice, bulk.id);
    expect((await getEntry(alice, id('seen')))!.finishedAt).toBe('2026-09-02');

    await removeWatch(alice, dated.id);
    expect((await getEntry(alice, id('seen')))!).toMatchObject({ status: 'played', finishedAt: null });
  });

  it('builds Home’s rows by reason, the watchlist first', async () => {
    const rows = await movieHomeRows(alice, { region: 'US' });
    expect(rows.map((row) => [row.kind, row.title, row.variablePart, row.aboutMediaItemId])).toEqual([
      ['watchlist', 'You wanted to watch these', null, null],
      ['genre', HORROR, HORROR, null],
      ['because', `Because you loved ${films['r1']!.title}`, films['r1']!.title, id('r1')],
      ['because', `Because you loved ${films['r2']!.title}`, films['r2']!.title, id('r2')],
    ]);
    expect(rows[0]!.candidates.map((candidate) => candidate.mediaItemId)).toEqual([id('watch')]);

    const h1 = rows[1]!.candidates.find((candidate) => candidate.mediaItemId === id('h1'));
    expect(h1).toMatchObject({
      title: films['h1']!.title,
      year: 2020,
      genres: [HORROR],
      streamsOn: [providerB, providerA],
      onMyServices: [providerA],
    });
    expect(rows[1]!.candidates.length).toBeLessThanOrEqual(12);
    // nothing Alice tracks or ranked, and not the four-vote film
    const neverOffered = new Set(['r1', 'r2', 'r3', 'r4', 'watch', 'seen', 'few'].map(id));
    for (const row of rows.slice(1)) {
      for (const candidate of row.candidates) expect(neverOffered.has(candidate.mediaItemId)).toBe(false);
    }
  });

  it('lists a ranked film with its genres, which the film Ranking and the genre pivot read', async () => {
    const loved = await tierList(alice, 'movie', 'loved');
    expect(loved.map((row) => [row.media_item_id, row.genres, row.platforms])).toEqual([
      [id('r1'), [HORROR], []],
      [id('r2'), [HORROR], []],
    ]);
  });

  it('gives a user with nothing ranked and no watchlist one popular row', async () => {
    const rows = await movieHomeRows(bob);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'popular', title: 'Popular', variablePart: null, aboutMediaItemId: null });
    expect(rows[0]!.candidates.length).toBeGreaterThan(0);
  });

  it('pages the film deck: films only, nothing tracked, no platforms', async () => {
    const page = await deckCandidates(alice, null, 20, 0, 'movie');
    expect(page.map((row) => row.popularityRank)).toEqual(page.map((_, index) => index + 1));
    expect(page.every((row) => row.platforms.length === 0)).toBe(true);

    const tracked = new Set(['r1', 'r2', 'r3', 'r4', 'watch', 'seen'].map(id));
    expect(page.some((row) => tracked.has(row.mediaItemId))).toBe(false);

    const { data, error } = await serviceClient()
      .from('media_items')
      .select('medium')
      .in('id', page.map((row) => row.mediaItemId));
    if (error) throw error;
    expect(data.every((row) => row.medium === 'movie')).toBe(true);

    const games = await deckCandidates(alice, null, 5, 0);
    expect(games.some((row) => row.mediaItemId === id('page'))).toBe(false);
  });
});
