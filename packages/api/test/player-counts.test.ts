/**
 * `player-counts.ts` against a real local stack.
 *
 * The two halves of the boundary are both here, because they are the point of
 * the table: rows go in as the service role, the way the Edge Function writes
 * them, and come out as a signed-in user, the way the game page reads them --
 * and the same signed-in user cannot write one.
 *
 * Readings are seeded relative to now, because the default window is
 * `now() - interval '7 days'` inside `player_count_history`: fixed timestamps
 * would pass today and quietly stop testing the window next week.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { latestPlayerCount, playerCountHistory } from '../src/player-counts';
import { live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** An ISO timestamp `ago` milliseconds in the past. */
function ago(milliseconds: number): string {
  return new Date(Date.now() - milliseconds).toISOString();
}

describe.skipIf(!live)('player counts against a local stack', () => {
  let client: Client;
  let games: Record<string, SeededGame>;
  const observedAt = {
    tenDays: ago(10 * DAY),
    threeDays: ago(3 * DAY),
    oneHour: ago(HOUR),
    fiveMinutes: ago(5 * MINUTE),
  };

  beforeAll(async () => {
    const user = await signUpUser('player-counts');
    client = user.client;
    games = await seedGames([{ key: 'polled' }, { key: 'quiet' }]);

    const polled = games['polled']!.mediaItemId;
    const { error } = await serviceClient()
      .from('player_counts')
      .insert([
        { media_item_id: polled, observed_at: observedAt.tenDays, players: 1000 },
        { media_item_id: polled, observed_at: observedAt.threeDays, players: 2000 },
        { media_item_id: polled, observed_at: observedAt.oneHour, players: 3000 },
        { media_item_id: polled, observed_at: observedAt.fiveMinutes, players: 4000 },
      ]);
    if (error) throw error;
  });

  afterAll(async () => {
    await stopClients();
  });

  it('reads the newest reading, with the time it was taken', async () => {
    const latest = await latestPlayerCount(client, games['polled']!.mediaItemId);

    expect(latest?.players).toBe(4000);
    expect(Date.parse(latest!.observedAt)).toBe(Date.parse(observedAt.fiveMinutes));
  });

  it('has no latest reading for a game nothing has polled', async () => {
    expect(await latestPlayerCount(client, games['quiet']!.mediaItemId)).toBeNull();
  });

  it('has no latest reading for a media item that does not exist', async () => {
    expect(await latestPlayerCount(client, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('reads the last seven days by default, oldest first', async () => {
    const history = await playerCountHistory(client, games['polled']!.mediaItemId);

    expect(history.map((point) => point.players)).toEqual([2000, 3000, 4000]);
    expect(Date.parse(history[0]!.observedAt)).toBe(Date.parse(observedAt.threeDays));
  });

  it('takes a wider window, as a string or as a Date', async () => {
    const id = games['polled']!.mediaItemId;
    const since = new Date(Date.now() - 11 * DAY);

    expect((await playerCountHistory(client, id, since)).map((point) => point.players)).toEqual([
      1000, 2000, 3000, 4000,
    ]);
    expect(
      (await playerCountHistory(client, id, since.toISOString())).map((point) => point.players),
    ).toEqual([1000, 2000, 3000, 4000]);
  });

  it('takes a narrower window too', async () => {
    const history = await playerCountHistory(
      client,
      games['polled']!.mediaItemId,
      new Date(Date.now() - 10 * MINUTE),
    );

    expect(history.map((point) => point.players)).toEqual([4000]);
  });

  it('gives an empty history, not an error, for a game nothing has polled', async () => {
    expect(await playerCountHistory(client, games['quiet']!.mediaItemId)).toEqual([]);
  });

  it('refuses a player count written by a signed-in user', async () => {
    const { error } = await client.from('player_counts').insert({
      media_item_id: games['quiet']!.mediaItemId,
      observed_at: new Date().toISOString(),
      players: 999_999,
    });

    expect(error).not.toBeNull();
    // Still nothing there: the refusal is the database's, not a silent no-op.
    expect(await latestPlayerCount(client, games['quiet']!.mediaItemId)).toBeNull();
  });
});
