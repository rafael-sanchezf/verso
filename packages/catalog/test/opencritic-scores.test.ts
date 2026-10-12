import { describe, expect, it } from 'vitest';
import type { CatalogStore } from '../src/db';
import { OPENCRITIC_SCORE_CHECKED_KEY } from '../src/db';
import { OpenCriticClient } from '../src/opencritic';
import {
  OPENCRITIC_DEFAULT_STALE_HOURS,
  OPENCRITIC_REQUESTS_PER_GAME,
  runOpenCriticScores,
} from '../src/opencritic-scores';
import type { Clock } from '../src/rate-limit';
import type { ExternalScoreRow, OpenCriticScoreTarget } from '../src/types';
import game from './fixtures/opencritic-game.json';
import unscored from './fixtures/opencritic-game-unscored.json';
import fractional from './fixtures/opencritic-game-fractional-recommended.json';

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
    headers: { 'content-type': 'application/json' },
  });
}

const NOW = new Date('2026-09-16T13:00:00.000Z');

function target(n: number, tracked = false): OpenCriticScoreTarget {
  return {
    media_item_id: `0000000${n}-1111-4111-8111-111111111111`,
    opencritic_id: 1000 + n,
    tracked,
  };
}

/** A store stand-in: a fixed target list and a record of everything written. */
function fakeStore(targets: OpenCriticScoreTarget[]) {
  const asked: Array<{ staleBefore: Date; limit: number; popularLimit?: number }> = [];
  const scores: ExternalScoreRow[] = [];
  const stamps: Array<{ key: string; ids: string[]; at: Date }> = [];

  const store = {
    async openCriticScoreTargets(options: {
      staleBefore: Date;
      limit: number;
      popularLimit?: number;
    }) {
      asked.push(options);
      return targets.slice(0, options.limit);
    },
    async upsertExternalScores(rows: ExternalScoreRow[]) {
      scores.push(...rows);
      return rows.length;
    },
    async setCheckedAt(key: string, ids: string[], at: Date) {
      stamps.push({ key, ids, at });
      return ids.length;
    },
  } as unknown as CatalogStore;

  return { store, asked, scores, stamps };
}

function client(responses: Array<() => Response>, budget?: number) {
  let index = 0;
  const impl = (async () => {
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next!();
  }) as unknown as typeof fetch;

  return new OpenCriticClient({
    apiKey: 'test-key',
    clock: new TestClock(),
    fetchImpl: impl,
    budget,
  });
}

const silent = () => {};

