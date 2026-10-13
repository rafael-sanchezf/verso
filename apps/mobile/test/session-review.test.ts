/**
 * "Look right?": which rows the review draws, what collapses, what a drag and
 * the VoiceOver moves may change, the meta line, and what Done writes.
 */

import {
  applyBatch,
  batchFinishArgs,
  placeRest,
  startBatch,
  TIERS,
  type BatchResult,
  type PlacedBy,
  type Tier,
} from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  canMoveRow,
  crossesTen,
  dropInTier,
  expandStretch,
  metaLine,
  moveRow,
  reviewCounts,
  reviewResult,
  reviewSections,
  startReview,
  type ReviewState,
  type ReviewToken,
} from '../src/screens/onboarding/session/review-model';
import type { TierIds } from '../src/screens/onboarding/session/batch-start';
import { translate } from '../src/lib/i18n/dictionary';

/** The meta line as the screen draws it, in English. */
function meta(state: ReviewState): { text: string; emphasis: boolean } {
  const line = metaLine(state);
  return { text: line.parts.map((part) => translate('en', part.key, part.vars)).join(' · '), emphasis: line.emphasis };
}

/** A finished session as `applyBatch` returns it: the final orders, and the new games with their marks. */
function result(order: Partial<Record<Tier, string[]>>, fresh: Record<string, PlacedBy>): BatchResult {
  const tiers = { loved: [], liked: [], fine: [], disliked: [] } as BatchResult['tiers'];
  const placements: BatchResult['placements'] = [];
  for (const tier of TIERS) {
    (order[tier] ?? []).forEach((id, position) => {
      const item = { id, genres: [] };
      tiers[tier].push(item);
      if (id in fresh) placements.push({ item, tier, position, placedBy: fresh[id]!, log: [] });
    });
  }
  return { tiers, placements };
}

/** The stored order: the final order minus the new games. */
function existingOf(order: Partial<Record<Tier, string[]>>, fresh: Record<string, PlacedBy>): TierIds {
  const out = { loved: [], liked: [], fine: [], disliked: [] } as Record<Tier, string[]>;
  for (const tier of TIERS) out[tier] = (order[tier] ?? []).filter((id) => !(id in fresh));
  return out;
}

function review(order: Partial<Record<Tier, string[]>>, fresh: Record<string, PlacedBy>): ReviewState {
  return startReview(result(order, fresh), existingOf(order, fresh));
}

/** The drawn list as short strings: a row's id (with * when new and ≈ when provisional), "…k" for a stretch. */
function drawn(state: ReviewState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const section of reviewSections(state)) {
    out[section.tier] = section.tokens.map((t) =>
      t.kind === 'stretch' ? `…${t.ids.length}` : `${t.id}${t.isNew ? '*' : ''}${t.provisional ? '≈' : ''}`,
    );
  }
  return out;
}

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('what the review draws', () => {
  it('every new row, two ranked rows either side as anchors, and the stretches between collapsed', () => {
    const liked = [...range('e', 10), 'N', ...range('f', 10)];
    const state = review({ liked }, { N: 'user' });
    expect(drawn(state)).toEqual({ liked: ['…8', 'e8', 'e9', 'N*', 'f0', 'f1', '…8'] });
  });

  it('skips the other new rows when counting anchors', () => {
    const fine = [...range('e', 8), 'N1', 'N2', ...range('f', 8)];
    const state = review({ fine }, { N1: 'user', N2: 'prior' });
    expect(drawn(state)).toEqual({ fine: ['…6', 'e6', 'e7', 'N1*', 'N2*≈', 'f0', 'f1', '…6'] });
  });

  it('never folds fewer than four rows, so a user with three ranked games sees all three', () => {
    expect(drawn(review({ loved: ['a', 'b', 'c'], liked: ['N'] }, { N: 'prior' }))).toEqual({
      loved: ['a', 'b', 'c'],
      liked: ['N*≈'],
    });
    expect(drawn(review({ loved: ['N', 'a', 'b', 'c'] }, { N: 'user' }))).toEqual({ loved: ['N*', 'a', 'b', 'c'] });
  });

  it('folds a tier the session did not touch into one row, and keeps a tier with no games out', () => {
    const state = review({ loved: range('l', 6), fine: ['N'] }, { N: 'user' });
    expect(drawn(state)).toEqual({ loved: ['…6'], fine: ['N*'] });
  });

  it('numbers globally and scores over the merged lists', () => {
    const state = review({ loved: ['a', 'b'], liked: ['c', 'N', 'd'] }, { N: 'prior' });
    const [loved, liked] = reviewSections(state);
    const rows = [...loved!.tokens, ...liked!.tokens].filter((t): t is Extract<ReviewToken, { kind: 'row' }> => t.kind === 'row');
    expect(rows.map((r) => [r.id, r.rank, r.score])).toEqual([
      ['a', 1, 10],
      ['b', 2, 8.5],
      ['c', 3, 8.4],
      ['N', 4, 7.5],
      ['d', 5, 6.5],
    ]);
    expect(rows.find((r) => r.id === 'N')).toMatchObject({ isNew: true, provisional: true });
  });

  it('expands a stretch in place', () => {
    const liked = [...range('e', 10), 'N'];
    const state = review({ liked }, { N: 'user' });
    const stretch = reviewSections(state)[0]!.tokens[0]!;
    expect(stretch.kind).toBe('stretch');
    const open = expandStretch(state, stretch.kind === 'stretch' ? stretch.ids : []);
    expect(drawn(open).liked).toEqual([...liked.slice(0, 10), 'N*']);
  });
});

