import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A `pg` stand-in that records every statement and replays queued results.
 *
 * The statements in db.ts are the interesting part of that file: which conflict
 * target they name, whether they merge jsonb or replace it, what they join on.
 * None of that is visible from a return value, so the tests read the SQL. The
 * semantics behind it (that `||` really does preserve the other keys) were
 * checked separately against a local Postgres.
 */
interface Recorded {
  text: string;
  values: unknown[];
}

const recorded: Recorded[] = [];
let results: Array<{ rows?: unknown[]; rowCount?: number }> = [];
let resultIndex = 0;

const TRANSACTION_CONTROL = ['begin', 'commit', 'rollback'];

function nextResult(text: string): { rows: unknown[]; rowCount: number } {
  // begin/commit take no place in the queue, so the queued results line up
  // with the statements a test actually cares about.
  if (TRANSACTION_CONTROL.includes(text)) return { rows: [], rowCount: 0 };

  const queued = results[resultIndex] ?? {};
  resultIndex += 1;
  return { rows: queued.rows ?? [], rowCount: queued.rowCount ?? queued.rows?.length ?? 0 };
}

vi.mock('pg', () => {
  class FakeClient {
    async query(text: string, values?: unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return nextResult(text);
    }
    release(): void {}
  }
  class FakePool {
    async query(text: string, values?: unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return nextResult(text);
    }
    async connect() {
      return new FakeClient();
    }
    async end(): Promise<void> {}
  }
  return { default: { Pool: FakePool } };
});

const {
  BATCH_SIZE,
  CatalogStore,
  ITAD_POPULAR_LIMIT,
  OPENCRITIC_ID_CHECKED_KEY,
  OPENCRITIC_POPULAR_LIMIT,
  OPENCRITIC_SCORE_CHECKED_KEY,
  STEAM_POPULAR_LIMIT,
  WIKIDATA_IDS_CHECKED_KEY,
  dedupeAvailability,
} = await import('../src/db');
const { mapGame } = await import('../src/map');

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const NOW = new Date('2026-09-16T12:00:00.000Z');

function store() {
  return new CatalogStore(LOCAL);
}

/** The recorded statements, minus the transaction control ones. */
function statements(): Recorded[] {
  return recorded.filter((entry) => !TRANSACTION_CONTROL.includes(entry.text));
}

function find(fragment: string): Recorded {
  const match = statements().find((entry) => entry.text.includes(fragment));
  if (!match) throw new Error(`no statement containing ${fragment}`);
  return match;
}

beforeEach(() => {
  recorded.length = 0;
  results = [];
  resultIndex = 0;
});

describe('the media_items upsert', () => {
  it('merges metadata instead of replacing it, so other phases keep their keys', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }];
    await store().upsert([mapGame({ id: 1, name: 'A', game_type: 0, rating: 80 }, NOW)!]);

    const upsert = find('insert into public.media_items');
    expect(upsert.text).toContain('metadata = public.media_items.metadata || excluded.metadata');
    expect(upsert.text).not.toContain('metadata = excluded.metadata');
  });

  it('still overwrites the keys IGDB owns, because the map always sends all five', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }];
    const mapped = mapGame({ id: 1, name: 'A', game_type: 0 }, NOW)!;

    expect(Object.keys(mapped.mediaItem.metadata).sort()).toEqual([
      'game_type',
      'parent_game',
      'total_rating',
      'total_rating_count',
      'version_parent',
    ]);
    await store().upsert([mapped]);
  });
});

describe('the external_scores upsert', () => {
  it('rides in the same transaction as the game, keyed by the returned uuid', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, { rowCount: 2 }];
    const counts = await store().upsert([
      mapGame(
        { id: 1, name: 'A', game_type: 0, aggregated_rating: 90, rating: 80, rating_count: 5 },
        NOW,
      )!,
    ]);

    const scores = find('insert into public.external_scores');
    const rows = JSON.parse(scores.values[0] as string) as Array<Record<string, unknown>>;

    expect(rows).toEqual([
      { media_item_id: 'uuid-1', source: 'igdb_critics', score: 90, score_count: null },
      { media_item_id: 'uuid-1', source: 'igdb_users', score: 80, score_count: 5 },
    ]);
    expect(counts.externalScores).toBe(2);
    expect(recorded.filter((entry) => entry.text === 'commit')).toHaveLength(1);
  });

  it('upserts on the (media_item_id, source) primary key', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, {}];
    await store().upsert([mapGame({ id: 1, name: 'A', game_type: 0, rating: 80 }, NOW)!]);

    const scores = find('insert into public.external_scores');
    expect(scores.text).toContain('on conflict (media_item_id, source) do update');
    expect(scores.text).toContain('score = excluded.score');
    expect(scores.text).toContain('score_count = excluded.score_count');
    expect(scores.text).toContain('fetched_at = excluded.fetched_at');
  });

  it('stamps fetched_at with now() on every write, changed or not', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, {}];
    await store().upsert([mapGame({ id: 1, name: 'A', game_type: 0, rating: 80 }, NOW)!]);

    expect(find('insert into public.external_scores').text).toContain(
      'select r.media_item_id, r.source, r.score, r.score_count, now()',
    );
  });

  it('writes no statement at all for a game with no ratings', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}];
    await store().upsert([mapGame({ id: 1, name: 'A', game_type: 0 }, NOW)!]);

    expect(statements().some((entry) => entry.text.includes('external_scores'))).toBe(false);
  });

  it('declares score as the numeric(5,2) the column is', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, {}];
    await store().upsert([mapGame({ id: 1, name: 'A', game_type: 0, rating: 80 }, NOW)!]);

    expect(find('insert into public.external_scores').text).toContain('score numeric(5, 2)');
  });

  it('de-duplicates a repeated (item, source) so the statement cannot abort', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertExternalScores([
      { media_item_id: 'uuid-1', source: 'steam', score: 10, score_count: 1 },
      { media_item_id: 'uuid-1', source: 'steam', score: 90, score_count: 2 },
    ]);

    const rows = JSON.parse(find('external_scores').values[0] as string) as unknown[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ score: 90 });
  });
});

