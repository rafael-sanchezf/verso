/**
 * "Look right?": the review after a batch session, with nothing on screen
 * (specs/batch-session.md, "The review"; ranking-algorithm.md, "The review").
 *
 * The finished session (`applyBatch`) merged into the tiers' stored order is
 * the whole list, and the review shows only what matters in it: every new row,
 * up to two ranked rows above and two below each as anchors, and the stretches
 * between them collapsed into one "{k} more" row that expands in place. A
 * hundred ranked games must not mean a hundred rows (Rafa, 2026-10-06).
 *
 * The state is the full order per tier plus which ranked rows are drawn, so
 * the drawn list is always derived and can never disagree with what is
 * written. Only the new rows move, and only inside their tier:
 *
 * - a drag reorders a tier's drawn tokens; a collapsed stretch moves as one
 *   block, so a row dragged past it lands past all of it (collapsed rows are
 *   not drag targets: expand first);
 * - the ranked rows keep their order, which is both the Ranking tab's to
 *   change and what `batchFinishArgs` requires;
 * - the row that moved becomes `placedBy: 'user'` and loses its "≈". A drag is
 *   a placement, never a comparison, so nothing enters the log.
 *
 * Scores come from `scoreForPosition` over the merged lists, so every number
 * on screen is the one the Ranking tab will show after Done.
 *
 * No `react-native` import: the unit suite runs in node
 * (`apps/mobile/test/session-review.test.ts`).
 */

import {
  scoreForPosition,
  TIERS,
  type BatchResult,
  type PlacedBy,
  type RankableItem,
  type Tier,
} from '@verso/core';

import type { Sentence } from '../sentence';

import type { TierIds } from './batch-start';

/** Ranked rows drawn either side of each new row (the spec's "up to two"). */
export const ANCHOR_RADIUS = 2;

/**
 * The shortest run of hidden ranked rows that collapses into a "{k} more" row.
 * A shorter run is drawn as its rows: folding one, two or three rows into a
 * row of their own saves at most two lines and hides the games for nothing,
 * and it is what keeps "a user with three ranked games sees all three" true.
 */
export const MIN_COLLAPSE = 4;

export interface ReviewState {
  /** Every tier's full order after the session, best first. */
  readonly order: TierIds;
  /** The games of this session. */
  readonly fresh: ReadonlySet<string>;
  /** Who placed each new game: its answers ('user'), the guess ('prior'), or a drag ('user'). */
  readonly placedBy: Readonly<Record<string, PlacedBy>>;
  /** Ranked rows drawn as rows: the anchors, short runs, and stretches the user expanded. */
  readonly revealed: ReadonlySet<string>;
  /** How many games were ranked before this session. */
  readonly rankedBefore: number;
}

export type ReviewToken =
  | {
      readonly kind: 'row';
      readonly key: string;
      readonly id: string;
      readonly tier: Tier;
      /** Index in the tier's full order. */
      readonly position: number;
      /** Global rank across the tiers, counting from 1. */
      readonly rank: number;
      readonly score: number;
      readonly isNew: boolean;
      /** A new row the guess placed: drawn "≈ {score}" instead of the badge. */
      readonly provisional: boolean;
    }
  | {
      readonly kind: 'stretch';
      readonly key: string;
      readonly tier: Tier;
      /** The hidden rows, in order. */
      readonly ids: readonly string[];
    };

export interface ReviewSection {
  readonly tier: Tier;
  /** Mutable only because the sortable's `data` prop is typed so; nothing here changes it. */
  readonly tokens: ReviewToken[];
}

function anchorsOf(order: readonly string[], fresh: ReadonlySet<string>, radius: number): Set<string> {
  const anchors = new Set<string>();
  order.forEach((id, index) => {
    if (!fresh.has(id)) return;
    for (const step of [-1, 1]) {
      let found = 0;
      for (let i = index + step; i >= 0 && i < order.length && found < radius; i += step) {
        const other = order[i]!;
        if (fresh.has(other)) continue;
        anchors.add(other);
        found++;
      }
    }
  });
  return anchors;
}

