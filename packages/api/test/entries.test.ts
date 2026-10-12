/**
 * `entries.ts` against a real local stack. See test/support.ts for what the
 * suite needs in the environment and why it skips without it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getEntry,
  logPlaytime,
  markFinished,
  moveToBacklog,
  NotSignedInError,
  removeEntry,
  setNotes,
  setPurchasedAt,
  setStartedAt,
  setStatus,
  todayLocal,
} from '../src/entries';
import { insertRankingEntry } from '../src/ranking';
import type { Client } from '../src/client';
import { anonClient, live, seedGames, signUpUser, stopClients, type SeededGame } from './support';

describe('todayLocal', () => {
  it('spells the local calendar day, not the UTC one', () => {
    // 00:30 on the 16th in a timezone behind UTC is still the 15th in UTC. The
    // date columns mean the day where the user is standing.
    const localMidnightish = new Date(2026, 8, 16, 0, 30, 0);
    expect(todayLocal(localMidnightish)).toBe('2026-09-16');
  });

  it('pads single-digit months and days', () => {
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe.skipIf(!live)('entries against a local stack', () => {
  let client: Client;
  let games: Record<string, SeededGame>;

  beforeAll(async () => {
    const user = await signUpUser('entries');
    client = user.client;
    games = await seedGames([
      { key: 'rpg', platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 5'] },
      { key: 'other' },
      { key: 'ranked' },
      { key: 'gone' },
    ]);
  });

  afterAll(async () => {
    await stopClients();
  });

  it('has no entry for a game you do not track', async () => {
    expect(await getEntry(client, games['other']!.mediaItemId)).toBeNull();
  });

  it('creates the entry on the first write, with nothing played on and no started date', async () => {
    const entry = await setStatus(client, games['other']!.mediaItemId, 'backlog');

    expect(entry.status).toBe('backlog');
    expect(entry.mediaItemId).toBe(games['other']!.mediaItemId);
    expect(entry.playedPlatforms).toEqual([]);
    // Decision 26: ownership left the product, and the entry carries no trace of it.
    expect(entry).not.toHaveProperty('ownedPlatforms');
    // First thing in this account's backlog, so the trigger puts it at the top
    // of the queue. Writing `status` is the whole operation.
    expect(entry.backlogPosition).toBe(0);
    expect(entry.startedAt).toBeNull();
    expect(entry.finishedAt).toBeNull();
    expect(entry.playtimeMinutes).toBeNull();
    expect(Date.parse(entry.addedAt)).not.toBeNaN();
    expect(await getEntry(client, games['other']!.mediaItemId)).toEqual(entry);
  });

  it('lets the trigger stamp started_at on the first move to playing', async () => {
    const id = games['rpg']!.mediaItemId;

    const backlog = await setStatus(client, id, 'backlog');
    expect(backlog.startedAt).toBeNull();

    const playing = await setStatus(client, id, 'playing');
    expect(playing.startedAt).not.toBeNull();
    expect(Math.abs(Date.parse(playing.startedAt!) - Date.now())).toBeLessThan(60_000);
  });

  it('never re-stamps a started date that is already there', async () => {
    const id = games['rpg']!.mediaItemId;
    const stamped = (await getEntry(client, id))!.startedAt;

    await setStatus(client, id, 'backlog');
    const again = await setStatus(client, id, 'playing');

    expect(again.startedAt).toBe(stamped);
  });

  it('lets the started date be corrected by hand, and cleared without the trigger putting it back', async () => {
    const id = games['rpg']!.mediaItemId;

    const corrected = await setStartedAt(client, id, '2024-02-01T10:00:00.000Z');
    expect(Date.parse(corrected.startedAt!)).toBe(Date.parse('2024-02-01T10:00:00.000Z'));

    const cleared = await setStartedAt(client, id, null);
    expect(cleared.startedAt).toBeNull();

    // Still `playing`, so the trigger does not fire: it only acts on the move
    // into `playing`, which is what makes a deliberate clear stick.
    const afterAnotherEdit = await setNotes(client, id, 'still playing, date cleared on purpose');
    expect(afterAnotherEdit.startedAt).toBeNull();

    await expect(setStartedAt(client, id, 'not a timestamp')).rejects.toBeInstanceOf(RangeError);
  });

  it('marks a game finished today and says it is not ranked yet', async () => {
    const result = await markFinished(client, games['ranked']!.mediaItemId);

    expect(result.entry.status).toBe('played');
    expect(result.entry.finishedAt).toBe(todayLocal());
    expect(result.alreadyRanked).toBe(false);
    // A finished game has no place in the queue any more.
    expect(result.entry.backlogPosition).toBeNull();
  });

  it('reports a game that is already ranked, so the sheet can say so', async () => {
    const id = games['ranked']!.mediaItemId;
    await insertRankingEntry(client, { mediaItemId: id, medium: 'game', tier: 'liked', position: 0 });

    const result = await markFinished(client, id);
    expect(result.alreadyRanked).toBe(true);
  });

  it('accepts a finished date in the past, and refuses one that is not a date', async () => {
    const entry = await markFinished(client, games['other']!.mediaItemId, { finishedAt: '2023-07-04' });
    expect(entry.entry.finishedAt).toBe('2023-07-04');

    await expect(
      markFinished(client, games['other']!.mediaItemId, { finishedAt: '04/07/2023' }),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('moves a played game back to the backlog without unhappening the day it was finished', async () => {
    const entry = await moveToBacklog(client, games['other']!.mediaItemId);

    expect(entry.status).toBe('backlog');
    expect(entry.finishedAt).toBe('2023-07-04');
    // And it rejoins the queue, at the end.
    expect(entry.backlogPosition).not.toBeNull();
  });

  it('records playtime by hand with its source, and clears both together', async () => {
    const id = games['rpg']!.mediaItemId;

    const manual = await logPlaytime(client, id, 125);
    expect(manual.playtimeMinutes).toBe(125);
    expect(manual.playtimeSource).toBe('manual');

    const imported = await logPlaytime(client, id, 4_200, 'steam');
    expect(imported.playtimeMinutes).toBe(4_200);
    expect(imported.playtimeSource).toBe('steam');

    const cleared = await logPlaytime(client, id, null);
    expect(cleared.playtimeMinutes).toBeNull();
    expect(cleared.playtimeSource).toBeNull();
  });

  it('refuses playtime that is not a whole number of minutes, 0 or more', async () => {
    const id = games['rpg']!.mediaItemId;
    await expect(logPlaytime(client, id, -1)).rejects.toBeInstanceOf(RangeError);
    await expect(logPlaytime(client, id, 90.5)).rejects.toBeInstanceOf(RangeError);
  });

  it('stores a purchase date, clears it, and refuses a non-date', async () => {
    const id = games['rpg']!.mediaItemId;

    expect((await setPurchasedAt(client, id, '2025-12-25')).purchasedAt).toBe('2025-12-25');
    expect((await setPurchasedAt(client, id, null)).purchasedAt).toBeNull();
    await expect(setPurchasedAt(client, id, 'christmas')).rejects.toBeInstanceOf(RangeError);
  });

  it('stores a note and treats blank as nothing at all', async () => {
    const id = games['rpg']!.mediaItemId;

    expect((await setNotes(client, id, '  loved the ending  ')).notes).toBe('loved the ending');
    expect((await setNotes(client, id, '   ')).notes).toBeNull();
    expect((await setNotes(client, id, null)).notes).toBeNull();
  });

  it('removes an entry, and removing one that is not there is not an error', async () => {
    const id = games['gone']!.mediaItemId;
    await setStatus(client, id, 'backlog');

    await removeEntry(client, id);
    expect(await getEntry(client, id)).toBeNull();

    await expect(removeEntry(client, id)).resolves.toBeUndefined();
  });

  it('refuses to write without a session', async () => {
    const signedOut = anonClient();
    await expect(setStatus(signedOut, games['other']!.mediaItemId, 'backlog')).rejects.toBeInstanceOf(
      NotSignedInError,
    );
  });
});