describe('the igdb aliases statement', () => {
  const named = () =>
    mapGame(
      {
        id: 1,
        name: 'Grand Theft Auto V',
        game_type: 0,
        alternative_names: [{ name: 'GTA 5' }, { name: 'GTA V' }],
      },
      NOW,
    )!;

  it('rides in the same transaction as the game, keyed by the returned uuid', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, { rowCount: 2 }];
    const counts = await store().upsert([named()]);

    const aliases = find('insert into public.media_aliases');
    expect(JSON.parse(aliases.values[0] as string)).toEqual([
      { media_item_id: 'uuid-1', alias: 'GTA 5' },
      { media_item_id: 'uuid-1', alias: 'GTA V' },
    ]);
    expect(aliases.values[1]).toEqual(['uuid-1']);
    expect(counts.aliases).toBe(2);

    // begin, media_items, game_details, aliases, commit: nothing after the commit.
    const order = recorded.map((entry) => entry.text);
    expect(order.indexOf('commit')).toBeGreaterThan(order.indexOf(aliases.text));
    expect(order.filter((text) => text === 'commit')).toHaveLength(1);
  });

  it('deletes only the igdb rows of this batch that IGDB no longer lists', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, {}];
    await store().upsert([named()]);

    const text = find('insert into public.media_aliases').text;
    expect(text).toContain('delete from public.media_aliases a');
    expect(text).toContain('a.media_item_id = any($2::uuid[])');
    expect(text).toContain("a.source = 'igdb'");
    expect(text).toContain('not exists');
    // Never the initialisms, which the database derives and owns.
    expect(text).not.toContain("'initialism'");
  });

  it('inserts with source igdb and leaves a name already stored alone', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, {}];
    await store().upsert([named()]);

    const text = find('insert into public.media_aliases').text;
    expect(text).toContain("select i.media_item_id, i.alias, 'igdb'");
    expect(text).toContain('on conflict (media_item_id, source, alias) do nothing');
  });

  it('still runs for a game with no names, so the old ones are cleared', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, {}];
    await store().upsert([mapGame({ id: 1, name: 'Hades', game_type: 0 }, NOW)!]);

    const aliases = find('insert into public.media_aliases');
    expect(JSON.parse(aliases.values[0] as string)).toEqual([]);
    expect(aliases.values[1]).toEqual(['uuid-1']);
  });

  it('comes after the scores when there are scores, and counts only its own rows', async () => {
    results = [{ rows: [{ id: 'uuid-1', igdb_id: 1 }] }, {}, { rowCount: 2 }, { rowCount: 1 }];
    const counts = await store().upsert([
      mapGame(
        {
          id: 1,
          name: 'Grand Theft Auto V',
          game_type: 0,
          rating: 90,
          aggregated_rating: 97,
          alternative_names: [{ name: 'GTA 5' }],
        },
        NOW,
      )!,
    ]);

    const texts = statements().map((entry) => entry.text);
    const scoresAt = texts.findIndex((text) => text.includes('insert into public.external_scores'));
    const aliasesAt = texts.findIndex((text) => text.includes('insert into public.media_aliases'));
    expect(aliasesAt).toBeGreaterThan(scoresAt);
    expect(counts).toMatchObject({ externalScores: 2, aliases: 1 });
  });

  it('names only the rows that came back from the media_items upsert', async () => {
    // Two games in, one id back: the other's aliases have nowhere to go.
    results = [{ rows: [{ id: 'uuid-2', igdb_id: 2 }] }, {}, {}];
    await store().upsert([
      named(),
      mapGame({ id: 2, name: 'Hades', game_type: 0, alternative_names: [{ name: 'Hades 1' }] }, NOW)!,
    ]);

    const aliases = find('insert into public.media_aliases');
    expect(JSON.parse(aliases.values[0] as string)).toEqual([
      { media_item_id: 'uuid-2', alias: 'Hades 1' },
    ]);
    expect(aliases.values[1]).toEqual(['uuid-2']);
  });
});

