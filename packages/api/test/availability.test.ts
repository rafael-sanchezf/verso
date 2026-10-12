/**
 * `availability.ts` against a real local stack.
 *
 * Both halves of the boundary are here, because they are the point of the
 * table: rows go in as the service role, the way the nightly job writes them,
 * and come out as a signed-in user, the way the game page reads them -- and the
 * same signed-in user cannot write one, while a signed-out one sees nothing at
 * all rather than an error.
 *
 * The one piece of behaviour a screen depends on and cannot see from the types
 * is that `removed_at` is the filter: a game that left Game Pass keeps its row,
 * dated, and simply stops being an answer.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { availabilityFor, availabilityForMany, formatService } from '../src/availability';
import type { Client } from '../src/client';
import { live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const DAY = 24 * 60 * 60 * 1000;

/** An ISO timestamp `ago` milliseconds in the past. */
function ago(milliseconds: number): string {
  return new Date(Date.now() - milliseconds).toISOString();
}

describe('formatService', () => {
  it('names the four services the job writes itself', () => {
    expect(formatService('game_pass_console')).toBe('Game Pass (console)');
    expect(formatService('game_pass_pc')).toBe('Game Pass (PC)');
    expect(formatService('ea_play')).toBe('EA Play');
    expect(formatService('geforce_now')).toBe('GeForce NOW');
  });

  it('title-cases an itad: slug, so a new subscription never draws as a raw id', () => {
    expect(formatService('itad:prime-gaming')).toBe('Prime Gaming');
    expect(formatService('itad:ubisoft')).toBe('Ubisoft');
    expect(formatService('itad:game-pass')).toBe('Game Pass');
  });

  it('returns anything else unchanged rather than inventing a name', () => {
    expect(formatService('something_new')).toBe('something_new');
    expect(formatService('itad:')).toBe('itad:');
  });
});

describe.skipIf(!live)('availability against a local stack', () => {
  let client: Client;
  let other: Client;
  let games: Record<string, SeededGame>;
  const firstSeen = { old: ago(90 * DAY), recent: ago(10 * DAY) };

  beforeAll(async () => {
    const user = await signUpUser('availability');
    client = user.client;
    other = (await signUpUser('availability-other')).client;
    games = await seedGames([{ key: 'listed' }, { key: 'quiet' }]);

    const listed = games['listed']!.mediaItemId;
    const { error } = await serviceClient()
      .from('game_availability')
      .insert([
        {
          media_item_id: listed,
          service: 'game_pass_console',
          region: 'US',
          source_ref: '9NPDN9R45JX4',
          first_seen_at: firstSeen.old,
          last_seen_at: new Date().toISOString(),
        },
        {
          media_item_id: listed,
          service: 'geforce_now',
          region: 'US',
          source_ref: '100932911',
          first_seen_at: firstSeen.recent,
          last_seen_at: new Date().toISOString(),
        },
        {
          media_item_id: listed,
          service: 'itad:prime-gaming',
          region: 'US',
          source_ref: '018d937f-24b7-731c-a789-8307ae059efa',
          first_seen_at: firstSeen.recent,
          last_seen_at: new Date().toISOString(),
        },
        // Left the service a month ago. Still a row; never an answer.
        {
          media_item_id: listed,
          service: 'ea_play',
          region: 'US',
          source_ref: 'BWVBNCMF22ZK',
          first_seen_at: ago(300 * DAY),
          last_seen_at: ago(31 * DAY),
          removed_at: ago(30 * DAY),
        },
      ]);
    if (error) throw error;
  });

  afterAll(async () => {
    await stopClients();
  });

  it('reads the services a game is on right now, in display order', async () => {
    const rows = await availabilityFor(client, games['listed']!.mediaItemId);

    expect(rows.map((row) => row.service)).toEqual([
      'game_pass_console',
      'geforce_now',
      'itad:prime-gaming',
    ]);
    expect(rows.map((row) => formatService(row.service))).toEqual([
      'Game Pass (console)',
      'GeForce NOW',
      'Prime Gaming',
    ]);
  });

  it('excludes a service the game has left, and keeps the row that says so', async () => {
    const rows = await availabilityFor(client, games['listed']!.mediaItemId);
    expect(rows.map((row) => row.service)).not.toContain('ea_play');

    // The row is still there for anyone reading the table directly.
    const { data } = await client
      .from('game_availability')
      .select('service, removed_at')
      .eq('media_item_id', games['listed']!.mediaItemId)
      .not('removed_at', 'is', null);
    expect(data?.map((row) => row.service)).toEqual(['ea_play']);
  });

  it('carries the region and the date we first saw it', async () => {
    const rows = await availabilityFor(client, games['listed']!.mediaItemId);
    const gamePass = rows.find((row) => row.service === 'game_pass_console');

    expect(gamePass?.region).toBe('US');
    expect(Date.parse(gamePass!.since)).toBe(Date.parse(firstSeen.old));
  });

  it('gives an empty array, not an error, for a game on no subscription', async () => {
    expect(await availabilityFor(client, games['quiet']!.mediaItemId)).toEqual([]);
  });

  it('gives an empty array for a media item that does not exist', async () => {
    expect(await availabilityFor(client, '00000000-0000-4000-8000-000000000000')).toEqual([]);
  });

  it('reads many games at once and keys every id that was asked for', async () => {
    const ids = [games['listed']!.mediaItemId, games['quiet']!.mediaItemId];
    const byId = await availabilityForMany(client, ids);

    expect(Object.keys(byId).sort()).toEqual([...ids].sort());
    expect(byId[ids[0]!]!.map((row) => row.service)).toEqual([
      'game_pass_console',
      'geforce_now',
      'itad:prime-gaming',
    ]);
    // Present and empty, so a list row needs no null check.
    expect(byId[ids[1]!]).toEqual([]);
  });

  it('asks nothing of the database for an empty list of ids', async () => {
    expect(await availabilityForMany(client, [])).toEqual({});
  });

  it('shows two users the same catalog fact', async () => {
    const mine = await availabilityFor(client, games['listed']!.mediaItemId);
    const theirs = await availabilityFor(other, games['listed']!.mediaItemId);

    expect(theirs).toEqual(mine);
    expect(theirs).toHaveLength(3);
  });

  it('refuses an availability row written by a signed-in user', async () => {
    const { error } = await client.from('game_availability').insert({
      media_item_id: games['quiet']!.mediaItemId,
      service: 'game_pass_console',
      region: 'US',
    });

    expect(error).not.toBeNull();
    // Still nothing there: the refusal is the database's, not a silent no-op.
    expect(await availabilityFor(client, games['quiet']!.mediaItemId)).toEqual([]);
  });

  it('refuses a signed-in user bringing a removed row back', async () => {
    const { error } = await client
      .from('game_availability')
      .update({ removed_at: null })
      .eq('media_item_id', games['listed']!.mediaItemId)
      .eq('service', 'ea_play');

    expect(error).not.toBeNull();
    expect((await availabilityFor(client, games['listed']!.mediaItemId)).map((r) => r.service)).not.toContain(
      'ea_play',
    );
  });

  it('reads nothing at all, and no error, when signed out', async () => {
    const { anonClient } = await import('./support');
    const signedOut = anonClient();

    expect(await availabilityFor(signedOut, games['listed']!.mediaItemId)).toEqual([]);
    expect(await availabilityForMany(signedOut, [games['listed']!.mediaItemId])).toEqual({
      [games['listed']!.mediaItemId]: [],
    });
  });
});
