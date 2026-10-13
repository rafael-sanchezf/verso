/**
 * Starting a batch session from a request and the three reads, and the words
 * and the bar the session prints while it runs. The engine itself is tested in
 * packages/core; this is the screen's use of it.
 */

import type { BatchPrediction, TierListRow } from '@verso/api';
import { answerBatch, nextQuestion, remainingEstimate, type ComparisonOutcome, type Tier } from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  beginBatch,
  existingPlace,
  pivotSubtitle,
  progressFill,
  remainingLabel,
  tierIds,
  uniqueById,
  type PlaceableItem,
  type TierRows,
} from '../src/screens/onboarding/session/batch-start';
import { translate } from '../src/lib/i18n/dictionary';
import type { Sentence } from '../src/screens/onboarding/sentence';

/** The sentence a screen would show, in English. */
const say = (sentence: Sentence) => translate('en', sentence.key, sentence.vars);

function row(id: string, genres: string[] = []): TierListRow {
  return {
    media_item_id: id,
    title: id,
    year: 2020,
    cover_image_id: null,
    external_ids: {},
    genres,
    platforms: [],
    played_platforms: [],
    position: 0,
    placed_by: 'user',
  } as TierListRow;
}

function tiers(overrides: Partial<Record<Tier, string[]>> = {}): TierRows {
  return {
    loved: (overrides.loved ?? []).map((id) => row(id)),
    liked: (overrides.liked ?? []).map((id) => row(id)),
    fine: (overrides.fine ?? []).map((id) => row(id)),
    disliked: (overrides.disliked ?? []).map((id) => row(id)),
  };
}

const item = (mediaItemId: string, tier: Tier): PlaceableItem => ({ mediaItemId, tier, genres: [] });

const guess = (mediaItemId: string, predictedScore: number): BatchPrediction => ({
  mediaItemId,
  predictedScore,
  confidence: 'medium',
});

describe('beginBatch', () => {
  it('copies each guess onto its game by id and leaves a game with no row unguessed', () => {
    const started = beginBatch({
      items: [item('x', 'liked'), item('y', 'liked')],
      tiers: tiers({ liked: ['a', 'b'] }),
      predictions: [guess('y', 7.9)],
    })!;
    const byId = new Map(started.state.items.map((i) => [i.item.id, i]));
    expect(byId.get('x')).toMatchObject({ predictedScore: null, confidence: null, tier: 'liked' });
    expect(byId.get('y')).toMatchObject({ predictedScore: 7.9, confidence: 'medium' });
    expect(started.existing.liked).toEqual(['a', 'b']);
    expect(started.firstEstimate).toBeGreaterThan(0);
    expect(started.firstEstimate).toBe(remainingEstimate(started.state));
  });

  it('leaves out a game that is already ranked, and starts nothing when no game is left', () => {
    const started = beginBatch({
      items: [item('a', 'loved'), item('x', 'loved')],
      tiers: tiers({ liked: ['a'] }),
      predictions: null,
    })!;
    expect(started.skipped).toEqual(['a']);
    expect(started.state.items.map((i) => i.item.id)).toEqual(['x']);

    expect(beginBatch({ items: [item('a', 'fine')], tiers: tiers({ fine: ['a'] }), predictions: null })).toBeNull();
    expect(beginBatch({ items: [], tiers: tiers(), predictions: null })).toBeNull();
  });

  it('asks about a game only once when the request names it twice', () => {
    expect(uniqueById([{ mediaItemId: 'a' }, { mediaItemId: 'b' }, { mediaItemId: 'a' }])).toHaveLength(2);
    const started = beginBatch({
      items: [item('x', 'fine'), item('x', 'liked')],
      tiers: tiers(),
      predictions: null,
    })!;
    expect(started.state.items).toHaveLength(1);
    expect(started.state.items[0]!.tier).toBe('fine');
  });

  it('breaks ties by arrival order: the first game seeds an empty tier and the next is compared with it', () => {
    const started = beginBatch({
      items: [item('first', 'loved'), item('second', 'loved'), item('third', 'loved')],
      tiers: tiers(),
      predictions: null,
    })!;
    const q = nextQuestion(started.state)!;
    expect(q.item.id).toBe('second');
    expect(q.pivot.id).toBe('first');
    expect(q.pivotIsNew).toBe(true);
  });

  it('places three seeds in Loved with no predictions in at most three questions', () => {
    const orders: string[][] = [
      ['s1', 's2', 's3'],
      ['s3', 's2', 's1'],
      ['s2', 's1', 's3'],
      ['s1', 's3', 's2'],
    ];
    for (const truth of orders) {
      let state = beginBatch({
        items: [item('s1', 'loved'), item('s2', 'loved'), item('s3', 'loved')],
        tiers: tiers(),
        predictions: null,
      })!.state;
      let asked = 0;
      for (let q = nextQuestion(state); q; q = nextQuestion(state)) {
        asked++;
        const outcome: ComparisonOutcome = truth.indexOf(q.item.id) < truth.indexOf(q.pivot.id) ? 'a' : 'b';
        state = answerBatch(state, outcome);
      }
      expect(asked).toBeLessThanOrEqual(3);
    }
  });
});

describe('existingPlace and the opponent card', () => {
  const existing = tierIds(tiers({ loved: ['a', 'b'], liked: ['c', 'd', 'e'] }));

  it('reads the global rank and the score of a ranked game off the stored order', () => {
    expect(existingPlace(existing, 'a')).toEqual({ tier: 'loved', index: 0, rank: 1, score: 10 });
    expect(existingPlace(existing, 'c')).toEqual({ tier: 'liked', index: 0, rank: 3, score: 8.4 });
    expect(existingPlace(existing, 'zzz')).toBeNull();
  });

  it('says "ranked #N · score" for a ranked opponent and "just played" for one of this batch', () => {
    expect(say(pivotSubtitle({ pivot: { id: 'd', genres: [] }, pivotIsNew: false }, existing))).toBe('ranked #4 · 7.5');
    expect(say(pivotSubtitle({ pivot: { id: 'x', genres: [] }, pivotIsNew: true }, existing))).toBe('just played');
  });
});

describe('the header', () => {
  it('says the count is an estimate', () => {
    expect(say(remainingLabel(6))).toBe('About 6 more to place everything');
  });

  it('fills against the first estimate, never backwards, and full only when nothing is left', () => {
    let rand = 7;
    const next = () => {
      rand = (rand * 1103515245 + 12345) % 2147483648;
      return rand / 2147483648;
    };
    for (let trial = 0; trial < 40; trial++) {
      let state = beginBatch({
        items: Array.from({ length: 8 }, (_, i) => item(`n${i}`, (['loved', 'liked', 'fine'] as const)[i % 3]!)),
        tiers: tiers({ loved: ['a', 'b', 'c'], liked: ['d', 'e'], fine: ['f'] }),
        predictions: Array.from({ length: 8 }, (_, i) => guess(`n${i}`, next() * 10)),
      })!.state;
      const first = remainingEstimate(state);
      let last = progressFill(0, first, first);
      expect(last).toBe(0);
      while (nextQuestion(state)) {
        const r = next();
        state = answerBatch(state, r < 0.45 ? 'a' : r < 0.9 ? 'b' : r < 0.95 ? 'too_close' : 'cant_compare');
        const remaining = nextQuestion(state) ? remainingEstimate(state) : 0;
        const fill = progressFill(state.log.length, remaining, first);
        expect(fill).toBeGreaterThanOrEqual(last);
        if (remaining > 0) expect(fill).toBeLessThan(1);
        last = fill;
      }
      expect(last).toBe(1);
    }
  });
});