describe('upsertSteamAppIds: the jsonb merge', () => {
  it('merges into external_ids rather than replacing it', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertSteamAppIds([{ igdb_id: 1, steam_app_id: 400 }]);

    const update = find('update public.media_items');
    expect(update.text).toContain(
      "external_ids = m.external_ids || jsonb_build_object('steam', r.steam_app_id)",
    );
  });

  it('never writes the igdb key, so it cannot clobber it', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertSteamAppIds([{ igdb_id: 1, steam_app_id: 400 }]);

    const update = find('update public.media_items');
    const setClause = update.text.slice(update.text.indexOf('set'), update.text.indexOf('from'));
    expect(setClause).toContain("'steam'");
    expect(setClause).not.toContain("'igdb'");
  });

  it('declares the app id as an integer, so it lands as a JSON number', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertSteamAppIds([{ igdb_id: 1, steam_app_id: 400 }]);

    expect(find('update public.media_items').text).toContain('steam_app_id integer');
  });

  it('joins on the text form of the IGDB id, matching media_items_igdb_uniq', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertSteamAppIds([{ igdb_id: 1, steam_app_id: 400 }]);

    const update = find('update public.media_items');
    expect(update.text).toContain("m.external_ids->>'igdb' = r.igdb_id::text");
    expect(update.text).toContain("m.medium = 'game'");
  });

  it('writes nothing when the app id has not changed', async () => {
    results = [{ rowCount: 0 }];
    await store().upsertSteamAppIds([{ igdb_id: 1, steam_app_id: 400 }]);

    expect(find('update public.media_items').text).toContain(
      "m.external_ids->'steam' is distinct from to_jsonb(r.steam_app_id)",
    );
  });

  it('keeps the smallest app id when one IGDB id appears twice in a batch', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertSteamAppIds([
      { igdb_id: 1, steam_app_id: 900 },
      { igdb_id: 1, steam_app_id: 100 },
    ]);

    const rows = JSON.parse(find('update public.media_items').values[0] as string) as Array<{
      steam_app_id: number;
    }>;
    expect(rows).toEqual([{ igdb_id: 1, steam_app_id: 100 }]);
  });

  it('sends no statement for an empty batch', async () => {
    await store().upsertSteamAppIds([]);
    expect(statements()).toHaveLength(0);
  });
});

describe('setMetacriticUrls: the metadata merge', () => {
  it('merges one key into metadata and leaves the rest alone', async () => {
    results = [{ rowCount: 1 }];
    await store().setMetacriticUrls([{ media_item_id: 'uuid-1', url: 'https://mc/x' }]);

    const update = find('metacritic_url');
    expect(update.text).toContain(
      "metadata = m.metadata || jsonb_build_object('metacritic_url', r.url)",
    );
    expect(update.text).toContain("m.metadata->>'metacritic_url' is distinct from r.url");
  });

  it('sends no statement for an empty batch', async () => {
    await store().setMetacriticUrls([]);
    expect(statements()).toHaveLength(0);
  });
});

describe('steamScoreTargets: the selection query', () => {
  const staleBefore = new Date('2026-09-15T16:00:00.000Z');

  async function run(overrides: { limit?: number; popularLimit?: number } = {}) {
    results = [
      {
        rows: [
          { media_item_id: 'uuid-a', steam_app_id: 400, tracked: true },
          { media_item_id: 'uuid-b', steam_app_id: '1245620', tracked: false },
        ],
      },
    ];
    return store().steamScoreTargets({ staleBefore, limit: 100, ...overrides });
  }

  it('only considers games whose external_ids.steam is a number', async () => {
    await run();
    const query = find('steam_games');

    expect(query.text).toContain("jsonb_typeof(m.external_ids->'steam') = 'number'");
    expect(query.text).toContain("m.medium = 'game'");
  });

  it('includes a game any user tracks, through entries or through rankings', async () => {
    await run();
    const query = find('steam_games');

    expect(query.text).toContain('from public.user_entries e where e.media_item_id = g.id');
    expect(query.text).toContain('from public.ranking_entries r where r.media_item_id = g.id');
    expect(query.text).toContain('exists');
  });

  it('asks whether anybody tracks a game, never who', async () => {
    await run();
    const query = find('steam_games').text;

    expect(query).not.toContain('user_id');
    expect(query).not.toContain('auth.uid');
  });

  it('adds the most-rated games on top, ordered deterministically', async () => {
    await run();
    const query = find('steam_games').text;

    expect(query).toContain("nullif(m.metadata->>'total_rating_count', '')::numeric");
    expect(query).toContain('order by g.rating_count desc nulls last, g.id');
  });

  it('skips a game whose steam score is newer than the staleness cutoff', async () => {
    await run();
    const query = find('steam_games');

    expect(query.text).toContain("on s.media_item_id = t.id and s.source = 'steam'");
    expect(query.text).toContain('where s.fetched_at is null or s.fetched_at < $1');
    expect(query.values[0]).toBe(staleBefore.toISOString());
  });

  it('takes tracked games first, then the stalest, so a small budget spends well', async () => {
    await run();

    expect(find('steam_games').text).toContain(
      'order by t.tracked desc,\n                 s.fetched_at asc nulls first',
    );
  });

  it('caps the rows at the run\'s limit and the popular set at its own', async () => {
    const query = (await run({ limit: 7, popularLimit: 11 }), find('steam_games'));

    expect(query.text).toContain('limit $2');
    expect(query.text).toContain('limit $3');
    expect(query.values[1]).toBe(11);
    expect(query.values[2]).toBe(7);
  });

  it('defaults the popular set to the top 300', async () => {
    await run();

    expect(STEAM_POPULAR_LIMIT).toBe(300);
    expect(find('steam_games').values[1]).toBe(STEAM_POPULAR_LIMIT);
  });

  it('hands back app ids as numbers, whichever way pg typed them', async () => {
    const targets = await run();

    expect(targets).toEqual([
      { media_item_id: 'uuid-a', steam_app_id: 400, tracked: true },
      { media_item_id: 'uuid-b', steam_app_id: 1245620, tracked: false },
    ]);
  });
});