describe('a drag inside a tier', () => {
  const fresh = { N: 'prior', M: 'prior' } as const;

  function tokensAfterMove(state: ReviewState, key: string, to: number): readonly ReviewToken[] {
    const tokens = reviewSections(state).find((s) => s.tier === 'liked')!.tokens.slice();
    const from = tokens.findIndex((t) => t.key === key);
    const [moved] = tokens.splice(from, 1);
    tokens.splice(to, 0, moved!);
    return tokens;
  }

  it('moves a new row past a collapsed stretch as a whole, where it was dropped, and clears its mark', () => {
    const long = ['a', 'b', 'N', 'c', 'd', ...range('h', 8), 'e', 'f', 'M'];
    const state = review({ liked: long }, fresh);
    expect(drawn(state).liked).toEqual(['a', 'b', 'N*≈', 'c', 'd', '…8', 'e', 'f', 'M*≈']);

    const tokens = tokensAfterMove(state, 'N', 5); // just past the stretch
    const next = dropInTier(state, 'liked', tokens, 'N');
    expect(next.order.liked).toEqual(['a', 'b', 'c', 'd', ...range('h', 8), 'N', 'e', 'f', 'M']);
    expect(next.placedBy).toEqual({ N: 'user', M: 'prior' });
    expect(drawn(next).liked).toEqual(['a', 'b', 'c', 'd', '…8', 'N*', 'e', 'f', 'M*≈']);
    expect(meta(next).text).toBe('2 new · 1 placed by us · drag to fix');
  });

  it('refuses a drop that carries a ranked row, reorders the ranked rows, or names another tier', () => {
    const state = review({ liked: ['a', 'N', 'b'] }, { N: 'prior' });
    const carriedRanked = tokensAfterMove(state, 'a', 2);
    expect(dropInTier(state, 'liked', carriedRanked, 'a')).toBe(state);
    expect(dropInTier(state, 'fine', tokensAfterMove(state, 'N', 0), 'N')).toBe(state);
    expect(dropInTier(state, 'liked', reviewSections(state)[0]!.tokens, 'N')).toBe(state);
  });
});

describe('moving a row without a drag (VoiceOver)', () => {
  it('swaps with its neighbour, draws a hidden row it passes, and stops at the ends', () => {
    const state = review({ disliked: ['N', ...range('h', 8)] }, { N: 'prior' });
    expect(drawn(state).disliked).toEqual(['N*≈', 'h0', 'h1', '…6']);
    expect(canMoveRow(state, 'N', -1)).toBe(false);
    expect(canMoveRow(state, 'h0', 1)).toBe(false);

    let s = moveRow(state, 'N', 1);
    s = moveRow(s, 'N', 1);
    s = moveRow(s, 'N', 1);
    expect(s.order.disliked.slice(0, 4)).toEqual(['h0', 'h1', 'h2', 'N']);
    expect(drawn(s).disliked).toEqual(['h0', 'h1', 'h2', 'N*', '…5']);
    expect(s.placedBy.N).toBe('user');
  });
});

describe('the meta line', () => {
  it('counts the new and the provisional rows', () => {
    expect(meta(review({ liked: ['a', 'N', 'M'] }, { N: 'prior', M: 'user' }))).toEqual({
      text: '2 new · 1 placed by us · drag to fix',
      emphasis: false,
    });
    expect(meta(review({ liked: ['a', 'N'] }, { N: 'user' })).text).toBe('1 new · drag to fix');
  });

  it('says "Ten ranked." when this session takes the count to ten, and only then', () => {
    const seven = range('e', 7);
    const reaching = review({ loved: [...seven, 'x', 'y', 'z'] }, { x: 'user', y: 'user', z: 'prior' });
    expect(reviewCounts(reaching)).toEqual({ fresh: 3, provisional: 1, rankedAfter: 10 });
    expect(meta(reaching)).toEqual({ text: 'Ten ranked.', emphasis: true });

    const past = review({ loved: [...range('e', 10), 'x'] }, { x: 'user' });
    expect(meta(past).emphasis).toBe(false);
    expect(crossesTen(9, 10)).toBe(true);
    expect(crossesTen(10, 12)).toBe(false);
    expect(crossesTen(3, 9)).toBe(false);
  });
});

describe('what Done writes', () => {
  it('writes each new game where the review left it, with the mark the review left it', () => {
    const s0 = startBatch({
      items: [
        { item: { id: 'x', genres: [] }, tier: 'liked', predictedScore: 9, confidence: 'high' },
        { item: { id: 'y', genres: [] }, tier: 'liked', predictedScore: 6, confidence: 'high' },
      ],
      tiers: { liked: [{ id: 'a', genres: [] }, { id: 'b', genres: [] }] },
    });
    const base = applyBatch(placeRest(s0));
    const state = startReview(base, { loved: [], liked: ['a', 'b'], fine: [], disliked: [] });
    expect(drawn(state).liked).toEqual(['x*≈', 'a', 'b', 'y*≈']);

    const moved = moveRow(state, 'y', -1);
    const args = batchFinishArgs(reviewResult(moved, base), { medium: 'game' });
    expect(args.map((a) => [a.mediaItemId, a.tier, a.position, a.placedBy])).toEqual([
      ['x', 'liked', 0, 'prior'],
      ['y', 'liked', 2, 'user'],
    ]);

    // Replaying the writes rebuilds the order on screen.
    const db = ['a', 'b'];
    for (const a of args) db.splice(a.position, 0, a.mediaItemId);
    expect(db).toEqual(moved.order.liked);
  });
});
