import { describe, expect, it } from 'vitest';
import type { CatalogStore } from '../src/db';
import { OPENCRITIC_ID_CHECKED_KEY, WIKIDATA_IDS_CHECKED_KEY } from '../src/db';
import type { Clock } from '../src/rate-limit';
import type { CrossLinkCandidate, CrossLinkRow } from '../src/types';
import { CROSS_LINK_PROPERTIES, WikidataClient } from '../src/wikidata';
import {
  chunk,
  DEFAULT_ID_LIMIT,
  DEFAULT_RECHECK_DAYS,
  runWikidataIds,
  WikidataIdsAllChunksFailedError,
} from '../src/wikidata-ids';
import results from './fixtures/wikidata-cross-links.json';

class TestClock implements Clock {
  time = 0;
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.time += ms;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/sparql-results+json' },
  });
}

const NOW = new Date('2026-09-16T13:00:00.000Z');

function candidate(igdbId: number, tracked = false): CrossLinkCandidate {
  return {
    media_item_id: `${String(igdbId).padStart(8, '0')}-1111-4111-8111-111111111111`,
    igdb_id: igdbId,
    tracked,
  };
}

/** A store stand-in: a fixed candidate list and a record of everything written. */
function fakeStore(candidates: CrossLinkCandidate[], steam = { filled: 0, disagreed: 0 }) {
  const asked: Array<{ recheckBefore: Date; limit: number }> = [];
  const written: CrossLinkRow[] = [];
  const counted: CrossLinkRow[][] = [];
  const stamps: Array<{ key: string; ids: string[]; at: Date }> = [];

  const store = {
    async crossLinkCandidates(options: { recheckBefore: Date; limit: number }) {
      asked.push(options);
      return candidates.slice(0, options.limit);
    },
    async upsertCrossLinks(rows: CrossLinkRow[]) {
      written.push(...rows);
      return rows.length;
    },
    async countSteamDisagreements(rows: CrossLinkRow[]) {
      counted.push(rows);
      return steam;
    },
    async setCheckedAt(key: string, mediaItemIds: string[], at: Date) {
      stamps.push({ key, ids: mediaItemIds, at });
      return mediaItemIds.length;
    },
  } as unknown as CatalogStore;

  return { store, asked, written, counted, stamps };
}

function client(responses: Array<() => Response>, budget?: number) {
  let index = 0;
  const impl = (async () => {
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next!();
  }) as unknown as typeof fetch;

  return new WikidataClient({ clock: new TestClock(), fetchImpl: impl, budget });
}

const empty = () => json({ results: { bindings: [] } });
const capture = () => json(results);
const silent = () => {};