describe('upsertCrossLinks: the jsonb merge', () => {
  const links = [{ igdb_id: 1, metacritic: 'elden-ring', hltb: 68151, steam: 1245620 }];

  it('merges into external_ids rather than replacing it', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertCrossLinks(links);

    expect(find('update public.media_items').text).toContain(
      'external_ids = r.links || m.external_ids',
    );
  });

  it('puts the stored row on the right of the merge, so an existing key always wins', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertCrossLinks(links);

    // `a || b` lets b's keys win. `r.links || m.external_ids` therefore adds
    // keys and can never remove or overwrite one, which is the whole policy:
    // igdb stays, a hand correction stays, and IGDB's steam app id stays.
    const update = find('update public.media_items').text;
    expect(update).toContain('external_ids = r.links || m.external_ids');
    expect(update).not.toContain('external_ids = m.external_ids || r.links');
  });

  it('sends one jsonb object per game rather than a column per identifier', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertCrossLinks(links);

    const update = find('update public.media_items');
    expect(update.text).toContain('igdb_id integer');
    expect(update.text).toContain('links jsonb');
    expect(JSON.parse(update.values[0] as string)).toEqual([
      { igdb_id: 1, links: { metacritic: 'elden-ring', hltb: 68151, steam: 1245620 } },
    ]);
  });

  it('keeps integer identifiers as JSON numbers and slugs as JSON strings', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertCrossLinks(links);

    const [row] = JSON.parse(find('update public.media_items').values[0] as string) as Array<{
      links: Record<string, unknown>;
    }>;
    expect(typeof row!.links['hltb']).toBe('number');
    expect(typeof row!.links['metacritic']).toBe('string');
  });

  it('joins on the text form of the IGDB id, matching media_items_igdb_uniq', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertCrossLinks(links);

    const update = find('update public.media_items');
    expect(update.text).toContain("m.external_ids->>'igdb' = r.igdb_id::text");
    expect(update.text).toContain("m.medium = 'game'");
  });

  it('never names igdb in what it merges, so the row cannot be orphaned', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertCrossLinks(links);

    const [row] = JSON.parse(find('update public.media_items').values[0] as string) as Array<{
      links: Record<string, unknown>;
    }>;
    expect(Object.keys(row!.links)).not.toContain('igdb');
  });

  it('writes nothing when the merge would change nothing', async () => {
    results = [{ rowCount: 0 }];
    await store().upsertCrossLinks(links);

    expect(find('update public.media_items').text).toContain(
      '(r.links || m.external_ids) is distinct from m.external_ids',
    );
  });

  it('collapses a game that came back on several rows before it writes', async () => {
    results = [{ rowCount: 1 }];
    await store().upsertCrossLinks([
      { igdb_id: 1, opencritic: 900, metacritic: 'redout-2016' },
      { igdb_id: 1, opencritic: 100, epic: 'redout-enhanced-edition' },
    ]);

    expect(JSON.parse(find('update public.media_items').values[0] as string)).toEqual([
      {
        igdb_id: 1,
        links: { opencritic: 100, metacritic: 'redout-2016', epic: 'redout-enhanced-edition' },
      },
    ]);
  });

  it('sends no statement for an empty batch, or for a game with no valid identifier', async () => {
    await store().upsertCrossLinks([]);
    await store().upsertCrossLinks([{ igdb_id: 1 }]);
    expect(statements()).toHaveLength(0);
  });

  it('splits at BATCH_SIZE rather than sending one statement of any size', async () => {
    // A catch-up run with a raised --limit can hand this thousands of games at
    // once; one statement that large is a parameter the server has to
    // materialise whole.
    const many = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => ({
      igdb_id: i + 1,
      hltb: i + 1,
    }));
    results = [{ rowCount: BATCH_SIZE }, { rowCount: 1 }];

    const written = await store().upsertCrossLinks(many);

    const sent = statements().filter((entry) => entry.text.includes('update public.media_items'));
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0]!.values[0] as string)).toHaveLength(BATCH_SIZE);
    expect(JSON.parse(sent[1]!.values[0] as string)).toHaveLength(1);
    // And the counts of both statements are added up, not just the last one's.
    expect(written).toBe(BATCH_SIZE + 1);
  });

  it('splits the disagreement count the same way, so the two agree game for game', async () => {
    const many = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => ({
      igdb_id: i + 1,
      steam: i + 1,
    }));
    results = [
      { rows: [{ filled: '2', disagreed: '1' }] },
      { rows: [{ filled: '3', disagreed: '4' }] },
    ];

    expect(await store().countSteamDisagreements(many)).toEqual({ filled: 5, disagreed: 5 });
    expect(statements()).toHaveLength(2);
  });
});

