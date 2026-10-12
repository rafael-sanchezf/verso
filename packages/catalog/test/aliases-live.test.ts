import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogStore } from '../src/db';
import { mapGame } from '../src/map';
import type { IgdbGame } from '../src/types';

/**
 * The IGDB aliases statement against a real Postgres.
 *
 * `db-sql.test.ts` reads the statement; this one runs it, next to the trigger
 * in supabase/migrations/20260923110000_search_aliases.sql, because the thing
 * worth proving is how the two share one table: the mirror replaces its own
 * `igdb` rows and never an `initialism` row, and a re-sync of unchanged names
 * writes nothing.
 *
 * Skipped unless DATABASE_URL is set, so `pnpm test` stays a no-database run:
 *
 *   supabase start
 *   supabase db reset --local
 *   eval "$(supabase status -o env)"
 *   DATABASE_URL="$DB_URL" pnpm --filter @verso/catalog test
 *
 * Never point it at the hosted project. It writes and deletes rows. Its one
 * game uses an IGDB id far above anything IGDB has issued, and every assertion
 * is scoped to it; deleting its media_items row cascades to the aliases.
 */
const connectionString = process.env.DATABASE_URL;
const live = connectionString ? describe : describe.skip;

const FIXTURE_IGDB_ID = 99_100_001;
const NOW = new Date('2026-09-23T12:00:00.000Z');

function gtaV(names: string[]): IgdbGame {
  return {
    id: FIXTURE_IGDB_ID,
    name: 'Grand Theft Auto V',
    game_type: 0,
    alternative_names: names.map((name) => ({ name })),
  };
}

live('the IGDB aliases against a real database', () => {
  const store = new CatalogStore(connectionString!);

  async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const pool = (store as unknown as { pool: { query: Function } }).pool;
    const result = await pool.query(text, values);
    return result.rows as T[];
  }

  async function aliases(): Promise<Array<{ alias: string; source: string; alias_key: string }>> {
    return query(
      `select a.alias, a.source, a.alias_key
         from public.media_aliases a
         join public.media_items m on m.id = a.media_item_id
        where m.medium = 'game' and m.external_ids->>'igdb' = $1
        order by a.source, a.alias`,
      [String(FIXTURE_IGDB_ID)],
    );
  }

  async function cleanUp(): Promise<void> {
    await query(`delete from public.media_items where medium = 'game' and external_ids->>'igdb' = $1`, [
      String(FIXTURE_IGDB_ID),
    ]);
  }

  beforeAll(async () => {
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await store.end();
  });

  it('writes IGDB names beside the initialisms the trigger derives', async () => {
    const counts = await store.upsert([mapGame(gtaV(['GTA 5', 'GTAV', '俠盜獵車手 5']), NOW)!]);

    expect(counts.aliases).toBe(3);
    expect(await aliases()).toEqual([
      { alias: 'GTA 5', source: 'igdb', alias_key: 'gta5' },
      { alias: 'GTAV', source: 'igdb', alias_key: 'gtav' },
      { alias: '俠盜獵車手 5', source: 'igdb', alias_key: '俠盜獵車手5' },
      { alias: 'GTA 5', source: 'initialism', alias_key: 'gta5' },
      { alias: 'GTA V', source: 'initialism', alias_key: 'gtav' },
    ]);
  });

  it('writes nothing on a re-sync whose names have not moved', async () => {
    const counts = await store.upsert([mapGame(gtaV(['GTA 5', 'GTAV', '俠盜獵車手 5']), NOW)!]);

    expect(counts.aliases).toBe(0);
    expect(await aliases()).toHaveLength(5);
  });

  it('drops the IGDB names IGDB no longer lists, and never an initialism', async () => {
    const counts = await store.upsert([mapGame(gtaV(['GTA Five']), NOW)!]);

    expect(counts.aliases).toBe(1);
    expect(await aliases()).toEqual([
      { alias: 'GTA Five', source: 'igdb', alias_key: 'gtafive' },
      { alias: 'GTA 5', source: 'initialism', alias_key: 'gta5' },
      { alias: 'GTA V', source: 'initialism', alias_key: 'gtav' },
    ]);
  });

  it('clears the IGDB names entirely when IGDB lists none', async () => {
    await store.upsert([mapGame({ id: FIXTURE_IGDB_ID, name: 'Grand Theft Auto V', game_type: 0 }, NOW)!]);

    expect((await aliases()).map((row) => row.source)).toEqual(['initialism', 'initialism']);
  });
});