/** Runs of consecutive hidden ranked rows in one tier's order. */
function hiddenRuns(order: readonly string[], state: Pick<ReviewState, 'fresh' | 'revealed'>): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const id of order) {
    if (!state.fresh.has(id) && !state.revealed.has(id)) {
      run.push(id);
      continue;
    }
    if (run.length > 0) runs.push(run);
    run = [];
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/**
 * The review of a finished session: `result` from `applyBatch`, `existing` the
 * tiers' stored order the session started from.
 */
export function startReview(result: BatchResult, existing: TierIds, radius = ANCHOR_RADIUS): ReviewState {
  const order = {
    loved: result.tiers.loved.map((item) => item.id),
    liked: result.tiers.liked.map((item) => item.id),
    fine: result.tiers.fine.map((item) => item.id),
    disliked: result.tiers.disliked.map((item) => item.id),
  };
  const fresh = new Set(result.placements.map((p) => p.item.id));
  const placedBy: Record<string, PlacedBy> = {};
  for (const p of result.placements) placedBy[p.item.id] = p.placedBy;

  const revealed = new Set<string>();
  for (const tier of TIERS) {
    for (const id of anchorsOf(order[tier], fresh, radius)) revealed.add(id);
  }
  // Short runs are drawn from the start rather than derived on every render,
  // so a drag that later joins two runs never folds rows the user could see.
  for (const tier of TIERS) {
    for (const run of hiddenRuns(order[tier], { fresh, revealed })) {
      if (run.length < MIN_COLLAPSE) for (const id of run) revealed.add(id);
    }
  }

  const rankedBefore = TIERS.reduce((sum, tier) => sum + existing[tier].length, 0);
  return { order, fresh, placedBy, revealed, rankedBefore };
}

/** The drawn list, one section per tier that has any games, best tier first. */
export function reviewSections(state: ReviewState): ReviewSection[] {
  const sections: ReviewSection[] = [];
  let above = 0;

  for (const tier of TIERS) {
    const order = state.order[tier];
    if (order.length === 0) continue;

    const tokens: ReviewToken[] = [];
    let index = 0;
    while (index < order.length) {
      const id = order[index]!;
      const hidden = !state.fresh.has(id) && !state.revealed.has(id);
      if (hidden) {
        let end = index;
        while (end < order.length && !state.fresh.has(order[end]!) && !state.revealed.has(order[end]!)) end++;
        if (end - index >= MIN_COLLAPSE) {
          const ids = order.slice(index, end);
          tokens.push({ kind: 'stretch', key: `stretch:${ids[0]}`, tier, ids });
          index = end;
          continue;
        }
      }
      const isNew = state.fresh.has(id);
      tokens.push({
        kind: 'row',
        key: id,
        id,
        tier,
        position: index,
        rank: above + index + 1,
        score: scoreForPosition(tier, index, order.length),
        isNew,
        provisional: isNew && state.placedBy[id] === 'prior',
      });
      index++;
    }

    sections.push({ tier, tokens });
    above += order.length;
  }

  return sections;
}

/** A tap on a "{k} more" row: draw those rows. */
export function expandStretch(state: ReviewState, ids: readonly string[]): ReviewState {
  const revealed = new Set(state.revealed);
  for (const id of ids) revealed.add(id);
  return { ...state, revealed };
}

function tierOf(state: ReviewState, id: string): Tier | null {
  for (const tier of TIERS) if (state.order[tier].includes(id)) return tier;
  return null;
}

function rankedOrder(order: readonly string[], fresh: ReadonlySet<string>): string[] {
  return order.filter((id) => !fresh.has(id));
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * A drop inside one tier: `tokens` is that tier's drawn list in the order the
 * drag left it, and `movedKey` the token that was carried.
 *
 * Refused (the state comes back unchanged) when the tokens are not this tier's,
 * when the carried token is not a new row, or when the ranked rows' order would
 * change; none of these can come from the screen, which draws one sortable per
 * tier and gives only new rows a handle.
 */
export function dropInTier(
  state: ReviewState,
  tier: Tier,
  tokens: readonly ReviewToken[],
  movedKey: string,
): ReviewState {
  const next: string[] = [];
  for (const token of tokens) {
    if (token.tier !== tier) return state;
    if (token.kind === 'row') next.push(token.id);
    else next.push(...token.ids);
  }

  const current = state.order[tier];
  if (next.length !== current.length || new Set(next).size !== next.length) return state;
  if (!next.every((id) => current.includes(id))) return state;
  if (!sameList(rankedOrder(next, state.fresh), rankedOrder(current, state.fresh))) return state;

  const moved = tokens.find((token) => token.key === movedKey);
  if (!moved || moved.kind !== 'row' || !state.fresh.has(moved.id)) return state;
  if (sameList(next, current)) return state;

  return {
    ...state,
    order: { ...state.order, [tier]: next },
    placedBy: { ...state.placedBy, [moved.id]: 'user' },
  };
}

/**
 * Move a new row one place up (-1) or down (+1) inside its tier: VoiceOver's
 * way to do what the drag does. A ranked row it passes is drawn from then on,
 * so the row never disappears into a collapsed stretch.
 */
export function moveRow(state: ReviewState, id: string, delta: -1 | 1): ReviewState {
  if (!state.fresh.has(id)) return state;
  const tier = tierOf(state, id);
  if (tier === null) return state;
  const order = state.order[tier].slice();
  const from = order.indexOf(id);
  const to = from + delta;
  if (to < 0 || to >= order.length) return state;

  const passed = order[to]!;
  order[to] = id;
  order[from] = passed;

  const revealed = state.fresh.has(passed) ? state.revealed : new Set([...state.revealed, passed]);
  return {
    ...state,
    order: { ...state.order, [tier]: order },
    placedBy: { ...state.placedBy, [id]: 'user' },
    revealed,
  };
}

/** Whether `moveRow` in that direction would move anything. */
export function canMoveRow(state: ReviewState, id: string, delta: -1 | 1): boolean {
  return moveRow(state, id, delta) !== state;
}

export interface ReviewCounts {
  readonly fresh: number;
  readonly provisional: number;
  /** Ranked games once this session is written. */
  readonly rankedAfter: number;
}

export function reviewCounts(state: ReviewState): ReviewCounts {
  let provisional = 0;
  for (const id of state.fresh) if (state.placedBy[id] === 'prior') provisional++;
  return { fresh: state.fresh.size, provisional, rankedAfter: state.rankedBefore + state.fresh.size };
}

/** The unit of progress (onboarding-guidelines.md, "What onboarding is for"). */
export const TEN_RANKED = 10;

/** Whether this session takes the ranked count to ten for the first time. */
export function crossesTen(rankedBefore: number, rankedAfter: number): boolean {
  return rankedBefore < TEN_RANKED && rankedAfter >= TEN_RANKED;
}

/**
 * The line under "Look right?": "{new} new · {provisional} placed by us · drag
 * to fix", the middle part dropped when nothing is provisional, and "Ten
 * ranked." in `text/primary` instead when this session reaches ten.
 *
 * The parts are sentences the screen says and joins with ` · `; each count
 * picks its one-or-many key, which English spells the same and Spanish does not.
 */
export function metaLine(state: ReviewState): { parts: Sentence[]; emphasis: boolean } {
  const counts = reviewCounts(state);
  if (crossesTen(state.rankedBefore, counts.rankedAfter)) {
    return { parts: [{ key: 'onboarding.review.tenRanked' }], emphasis: true };
  }
  const parts: Sentence[] = [
    {
      key: counts.fresh === 1 ? 'onboarding.review.freshOne' : 'onboarding.review.freshOther',
      vars: { count: counts.fresh },
    },
  ];
  if (counts.provisional > 0) {
    parts.push({
      key: counts.provisional === 1 ? 'onboarding.review.provisionalOne' : 'onboarding.review.provisionalOther',
      vars: { count: counts.provisional },
    });
  }
  parts.push({ key: 'onboarding.review.dragToFix' });
  return { parts, emphasis: false };
}

/**
 * The finished session with the review's changes, for `batchFinishArgs`:
 * every tier's order as the review left it and each new game's `placedBy` as
 * the drags left it. Positions are read from the lists, so a moved game is
 * written where it was dropped.
 */
export function reviewResult(state: ReviewState, base: BatchResult): BatchResult {
  const items = new Map<string, RankableItem>();
  for (const tier of TIERS) for (const item of base.tiers[tier]) items.set(item.id, item);

  const tiers = {} as Record<Tier, RankableItem[]>;
  for (const tier of TIERS) {
    tiers[tier] = state.order[tier].map((id) => items.get(id) ?? { id, genres: [] });
  }
  const placements = base.placements.map((p) => ({
    ...p,
    position: state.order[p.tier].indexOf(p.item.id),
    placedBy: state.placedBy[p.item.id] ?? p.placedBy,
  }));
  return { tiers, placements };
}