describe('runOpenCriticScores', () => {
  it('writes both rows for a reviewed game and stamps that it asked', async () => {
    const { store, scores, stamps } = fakeStore([target(1, true)]);
    const result = await runOpenCriticScores(
      { client: client([() => json(game)]), store },
      { now: NOW, log: silent },
    );

    expect(scores.map((row) => row.source)).toEqual(['opencritic', 'opencritic_recommended']);
    expect(result.topCriticScores).toBe(1);
    expect(result.recommendedScores).toBe(1);
    expect(result.scoresUpserted).toBe(2);
    expect(stamps).toEqual([
      { key: OPENCRITIC_SCORE_CHECKED_KEY, ids: [target(1).media_item_id], at: NOW },
    ]);
  });

  it('stamps an unscored game without writing a hollow score row', async () => {
    const { store, scores, stamps } = fakeStore([target(1)]);
    const result = await runOpenCriticScores(
      { client: client([() => json(unscored)]), store },
      { now: NOW, log: silent },
    );

    expect(scores).toEqual([]);
    expect(result.unscored).toBe(1);
    expect(result.fetched).toBe(1);
    // The stamp is the whole point: without it this game costs a request every
    // single night for a score OpenCritic does not have.
    expect(stamps).toHaveLength(1);
  });

  it('records a 404 and carries on with the rest of the run', async () => {
    const { store, scores, stamps } = fakeStore([target(1), target(2)]);
    const result = await runOpenCriticScores(
      {
        client: client([() => json({ message: 'not found' }, 404), () => json(game)]),
        store,
      },
      { now: NOW, log: silent },
    );

    expect(result.notFound).toBe(1);
    expect(result.stoppedEarly).toBe(false);
    expect(scores).toHaveLength(2);
    // Both games stamped: the missing one so the wrong Wikidata id is not
    // re-asked tomorrow, the good one because it was fetched.
    expect(stamps.map((s) => s.ids[0])).toEqual([
      target(1).media_item_id,
      target(2).media_item_id,
    ]);
  });

  it('stops the run on a 429 rather than spending the day\'s allowance on refusals', async () => {
    const { store, scores } = fakeStore([target(1), target(2), target(3)]);
    const result = await runOpenCriticScores(
      { client: client([() => json(game), () => json({}, 429)]), store },
      { now: NOW, log: silent },
    );

    expect(result.stoppedEarly).toBe(true);
    expect(result.stoppedReason).toBe('rate-limited');
    expect(result.fetched).toBe(1);
    // The first game's rows are already committed: there is nothing to undo.
    expect(scores).toHaveLength(2);
  });

  it('asks for no more games than the budget can pay for', async () => {
    const { store, asked } = fakeStore(Array.from({ length: 50 }, (_, i) => target(i)));
    const result = await runOpenCriticScores(
      { client: client([() => json(game)], 2), store },
      { now: NOW, budget: 2, log: silent },
    );

    // At one request a game the limit is the budget itself, so the list and
    // the budget run out together and the run finishes normally.
    expect(asked[0]!.limit).toBe(2);
    expect(result.fetched).toBe(2);
    expect(result.requests).toBe(2);
    expect(result.stoppedEarly).toBe(false);
  });

  it('stops cleanly when the list is longer than the budget can pay for', async () => {
    const { store, scores } = fakeStore([]);
    // A store that hands back more rows than the limit asked for. It should
    // not happen, and the run must not overspend if it ever does.
    store.openCriticScoreTargets = async () =>
      Array.from({ length: 10 }, (_, i) => target(i));

    const result = await runOpenCriticScores(
      { client: client([() => json(game)], 3), store },
      { now: NOW, log: silent },
    );

    expect(result.fetched).toBe(3);
    expect(result.requests).toBe(3);
    expect(result.stoppedEarly).toBe(true);
    expect(result.stoppedReason).toBe('budget');
    // Everything fetched before the stop is already committed; tomorrow's run
    // picks up from the stamps rather than from a cursor.
    expect(scores).toHaveLength(6);
  });

  it('never asks for a bigger budget than the client will honour', async () => {
    const { store, asked } = fakeStore([target(1)]);
    await runOpenCriticScores(
      { client: client([() => json(game)], 5), store },
      { now: NOW, budget: 5000, log: silent },
    );

    expect(asked[0]!.limit).toBe(5);
  });

  it('counts one request per game, because the search endpoint is never used', () => {
    expect(OPENCRITIC_REQUESTS_PER_GAME).toBe(1);
  });

  it('passes a week-old staleness cutoff by default', async () => {
    const { store, asked } = fakeStore([target(1)]);
    await runOpenCriticScores(
      { client: client([() => json(game)]), store },
      { now: NOW, log: silent },
    );

    expect(OPENCRITIC_DEFAULT_STALE_HOURS).toBe(168);
    expect(asked[0]!.staleBefore.toISOString()).toBe('2026-09-09T13:00:00.000Z');
  });

  it('honours an explicit staleness window for a launch week', async () => {
    const { store, asked } = fakeStore([target(1)]);
    await runOpenCriticScores(
      { client: client([() => json(game)]), store },
      { now: NOW, staleHours: 6, log: silent },
    );

    expect(asked[0]!.staleBefore.toISOString()).toBe('2026-09-16T07:00:00.000Z');
  });

  it('writes nothing at all on a dry run, stamps included', async () => {
    const { store, scores, stamps } = fakeStore([target(1)]);
    const result = await runOpenCriticScores(
      { client: client([() => json(game)]), store },
      { now: NOW, dryRun: true, log: silent },
    );

    expect(scores).toEqual([]);
    expect(stamps).toEqual([]);
    expect(result.fetched).toBe(1);
    expect(result.topCriticScores).toBe(1);
    expect(result.scoresUpserted).toBe(0);
  });

  it('skips one game on an unexpected failure without ending the run', async () => {
    const { store } = fakeStore([target(1), target(2)]);
    const result = await runOpenCriticScores(
      {
        client: client([() => new Response('<html>', { status: 200 }), () => json(game)]),
        store,
      },
      { now: NOW, log: silent },
    );

    expect(result.failed).toBe(1);
    expect(result.fetched).toBe(1);
    expect(result.stoppedEarly).toBe(false);
  });

  it('withholds the recommended row when its scale looks fractional, and warns once', async () => {
    const lines: string[] = [];
    const { store, scores } = fakeStore([target(1), target(2)]);

    const result = await runOpenCriticScores(
      { client: client([() => json(fractional)]), store },
      { now: NOW, log: (m) => lines.push(m) },
    );

    // The average is still written; only the ambiguous percentage is withheld.
    expect(scores.map((row) => row.source)).toEqual(['opencritic', 'opencritic']);
    expect(result.recommendedScaleSkipped).toBe(2);
    expect(result.recommendedScores).toBe(0);
    // Not "unscored": OpenCritic had reviews, we just could not read the units.
    expect(result.unscored).toBe(0);

    const warnings = lines.filter((line) => line.startsWith('warning:'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2 of 2 games');
  });

  it('says nothing about scale when every figure reads as a percentage', async () => {
    const lines: string[] = [];
    const { store } = fakeStore([target(1)]);

    const result = await runOpenCriticScores(
      { client: client([() => json(game)]), store },
      { now: NOW, log: (m) => lines.push(m) },
    );

    expect(result.recommendedScaleSkipped).toBe(0);
    expect(lines.some((line) => line.startsWith('warning:'))).toBe(false);
  });

  it('reports the tracked split in its log line, so a small budget is auditable', async () => {
    const lines: string[] = [];
    const { store } = fakeStore([target(1, true), target(2)]);
    await runOpenCriticScores(
      { client: client([() => json(game)]), store },
      { now: NOW, log: (m) => lines.push(m) },
    );

    expect(lines[0]).toContain('1 tracked by a user, 1 popular');
  });
});
