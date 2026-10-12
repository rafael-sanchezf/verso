/**
 * `searchGames` after search learned words and aliases
 * (supabase/migrations/20260923110000_search_aliases.sql), against a real
 * local stack: phone feedback entries 6 ("GTA" found nothing) and 9 ("Zelda"
 * missed every subtitled Zelda), through supabase-js as the app calls it.
 *
 * The ranking rules themselves are asserted in pgTAP
 * (supabase/tests/search_aliases.test.sql); this suite proves the RPC answers
 * them through PostgREST as a signed-in user, and that the aliases table is as
 * readable as the rest of the catalog and no more.
 *
 * The local catalog is shared with every other suite and may hold the whole
 * mirrored IGDB catalog, so nothing here asserts a global ordering it does not
 * control. The fixtures carry rating counts taken from the clock, above
 * anything IGDB has recorded, so this run's rows lead their tier, and each
 * title ends in that number so its initialism does too.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { searchGames } from '../src/catalog';
import type { Client } from '../src/client';
import { anonClient, live, seedGames, serviceClient, signUpUser, stopClients, type SeededGame } from './support';

const BASE = 10_000_000_000 + Date.now();

describe.skipIf(!live)('search by word and alias against a local stack', () => {
  let client: Client;
  let items: Record<string, SeededGame>;

  beforeAll(async () => {
    client = (await signUpUser('search')).client;

    items = await seedGames([
      { key: 'gta', title: `Grand Theft Auto V ${BASE}` },
      { key: 'zelda', title: `The Legend of Zelda: Breath of the Wild ${BASE}` },
      { key: 'other', title: `Hollow Knight ${BASE}` },
    ]);

    // Popularity is the mirror's column, so it is written as the service role.
    const service = serviceClient();
    const counts: Record<string, number> = { gta: BASE + 2, zelda: BASE + 3, other: BASE + 1 };
    for (const [key, total_rating_count] of Object.entries(counts)) {
      const { error } = await service
        .from('media_items')
        .update({ metadata: { total_rating_count } })
        .eq('id', items[key]!.mediaItemId);
      if (error) throw error;
    }
  });

  afterAll(async () => {
    await stopClients();
  });

  const ids = (rows: { media_item_id: string }[]) => rows.map((row) => row.media_item_id);

  it('finds Grand Theft Auto for "gta", first, and nothing unrelated', async () => {
    const rows = await searchGames(client, 'gta', { limit: 100 });

    expect(ids(rows)).toContain(items['gta']!.mediaItemId);
    expect(ids(rows)).not.toContain(items['other']!.mediaItemId);
    expect(rows[0]!.title.startsWith('Grand Theft Auto')).toBe(true);
  });

  it('finds a subtitled Zelda for "zelda" and for "breath", words inside the title', async () => {
    expect(ids(await searchGames(client, 'zelda', { limit: 100 }))).toContain(items['zelda']!.mediaItemId);
    expect(ids(await searchGames(client, 'breath', { limit: 100 }))).toContain(items['zelda']!.mediaItemId);
  });

  it('finds Breath of the Wild for "botw" through its initialism', async () => {
    const rows = await searchGames(client, 'botw', { limit: 100 });
    const hit = rows.find((row) => row.media_item_id === items['zelda']!.mediaItemId);

    expect(hit).toBeDefined();
    // The prefix tier: an initialism is a guess, not a name IGDB gave it.
    expect(hit!.score).toBeGreaterThanOrEqual(2);
  });

  it('keeps the row shape: genres, platforms and the IGDB id come along', async () => {
    const row = (await searchGames(client, 'gta', { limit: 100 })).find(
      (candidate) => candidate.media_item_id === items['gta']!.mediaItemId,
    )!;

    expect(row.igdb_id).toBe(items['gta']!.igdbId);
    expect(row.genres).toEqual(['Role-playing (RPG)']);
    expect(row.platforms).toEqual(['PC (Microsoft Windows)', 'Nintendo Switch']);
    expect(typeof row.score).toBe('number');
  });

  it('lets a signed-in user read the aliases the trigger derived', async () => {
    const { data, error } = await client
      .from('media_aliases')
      .select('alias, source')
      .eq('media_item_id', items['zelda']!.mediaItemId);

    expect(error).toBeNull();
    expect(data).toContainEqual({ alias: `BOTW ${BASE}`, source: 'initialism' });
  });

  it('lets nobody signed out read an alias or search', async () => {
    const anon = anonClient();
    const { data, error } = await anon.from('media_aliases').select('alias').limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    await expect(searchGames(anon, 'gta')).rejects.toThrow();
  });

  it('refuses a signed-in user writing an alias', async () => {
    const { error } = await client
      .from('media_aliases')
      .insert({ media_item_id: items['other']!.mediaItemId, alias: 'HK', source: 'igdb' });

    expect(error).not.toBeNull();
  });
});