describe('chunk', () => {
  it('splits into fixed-size pieces with a short last one', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('gives back nothing for nothing', () => {
    expect(chunk([], 500)).toEqual([]);
  });
});

describe('runWikidataIds', () => {
  it('asks Wikidata about a chunk and writes what it gets back', async () => {
    const { store, written, stamps } = fakeStore([candidate(1020, true), candidate(119133)]);
    const result = await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, log: silent },
    );

    expect(result.asked).toBe(2);
    // Seven games in the capture, one of which (999999999) Wikidata knows
    // nothing about and so is not in the answer at all.
    expect(result.matched).toBe(7);
    expect(written).toContainEqual(
      expect.objectContaining({ igdb_id: 119133, metacritic: 'elden-ring', hltb: 68151 }),
    );
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.key).toBe(WIKIDATA_IDS_CHECKED_KEY);
  });

  it('tallies every identifier separately, so a thin column is visible in the log', async () => {
    const { store } = fakeStore([candidate(1020)]);
    const result = await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, log: silent },
    );

    // Counted over the de-duplicated answers, which is what the write acts on.
    expect(result.offered).toEqual({
      opencritic: 6,
      metacritic: 7,
      hltb: 7,
      steam: 5,
      gog: 2,
      epic: 4,
    });
    expect(Object.keys(result.offered).sort()).toEqual(
      CROSS_LINK_PROPERTIES.map((p) => p.key).sort(),
    );
  });

  it('reports a Steam disagreement without writing it', async () => {
    const { store, counted } = fakeStore([candidate(1020)], { filled: 3, disagreed: 2 });
    const result = await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, log: silent },
    );

    expect(result.steamFilled).toBe(3);
    expect(result.steamDisagreed).toBe(2);
    // Counted once per chunk, and the write is what makes the count stale, so
    // the count has to come first.
    expect(counted).toHaveLength(1);
  });

  it('says so in the log, because a disagreement is for reading and not for acting on', async () => {
    const lines: string[] = [];
    const { store } = fakeStore([candidate(1020)], { filled: 1, disagreed: 4 });
    await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, log: (m) => lines.push(m) },
    );

    expect(lines.join('\n')).toContain('4 disagreed with the mirror and were left alone');
    expect(lines.join('\n')).toContain('IGDB stays authoritative');
  });

  it('stamps every game in the chunk, not just the ones Wikidata knew', async () => {
    const { store, stamps, written } = fakeStore([candidate(1020), candidate(999999999)]);
    const result = await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, log: silent },
    );

    // Wikidata really did answer for some of them: without this the test
    // would pass just as well against a mapper that returned nothing, which
    // is the one bug it is here to catch.
    expect(result.matched).toBe(7);
    expect(written.length).toBeGreaterThan(0);

    // The miss is the case the stamp exists for: without a record of the
    // asking every run would re-ask the same tens of thousands of games.
    expect(stamps[0]!.ids).toEqual([
      candidate(1020).media_item_id,
      candidate(999999999).media_item_id,
    ]);
    expect(stamps[0]!.at).toBe(NOW);
  });

  it('stamps one key for the whole pass rather than one per identifier', async () => {
    const { store, stamps } = fakeStore([candidate(1020)]);
    const result = await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, log: silent },
    );

    // Six identifiers came back and they share one stamp. One stamp for no
    // identifiers would prove nothing.
    expect(result.matched).toBe(7);
    expect(Object.values(result.offered).filter((n) => n > 0)).toHaveLength(
      CROSS_LINK_PROPERTIES.length,
    );
    expect(stamps.map((s) => s.key)).toEqual([WIKIDATA_IDS_CHECKED_KEY]);
    expect(WIKIDATA_IDS_CHECKED_KEY).toBe('wikidata_ids_checked_at');
    // The old key is read when selecting candidates and never written again.
    expect(stamps.map((s) => s.key)).not.toContain(OPENCRITIC_ID_CHECKED_KEY);
  });

  it('sends one query per chunk and stamps each chunk as it completes', async () => {
    const { store, stamps } = fakeStore([candidate(1), candidate(2), candidate(3)]);
    const wikidata = client([empty]);

    const result = await runWikidataIds(
      { client: wikidata, store },
      { now: NOW, chunkSize: 2, log: silent },
    );

    expect(result.requests).toBe(2);
    expect(stamps.map((s) => s.ids.length)).toEqual([2, 1]);
    expect(result.matched).toBe(0);
  });

  it('sends one query for every identifier rather than one query each', async () => {
    const { store } = fakeStore([candidate(1), candidate(2)]);
    const result = await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, log: silent },
    );

    // Six identifiers, one round trip, and every one of them actually
    // answered - a run that mapped nothing would also make one request.
    expect(CROSS_LINK_PROPERTIES.length).toBe(6);
    expect(result.requests).toBe(1);
    expect(result.matched).toBe(7);
    for (const property of CROSS_LINK_PROPERTIES) {
      expect(result.offered[property.key]).toBeGreaterThan(0);
    }
  });

  it('stops when the query budget is spent, leaving the rest untouched', async () => {
    const { store, stamps } = fakeStore([]);
    // A store that hands back more rows than the limit asked for. It should
    // not happen, and the run must not overspend if it ever does.
    store.crossLinkCandidates = async () => Array.from({ length: 10 }, (_, i) => candidate(i + 1));

    const result = await runWikidataIds(
      { client: client([empty], 2), store },
      { now: NOW, chunkSize: 1, log: silent },
    );

    expect(result.requests).toBe(2);
    expect(result.asked).toBe(2);
    expect(result.stoppedEarly).toBe(true);
    expect(result.stoppedReason).toBe('budget');
    // The two chunks that finished are committed; the other eight keep their
    // older stamp and come first on the next run.
    expect(stamps).toHaveLength(2);
  });

  it('never offers more games than the budget could pay for', async () => {
    const { store, asked } = fakeStore([candidate(1)]);
    await runWikidataIds(
      { client: client([empty], 3), store },
      { now: NOW, chunkSize: 10, limit: 100_000, log: silent },
    );

    expect(asked[0]!.limit).toBe(30);
  });

  it('ends the run on a 429 rather than earning a ban', async () => {
    const { store } = fakeStore([candidate(1), candidate(2)]);

    const result = await runWikidataIds(
      { client: client([() => json({}, 429)]), store },
      { now: NOW, chunkSize: 1, log: silent },
    );

    expect(result.stoppedEarly).toBe(true);
    expect(result.stoppedReason).toBe('rate-limited');
    expect(result.asked).toBe(0);
  });

  it('drops one bad chunk and carries on with the next', async () => {
    const { store, stamps } = fakeStore([candidate(1), candidate(2)]);

    const result = await runWikidataIds(
      { client: client([() => json({}, 400), capture]), store },
      { now: NOW, chunkSize: 1, log: silent },
    );

    expect(result.failedChunks).toBe(1);
    expect(result.asked).toBe(1);
    expect(result.stoppedEarly).toBe(false);
    // The dropped chunk is not stamped, so it comes first on the next run.
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.ids).toEqual([candidate(2).media_item_id]);
  });

  it('writes nothing at all on a dry run', async () => {
    const { store, written, stamps, counted } = fakeStore([candidate(1020)]);
    const result = await runWikidataIds(
      { client: client([capture]), store },
      { now: NOW, dryRun: true, log: silent },
    );

    expect(written).toEqual([]);
    expect(stamps).toEqual([]);
    expect(counted).toEqual([]);
    expect(result.matched).toBe(7);
    expect(result.idsWritten).toBe(0);
  });

  it('re-asks quarterly, longer than one sweep takes, so the window is what decides', async () => {
    const { store, asked } = fakeStore([candidate(1)]);
    await runWikidataIds({ client: client([empty]), store }, { now: NOW, log: silent });

    // A 30-day window would always be expired by the time a game came round
    // again on a 46-night sweep, leaving the ordering to pace the job.
    expect(DEFAULT_RECHECK_DAYS).toBe(90);
    expect(asked[0]!.recheckBefore.toISOString()).toBe('2026-06-18T13:00:00.000Z');
  });

  it('fails the run when every chunk it attempted failed', async () => {
    const { store, stamps } = fakeStore([candidate(1), candidate(2)]);

    // A 400 to everything - a wrong query, or a property number that moved -
    // would otherwise log two skips, write nothing and leave the workflow
    // green forever.
    await expect(
      runWikidataIds(
        { client: client([() => json({}, 400)]), store },
        { now: NOW, chunkSize: 1, log: silent },
      ),
    ).rejects.toThrow(WikidataIdsAllChunksFailedError);

    expect(stamps).toEqual([]);
  });

  it('still reports the summary before it throws', async () => {
    const lines: string[] = [];
    const { store } = fakeStore([candidate(1)]);

    await runWikidataIds(
      { client: client([() => json({}, 400)]), store },
      { now: NOW, chunkSize: 1, log: (m) => lines.push(m) },
    ).catch(() => {});

    expect(lines.some((line) => line.startsWith('done:'))).toBe(true);
  });

  it('is content with one chunk through: a bad night is not a broken job', async () => {
    const { store } = fakeStore([candidate(1), candidate(2)]);

    const result = await runWikidataIds(
      { client: client([() => json({}, 400), capture]), store },
      { now: NOW, chunkSize: 1, log: silent },
    );

    expect(result.failedChunks).toBe(1);
  });

  it('does not fail a run that had no chunks to attempt', async () => {
    const { store } = fakeStore([]);

    const result = await runWikidataIds(
      { client: client([() => json({}, 400)]), store },
      { now: NOW, log: silent },
    );

    expect(result.selected).toBe(0);
    expect(result.failedChunks).toBe(0);
  });

  it('asks about 1,500 games a night, because every ask rewrites an indexed row', async () => {
    const { store, asked } = fakeStore([candidate(1)]);
    await runWikidataIds({ client: client([empty]), store }, { now: NOW, log: silent });

    // metadata is an indexed column, so a stamp is a non-HOT update that
    // rewrites all seven media_items indexes. 1,500 a night spreads a ~69,000
    // row catalog over about 46 nights instead of rewriting it in four, and
    // collecting six identifiers instead of one does not change that cost.
    expect(DEFAULT_ID_LIMIT).toBe(1500);
    expect(asked[0]!.limit).toBe(1500);
  });

  it('honours an explicit re-check window', async () => {
    const { store, asked } = fakeStore([candidate(1)]);
    await runWikidataIds(
      { client: client([empty]), store },
      { now: NOW, recheckDays: 1, log: silent },
    );

    expect(asked[0]!.recheckBefore.toISOString()).toBe('2026-09-15T13:00:00.000Z');
  });
});
