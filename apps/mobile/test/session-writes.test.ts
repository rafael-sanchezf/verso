/**
 * The review's writes: one `finishInsertion` per game in write order, a
 * failure holding back the rest of its tier only, a retry running only what is
 * not written, and "already ranked" read as a write that landed.
 */

import type { BatchFinishArgs, Tier } from '@verso/core';
import { describe, expect, it } from 'vitest';

import { isAlreadyRanked, runWrites } from '../src/screens/onboarding/session/writes';

const call = (mediaItemId: string, tier: Tier, position: number): BatchFinishArgs => ({
  mediaItemId,
  medium: 'game',
  tier,
  position,
  placedBy: 'user',
  comparisons: [],
});

const args = [call('l1', 'loved', 0), call('l2', 'loved', 2), call('k1', 'liked', 1), call('f1', 'fine', 0)];

describe('runWrites', () => {
  it('writes every game once, in the order given', async () => {
    const seen: string[] = [];
    const outcome = await runWrites(args, new Set(), async (a) => {
      seen.push(a.mediaItemId);
    });
    expect(seen).toEqual(['l1', 'l2', 'k1', 'f1']);
    expect([...outcome.written]).toEqual(['l1', 'l2', 'k1', 'f1']);
    expect(outcome.pending).toEqual([]);
    expect(outcome.error).toBeNull();
  });

  it('holds back the rest of a tier after a failure, goes on with the other tiers, and retries only the rest', async () => {
    const boom = new Error('offline');
    const seen: string[] = [];
    const first = await runWrites(args, new Set(), async (a) => {
      seen.push(a.mediaItemId);
      if (a.mediaItemId === 'l1') throw boom;
    });
    expect(seen).toEqual(['l1', 'k1', 'f1']);
    expect(first.pending).toEqual(['l1', 'l2']);
    expect(first.error).toBe(boom);

    const retried: string[] = [];
    const second = await runWrites(args, first.written, async (a) => {
      retried.push(a.mediaItemId);
    });
    expect(retried).toEqual(['l1', 'l2']);
    expect(second.pending).toEqual([]);
    expect(second.written.size).toBe(4);
  });

  it('counts "already ranked" as written: the call had landed before its answer was lost', async () => {
    expect(isAlreadyRanked({ code: '23505' })).toBe(true);
    expect(isAlreadyRanked({ code: '22023' })).toBe(false);
    expect(isAlreadyRanked(null)).toBe(false);

    const outcome = await runWrites(args, new Set(), async (a) => {
      if (a.mediaItemId === 'l1') throw { code: '23505', message: 'already ranked' };
    });
    expect(outcome.pending).toEqual([]);
    expect(outcome.written.has('l1')).toBe(true);
    expect(outcome.error).toBeNull();
  });
});