describe('countSteamDisagreements: the read before the write', () => {
  it('counts the games with no steam key, which are the ones the merge fills', async () => {
    results = [{ rows: [{ filled: '3', disagreed: '1' }] }];
    const counts = await store().countSteamDisagreements([{ igdb_id: 1, steam: 620 }]);

    const query = find('count(*) filter').text;
    expect(query).toContain("count(*) filter (where m.external_ids->'steam' is null)");
    expect(counts.filled).toBe(3);
  });

  it('counts a disagreement without writing one', async () => {
    results = [{ rows: [{ filled: '0', disagreed: '2' }] }];
    const counts = await store().countSteamDisagreements([{ igdb_id: 1, steam: 620 }]);

    const query = find('count(*) filter').text;
    expect(query).toContain("m.external_ids->'steam' is not null");
    expect(query).toContain("m.external_ids->'steam' is distinct from r.links->'steam'");
    // A select, not an update: IGDB's value stays.
    expect(query.trimStart().startsWith('select')).toBe(true);
    expect(counts.disagreed).toBe(2);
  });

  it('looks only at the games Wikidata offered a steam id for', async () => {
    results = [{ rows: [{ filled: '0', disagreed: '0' }] }];
    await store().countSteamDisagreements([{ igdb_id: 1, steam: 620 }]);

    expect(find('count(*) filter').text).toContain("where r.links ? 'steam'");
  });

  it('sends no statement for an empty batch', async () => {
    expect(await store().countSteamDisagreements([])).toEqual({ filled: 0, disagreed: 0 });
    expect(statements()).toHaveLength(0);
  });
});

describe('setCheckedAt: the metadata merge', () => {
  it('merges one key into metadata and leaves every other key alone', async () => {
    results = [{ rowCount: 2 }];
    await store().setCheckedAt(WIKIDATA_IDS_CHECKED_KEY, ['uuid-1', 'uuid-2'], NOW);

    const update = find('update public.media_items');
    expect(update.text).toContain('metadata = m.metadata || jsonb_build_object($2::text, $3::text)');
    expect(update.values[1]).toBe('wikidata_ids_checked_at');
    expect(update.values[2]).toBe(NOW.toISOString());
    expect(update.values[0]).toEqual(['uuid-1', 'uuid-2']);
  });

  it("takes the scores pass's key too, with the same statement", async () => {
    results = [{ rowCount: 1 }];
    await store().setCheckedAt(OPENCRITIC_SCORE_CHECKED_KEY, ['uuid-1'], NOW);

    expect(find('update public.media_items').values[1]).toBe('opencritic_score_checked_at');
  });

  it('has no is-distinct-from guard: the stamp has to move on every ask', async () => {
    results = [{ rowCount: 1 }];
    await store().setCheckedAt(OPENCRITIC_SCORE_CHECKED_KEY, ['uuid-1'], NOW);

    expect(find('update public.media_items').text).not.toContain('is distinct from');
  });

  it('sends no statement for an empty batch', async () => {
    await store().setCheckedAt(WIKIDATA_IDS_CHECKED_KEY, [], NOW);
    expect(statements()).toHaveLength(0);
  });
});

