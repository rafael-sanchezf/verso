/**
 * The diary (watch_log) against a real local stack: `logWatch`, `editWatch`,
 * `removeWatch`, `diaryFor` and `diary`. See test/support.ts for what the
 * suite needs in the environment and why it skips without it.
 *
 * The pgTAP suite (supabase/tests/watch_log.test.sql) proves the rules; this
 * proves the wrappers reach them through supabase-js: that an insert without a
 * user id lands as the caller, that the trigger's entry comes back, that the
 * delete carries its WHERE (PostgREST's safeupdate refuses one without), and
 * that a second user sees nothing of the first.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { diary, diaryFor, editWatch, logWatch, removeWatch, WATCH_PLACE_THEATER } from '../src/diary';
import { getEntry, setPlannedOn, setStatus } from '../src/entries';
import { insertRankingEntry } from '../src/ranking';
import { live, seedGames, signUpUser, stopClients, type SeededGame } from './support';

describe.skipIf(!live)('the diary against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let items: Record<string, SeededGame>;
  const id = (key: string) => items[key]!.mediaItemId;

  beforeAll(async () => {
    alice = (await signUpUser('diary-a')).client;
    bob = (await signUpUser('diary-b')).client;
    items = await seedGames([
      { key: 'fresh', medium: 'movie', title: 'Diary Fresh' },
      { key: 'listed', medium: 'movie', title: 'Diary Listed' },
      { key: 'ranked', medium: 'movie', title: 'Diary Ranked' },
      { key: 'game', title: 'Diary Game' },
      { key: 'opening', medium: 'movie', title: 'Diary Opening' },
    ]);
    await setStatus(alice, id('listed'), 'backlog');
    await insertRankingEntry(alice, { mediaItemId: id('ranked'), medium: 'movie', tier: 'loved', position: 0 });
  });

  afterAll(async () => {
    await stopClients();
  });

  it('logs a film nobody tracked, makes it played, and says it is not ranked yet', async () => {
    const result = await logWatch(alice, id('fresh'), { watchedOn: '2026-09-02', place: ' Netflix ', note: '  ' });
    expect(result.watch).toMatchObject({ mediaItemId: id('fresh'), watchedOn: '2026-09-02', place: 'Netflix', note: null });
    expect(result.entry).toMatchObject({ status: 'played', finishedAt: '2026-09-02' });
    expect(result.alreadyRanked).toBe(false);
  });

  it('moves a want-to-watch film to played and reports a ranked film as ranked', async () => {
    const listed = await logWatch(alice, id('listed'), { watchedOn: '2026-10-01' });
    expect(listed.entry).toMatchObject({ status: 'played', finishedAt: '2026-10-01', backlogPosition: null });

    const ranked = await logWatch(alice, id('ranked'), { watchedOn: '2026-10-03', place: WATCH_PLACE_THEATER });
    expect(ranked.alreadyRanked).toBe(true);
  });

  it('keeps rewatches as rows, newest first, with finishedAt on the latest', async () => {
    await logWatch(alice, id('fresh'), { watchedOn: '2026-08-01' });
    await logWatch(alice, id('fresh'), { watchedOn: '2026-09-20', note: 'Better the second time' });

    const rows = await diaryFor(alice, id('fresh'));
    expect(rows.map((row) => row.watchedOn)).toEqual(['2026-09-20', '2026-09-02', '2026-08-01']);
    expect((await getEntry(alice, id('fresh')))!.finishedAt).toBe('2026-09-20');
  });

  it('moves finishedAt with an edited day and a removed row', async () => {
    const [latest] = await diaryFor(alice, id('fresh'));
    const edited = await editWatch(alice, latest!.id, { watchedOn: '2026-07-01', place: 'Max' });
    expect(edited).toMatchObject({ watchedOn: '2026-07-01', place: 'Max', note: 'Better the second time' });
    expect((await getEntry(alice, id('fresh')))!.finishedAt).toBe('2026-09-02');

    const [first] = await diaryFor(alice, id('fresh'));
    await removeWatch(alice, first!.id);
    expect((await getEntry(alice, id('fresh')))!.finishedAt).toBe('2026-08-01');

    // Removing a row that is already gone is not an error.
    await removeWatch(alice, first!.id);
  });

  it('plans a day on a film nobody tracked, and clears it when the watch lands on it', async () => {
    const planned = await setPlannedOn(alice, id('opening'), '2026-10-24');
    expect(planned).toMatchObject({ status: 'backlog', plannedOn: '2026-10-24' });

    await logWatch(alice, id('opening'), { watchedOn: '2026-10-20' });
    expect((await getEntry(alice, id('opening')))!.plannedOn).toBe('2026-10-24');

    const watched = await logWatch(alice, id('opening'), { watchedOn: '2026-10-24', place: WATCH_PLACE_THEATER });
    expect(watched.entry).toMatchObject({ status: 'played', plannedOn: null, finishedAt: '2026-10-24' });

    expect((await setPlannedOn(alice, id('opening'), '2026-12-01')).plannedOn).toBe('2026-12-01');
    expect((await setPlannedOn(alice, id('opening'), null)).plannedOn).toBeNull();
    await expect(setPlannedOn(alice, id('opening'), 'Friday')).rejects.toBeInstanceOf(RangeError);
  });

  it('refuses a game', async () => {
    await expect(logWatch(alice, id('game'), { watchedOn: '2026-10-01' })).rejects.toMatchObject({ code: '22023' });
  });

  it('refuses a day that is not a calendar date before any round trip', async () => {
    await expect(logWatch(alice, id('fresh'), { watchedOn: '10/01/2026' })).rejects.toBeInstanceOf(RangeError);
  });

  it('lists the diary newest first with each film', async () => {
    const rows = await diary(alice);
    expect(rows.map((row) => [row.title, row.watchedOn])).toEqual([
      ['Diary Opening', '2026-10-24'],
      ['Diary Opening', '2026-10-20'],
      ['Diary Ranked', '2026-10-03'],
      ['Diary Listed', '2026-10-01'],
      ['Diary Fresh', '2026-08-01'],
      ['Diary Fresh', '2026-07-01'],
    ]);
    expect(await diary(alice, { limit: 2 })).toHaveLength(2);
  });

  it('shows a second user nothing of the first, and lets them neither edit nor remove it', async () => {
    expect(await diary(bob)).toEqual([]);
    expect(await diaryFor(bob, id('fresh'))).toEqual([]);

    const [aliceRow] = await diaryFor(alice, id('listed'));
    await expect(editWatch(bob, aliceRow!.id, { note: 'hacked' })).rejects.toBeTruthy();
    await removeWatch(bob, aliceRow!.id);
    expect(await diaryFor(alice, id('listed'))).toHaveLength(1);

    const own = await logWatch(bob, id('listed'), { watchedOn: '2026-10-06' });
    expect(own.entry.finishedAt).toBe('2026-10-06');
    expect((await getEntry(alice, id('listed')))!.finishedAt).toBe('2026-10-01');
  });
});