describe('crossLinkCandidates: the selection query', () => {
  const recheckBefore = new Date('2026-06-18T13:00:00.000Z');

  async function run(overrides: { limit?: number } = {}) {
    results = [
      {
        rows: [
          { media_item_id: 'uuid-a', igdb_id: 1020, tracked: true },
          { media_item_id: 'uuid-b', igdb_id: '119133', tracked: false },
        ],
      },
    ];
    return store().crossLinkCandidates({ recheckBefore, limit: 20_000, ...overrides });
  }

  it('offers every game that has an IGDB id', async () => {
    await run();
    const query = find('igdb_games').text;

    expect(query).toContain("jsonb_typeof(m.external_ids->'igdb') = 'number'");
    expect(query).toContain("m.medium = 'game'");
  });

  it('no longer skips a game that already has an opencritic key', async () => {
    await run();

    // PR #27's version excluded those, because OpenCritic was the only
    // identifier it collected. A game can hold an OpenCritic id and still be
    // missing the HowLongToBeat id its page wants.
    expect(find('igdb_games').text).not.toContain("m.external_ids->'opencritic' is null");
  });

  it('skips a game asked about since the re-check cutoff', async () => {
    await run();
    const query = find('igdb_games');

    expect(query.text).toContain("m.metadata->>'wikidata_ids_checked_at'");
    expect(query.text).toContain('where g.checked_at is null or g.checked_at < $1');
    expect(query.values[0]).toBe(recheckBefore.toISOString());
  });

  it("reads PR #27's key as a fallback, so the rename re-fetches nothing", async () => {
    await run();
    const query = find('igdb_games').text;

    // A row that pass stamped has been asked about through the same query
    // shape, so it must not come round again tonight just because the key was
    // renamed. Only the new key is ever written, so the old one ages out.
    expect(query).toContain(
      `coalesce(\n                  m.metadata->>'${WIKIDATA_IDS_CHECKED_KEY}',\n` +
        `                  m.metadata->>'${OPENCRITIC_ID_CHECKED_KEY}'\n                )::timestamptz`,
    );
  });

  it('includes a game any user tracks, through entries or through rankings', async () => {
    await run();
    const query = find('igdb_games').text;

    expect(query).toContain('from public.user_entries e where e.media_item_id = c.id');
    expect(query).toContain('from public.ranking_entries r where r.media_item_id = c.id');
  });

  it("puts the exists clauses in a CTE's where, never in the outer select list", async () => {
    await run();
    const query = find('igdb_games').text;

    // An `exists` in a target list is a correlated subplan re-run per candidate
    // row before the limit applies; in a `where` clause the planner can pull it
    // up into a semi-join. Neither user table has an index leading with
    // media_item_id, so the difference is a scan of both per candidate.
    const selectList = query.slice(query.lastIndexOf('select c.id as media_item_id'));
    expect(selectList).not.toContain('exists');
    expect(selectList).toContain('(c.id in (select id from tracked)) as tracked');

    const trackedCte = query.slice(query.indexOf('tracked as ('), query.lastIndexOf('select c.id'));
    expect(trackedCte).toContain('where exists');
  });

  it('narrows to the stale candidates before asking who tracks them', async () => {
    await run();
    const query = find('igdb_games').text;

    // The tracked CTE reads `candidates`, not the whole catalog, so the user
    // tables are probed once per eligible game rather than once per game.
    expect(query).toContain('candidates as (');
    expect(query).toContain('from candidates c\n          where exists');
  });

  it('asks whether anybody tracks a game, never who', async () => {
    await run();
    const query = find('igdb_games').text;

    expect(query).not.toContain('user_id');
    expect(query).not.toContain('auth.uid');
  });

  it('takes tracked games first, then the never-asked, then the most-rated', async () => {
    await run();

    expect(find('igdb_games').text).toContain(
      'order by tracked desc,\n                 c.checked_at asc nulls first,\n' +
        '                 c.rating_count desc nulls last,\n                 c.id',
    );
  });

  it("caps the rows at the run's limit", async () => {
    await run({ limit: 9 });
    const query = find('igdb_games');

    expect(query.text).toContain('limit $2');
    expect(query.values[1]).toBe(9);
  });

  it('hands back IGDB ids as numbers, whichever way pg typed them', async () => {
    expect(await run()).toEqual([
      { media_item_id: 'uuid-a', igdb_id: 1020, tracked: true },
      { media_item_id: 'uuid-b', igdb_id: 119133, tracked: false },
    ]);
  });
});

describe('openCriticScoreTargets: the selection query', () => {
  const staleBefore = new Date('2026-09-09T13:00:00.000Z');

  async function run(overrides: { limit?: number; popularLimit?: number } = {}) {
    results = [
      {
        rows: [
          { media_item_id: 'uuid-a', opencritic_id: 163, tracked: true },
          { media_item_id: 'uuid-b', opencritic_id: '12090', tracked: false },
        ],
      },
    ];
    return store().openCriticScoreTargets({ staleBefore, limit: 150, ...overrides });
  }

  it('only considers games whose external_ids.opencritic is a number', async () => {
    await run();
    const query = find('opencritic_games').text;

    expect(query).toContain("jsonb_typeof(m.external_ids->'opencritic') = 'number'");
    expect(query).toContain("m.medium = 'game'");
  });

  it('reads staleness from metadata, not from external_scores.fetched_at', async () => {
    await run();
    const query = find('opencritic_games');

    // The three answers that must suppress a re-ask are a score, a game with
    // no Top Critic reviews, and a 404; only the first writes a score row.
    expect(query.text).toContain("(m.metadata->>'opencritic_score_checked_at')::timestamptz");
    expect(query.text).toContain('g.checked_at is null or g.checked_at < $1');
    expect(query.text).not.toContain('external_scores');
    expect(query.values[0]).toBe(staleBefore.toISOString());
  });

  it('includes a game any user tracks, through entries or through rankings', async () => {
    await run();
    const query = find('opencritic_games').text;

    expect(query).toContain('from public.user_entries e where e.media_item_id = g.id');
    expect(query).toContain('from public.ranking_entries r where r.media_item_id = g.id');
  });

  it('asks whether anybody tracks a game, never who', async () => {
    await run();
    const query = find('opencritic_games').text;

    expect(query).not.toContain('user_id');
    expect(query).not.toContain('auth.uid');
  });

  it('adds the most-rated games on top, ordered deterministically', async () => {
    await run();
    const query = find('opencritic_games').text;

    expect(query).toContain("nullif(m.metadata->>'total_rating_count', '')::numeric");
    expect(query).toContain('order by g.rating_count desc nulls last, g.id');
  });

  it('takes tracked games first, then the stalest, so a small budget spends well', async () => {
    await run();

    expect(find('opencritic_games').text).toContain(
      'order by tracked desc,\n                 g.checked_at asc nulls first',
    );
  });

  it('caps the rows at the budget and the popular set at its own limit', async () => {
    await run({ limit: 7, popularLimit: 11 });
    const query = find('opencritic_games');

    expect(query.text).toContain('limit $2');
    expect(query.text).toContain('limit $3');
    expect(query.values[1]).toBe(11);
    expect(query.values[2]).toBe(7);
  });

  it('defaults the popular set to the top 300, as the Steam pass does', async () => {
    await run();

    expect(OPENCRITIC_POPULAR_LIMIT).toBe(300);
    expect(find('opencritic_games').values[1]).toBe(OPENCRITIC_POPULAR_LIMIT);
  });

  it('hands back OpenCritic ids as numbers, whichever way pg typed them', async () => {
    expect(await run()).toEqual([
      { media_item_id: 'uuid-a', opencritic_id: 163, tracked: true },
      { media_item_id: 'uuid-b', opencritic_id: 12090, tracked: false },
    ]);
  });
});
// Where to play ---------------------------------------------------------------
// The availability statements, pinned the same way as the ones above: what they
// conflict on, what they refuse to overwrite, and what separates "seen tonight"
// from "gone".

const SEEN_AT = new Date('2026-09-17T04:00:00.000Z');

describe('the game_availability upsert', () => {
  const rows = [
    {
      media_item_id: 'uuid-1',
      service: 'game_pass_console',
      region: 'US',
      source_ref: '9NPDN9R45JX4',
    },
  ];

  it('conflicts on the triple the primary key states', async () => {
    await store().upsertAvailability(rows, SEEN_AT);

    expect(find('insert into public.game_availability').text).toContain(
      'on conflict (media_item_id, service, region) do update',
    );
  });

  it('never rewrites first_seen_at, so "since when" survives a game coming back', async () => {
    await store().upsertAvailability(rows, SEEN_AT);
    const upsert = find('insert into public.game_availability').text;

    const update = upsert.slice(upsert.indexOf('do update'));
    expect(update).not.toContain('first_seen_at');
    expect(update).toContain('last_seen_at = excluded.last_seen_at');
    expect(update).toContain('removed_at = null');
    expect(update).toContain('source_ref = excluded.source_ref');
  });

  it('sets both timestamps from the run’s single instant, passed as a parameter', async () => {
    await store().upsertAvailability(rows, SEEN_AT);
    const upsert = find('insert into public.game_availability');

    expect(upsert.text).toContain('$2::timestamptz, $2::timestamptz, null');
    expect(upsert.text).not.toContain('now()');
    expect(upsert.values[1]).toBe('2026-09-17T04:00:00.000Z');
  });

  it('expands the batch with jsonb_to_recordset, one statement per 500 rows', async () => {
    const many = Array.from({ length: 1200 }, (_, n) => ({
      media_item_id: `uuid-${n}`,
      service: 'geforce_now',
      region: 'US',
      source_ref: String(n),
    }));

    await store().upsertAvailability(many, SEEN_AT);

    const inserts = statements().filter((entry) =>
      entry.text.includes('insert into public.game_availability'),
    );
    expect(inserts).toHaveLength(3);
    expect(inserts[0]!.text).toContain('jsonb_to_recordset($1::jsonb)');
    expect(JSON.parse(inserts[0]!.values[0] as string)).toHaveLength(500);
    expect(JSON.parse(inserts[2]!.values[0] as string)).toHaveLength(200);
  });

  it('de-duplicates, because one statement cannot touch one row twice', () => {
    const deduped = dedupeAvailability([
      { media_item_id: 'uuid-1', service: 'ea_play', region: 'US', source_ref: 'first' },
      { media_item_id: 'uuid-1', service: 'ea_play', region: 'US', source_ref: 'second' },
      { media_item_id: 'uuid-1', service: 'ea_play', region: 'GB', source_ref: 'other market' },
    ]);

    expect(deduped).toEqual([
      { media_item_id: 'uuid-1', service: 'ea_play', region: 'US', source_ref: 'second' },
      { media_item_id: 'uuid-1', service: 'ea_play', region: 'GB', source_ref: 'other market' },
    ]);
  });

  it('sends no statement at all for an empty batch', async () => {
    await store().upsertAvailability([], SEEN_AT);

    expect(statements()).toHaveLength(0);
  });
});

describe('the close-out', () => {
  it('updates rather than deletes, so a game that left keeps its row', async () => {
    await store().closeMissingAvailability('ea_play', 'US', SEEN_AT);
    const close = find('update public.game_availability');

    expect(close.text).toContain('set removed_at = $3::timestamptz');
    expect(close.text).not.toContain('delete');
  });

  it('separates seen from gone by the run’s own instant, never by now()', async () => {
    await store().closeMissingAvailability('ea_play', 'US', SEEN_AT);
    const close = find('update public.game_availability');

    expect(close.text).toContain('last_seen_at < $3::timestamptz');
    expect(close.text).not.toContain('now()');
    expect(close.values).toEqual(['ea_play', 'US', '2026-09-17T04:00:00.000Z']);
  });

  it('leaves an already-closed row at the date it actually left', async () => {
    await store().closeMissingAvailability('ea_play', 'US', SEEN_AT);

    expect(find('update public.game_availability').text).toContain('removed_at is null');
  });

  it('is scoped to one service in one region', async () => {
    await store().closeMissingAvailability('geforce_now', 'US', SEEN_AT);
    const close = find('update public.game_availability');

    expect(close.text).toContain('where service = $1');
    expect(close.text).toContain('and region = $2');
  });
});

describe('the IsThereAnyDeal close-out', () => {
  it('matches the itad: namespace by prefix and nothing else', async () => {
    await store().closeMissingAvailabilityForItems('itad:%', 'US', SEEN_AT, ['uuid-1']);
    const close = find('update public.game_availability');

    expect(close.text).toContain('where service like $1');
    expect(close.values[0]).toBe('itad:%');
  });

  it('closes only the games the run actually asked about', async () => {
    await store().closeMissingAvailabilityForItems('itad:%', 'US', SEEN_AT, ['uuid-1', 'uuid-2']);
    const close = find('update public.game_availability');

    expect(close.text).toContain('and media_item_id = any($4::uuid[])');
    expect(close.values[3]).toEqual(['uuid-1', 'uuid-2']);
  });

  it('sends nothing when the run asked about nothing', async () => {
    expect(await store().closeMissingAvailabilityForItems('itad:%', 'US', SEEN_AT, [])).toBe(0);
    expect(statements()).toHaveLength(0);
  });
});

describe('the catalog reads the match needs', () => {
  it('asks for every mirrored game’s title, and only games', async () => {
    results = [{ rows: [{ media_item_id: 'uuid-1', title: 'Hades' }] }];
    const titles = await store().gameTitles();

    const query = find('select m.id as media_item_id, m.title');
    expect(query.text).toContain("where m.medium = 'game'");
    expect(titles).toEqual([{ media_item_id: 'uuid-1', title: 'Hades' }]);
  });

  it('joins Steam app ids on the text form, the way the mirror stores them', async () => {
    results = [{ rows: [{ media_item_id: 'uuid-1', key: '620' }] }];
    await store().gamesBySteamAppId([620, 812140]);

    const query = find("m.external_ids->>'steam' as key");
    expect(query.text).toContain("jsonb_typeof(m.external_ids->'steam') = 'number'");
    expect(query.text).toContain("m.external_ids->>'steam' = any($1::text[])");
    expect(query.values[0]).toEqual(['620', '812140']);
  });

  it('asks nothing when there are no app ids to ask about', async () => {
    expect(await store().gamesBySteamAppId([])).toEqual([]);
    expect(statements()).toHaveLength(0);
  });
});

describe('the IsThereAnyDeal selection', () => {
  async function run(limit = 100) {
    results = [
      {
        rows: [
          { media_item_id: 'uuid-a', steam_app_id: '400', tracked: true },
          { media_item_id: 'uuid-b', steam_app_id: 1245620, tracked: false },
        ],
      },
    ];
    return store().itadTargets({ limit });
  }

  it('reads whether anybody tracks a game, never who', async () => {
    await run();
    const query = find('with steam_games as').text;

    expect(query).toContain('exists (select 1 from public.user_entries e');
    expect(query).toContain('exists (select 1 from public.ranking_entries r');
    expect(query).not.toContain('user_id');
  });

  it('puts tracked games first and caps the whole thing', async () => {
    await run(77);
    const query = find('with steam_games as');

    expect(query.text).toContain('order by (g.id in (select id from tracked)) desc');
    expect(query.text).toContain('limit $2');
    expect(query.values[1]).toBe(77);
  });

  it('casts the rating count to numeric, as every other selection does', async () => {
    await run();

    // IGDB documents total_rating_count as a double; an ::int cast on it is the
    // bug PR #26 corrected in popular_games.
    expect(find('with steam_games as').text).toContain(
      "nullif(m.metadata->>'total_rating_count', '')::numeric",
    );
  });

  it('defaults the popularity window to the package’s own constant', async () => {
    await run();

    expect(ITAD_POPULAR_LIMIT).toBe(1000);
    expect(find('with steam_games as').values[0]).toBe(ITAD_POPULAR_LIMIT);
  });

  it('hands back app ids as numbers, whichever way pg typed them', async () => {
    expect(await run()).toEqual([
      { media_item_id: 'uuid-a', steam_app_id: 400, tracked: true },
      { media_item_id: 'uuid-b', steam_app_id: 1245620, tracked: false },
    ]);
  });
});
