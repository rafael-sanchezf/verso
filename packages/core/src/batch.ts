/**
 * The batch session (docs/design/ranking-algorithm.md, "The batch session" and
 * "Estimate first, then ask", 2026-10-06): many played games, each with a tier,
 * placed into their tiers in one run of questions instead of one insertion
 * after another.
 *
 * Exports:
 *  - `startBatch(input, options)`: the session state. `input.items` are the new
 *    games, each `{ item, tier, predictedScore, confidence }` (the engine's
 *    guess on the user's own 0 to 10 scale from `recommendation_scores`, either
 *    may be null); `input.tiers` is each tier's existing order, best first,
 *    whose scores are read with `scoreForPosition`; `input.tieBreak` is item
 *    ids, most popular first, for the items the guess cannot order. Options are
 *    the engine's `InsertionOptions`.
 *  - `nextQuestion(state)`: the comparison to ask, or null once every game is
 *    placed. The question carries an `InsertionState` for its game, so
 *    `comparisonPrompt` and `genreCue` from prompt.ts work on it unchanged.
 *  - `answerBatch(state, outcome)`: apply one answer, with the same outcomes and
 *    the same escape hatches as `answer` (it calls `answer`): "too close" places
 *    the game directly below the game it was compared with; "can't compare"
 *    swaps the opponent, and two in a row place the game at the middle of its
 *    current range.
 *  - `placeRest(state)`: "Place the rest for me". Every game still unresolved
 *    goes to its predicted slot inside what its answers allow and is marked
 *    `placedBy: 'prior'`; no answer is invented and none is dropped.
 *  - `remainingEstimate(state)`: "about N more to place everything".
 *  - `applyBatch(state)`: per tier, the final order; per new game, its
 *    `{ position, placedBy, log }`, in the order the writes must happen.
 *  - `batchFinishArgs(result, ids)`: the `finish_insertion` arguments, one per
 *    game with its `placedBy`, in write order.
 *
 * How the questions are chosen:
 *  - Comparisons happen only inside a tier; the tier tap already answered every
 *    question across tiers.
 *  - Each tier keeps a settled order (its existing games plus every new game
 *    already placed), and each unresolved game a bracket on it: the games it is
 *    known to sit below and above. A game whose bracket holds no settled game
 *    is placed. The first new game of an empty tier is placed with no question,
 *    as Option A places the first game of a tier.
 *  - A game with a guess starts from its predicted slot (the gap whose
 *    neighbours' scores bracket the predicted score; a guess above the tier's
 *    band points at its top, one below at its bottom) and is compared with its
 *    predicted neighbours, the one nearer in score first. While the answers
 *    agree it never widens. On the first disagreement it searches outward from
 *    there by doubling steps (1, 3, 7, ... places beyond the game it was wrong
 *    about), then binary search inside the bracket that found (an exponential
 *    search, Bai and Coester, "Sorting with Predictions", NeurIPS 2023).
 *  - A game with no guess uses plain binary insertion through `choosePivot`,
 *    exactly the questions `startInsertion` would ask.
 *  - Where more than one opponent is eligible (the two predicted neighbours,
 *    or binary search's window) the genre-preferring rule of `choosePivot`
 *    applies.
 *  - The next question is the one whose answer the guess is least sure of: a
 *    game with no guess, or whose guess an answer already contradicted, first
 *    (a coin flip); then the pairs whose scores are closest, relative to the
 *    guess's confidence. Ties go to the tier with the most new games, then to
 *    the tie-break order, then to the order the games were given.
 *
 * A right guess between two settled games costs two questions, one per
 * neighbour; at either end of its bracket it costs one. One question cannot
 * confirm both sides of a gap, and confirming one side only would let a user
 * who answers every question perfectly still end up with a game out of place.
 * So a game is `placedBy: 'user'` exactly when its answers fix its place;
 * stopping after one question per game leaves the other sides to the guess,
 * marked `prior`, which is the stop rule's job.
 *
 * `remainingEstimate` sums, per unresolved game, a binary search over its
 * bracket (log2 of the bracket plus half the other unresolved games that share
 * it) or, with a live guess and when it is cheaper, the guess's open sides plus
 * the chance the guess is wrong times that search. The expectation can rise
 * after a surprising answer; the header must not, so the number shown is never
 * more than the one shown before it, and it reads at least 1 while a question
 * remains.
 *
 * Every answer is stored in the state's log exactly as `InsertionState`
 * records it (`tierSize` is the settled order's length when asked), and each
 * game keeps its own records, so `finish_insertion` gets one call per game with
 * its own log. Pure: no network, no storage, no clock.
 */

import type { FinishInsertionArgs, InsertionIds } from './finish-insertion';
import type { ComparisonOutcome, ComparisonRecord, PivotReason, Tier } from './model';
import { TIERS, TIER_BANDS } from './model';
import {
  DEFAULT_INSERTION_OPTIONS,
  answer,
  choosePivot,
  scoreForPosition,
  sharedGenre,
  sharesGenre,
  type InsertionOptions,
  type InsertionState,
  type RankableItem,
} from './ranking';

/** The confidence `recommendation_scores` reports with a predicted score. */
export type PredictionConfidence = 'high' | 'medium' | 'needs_more_data';

/** Who decided a game's place: the user's answers, or the guess when the user stopped. */
export type PlacedBy = 'user' | 'prior';

/** One new game in the batch. */
export interface BatchItem {
  item: RankableItem;
  tier: Tier;
  /** The engine's guess on the user's 0 to 10 scale, or null when there is none. */
  predictedScore: number | null;
  confidence: PredictionConfidence | null;
}

export interface BatchInput {
  items: readonly BatchItem[];
  /** Each tier's existing order, best first. A missing tier is empty. */
  tiers?: Partial<Record<Tier, readonly RankableItem[]>>;
  /** Item ids, most popular first. Orders games the guess cannot tell apart. */
  tieBreak?: readonly string[];
}

/** Where one new game stands. Internal to the state; read it through the functions. */
export interface BatchProgress {
  readonly placed: boolean;
  readonly placedBy: PlacedBy | null;
  /** Placed with no question because its tier had nothing to compare against. */
  readonly free: boolean;
  /** Id of the settled game it is known to sit below, or null for the top of the tier. */
  readonly above: string | null;
  /** Id of the settled game it is known to sit above, or null for the bottom. */
  readonly below: string | null;
  /** True while no answer has contradicted the guess. False for a game with no guess. */
  readonly guess: boolean;
  /** The outward search after the guess was contradicted. */
  readonly walk: { readonly dir: 'up' | 'down'; readonly step: number } | null;
  readonly declined: readonly string[];
  readonly consecutiveCantCompare: number;
  readonly records: readonly ComparisonRecord[];
}

export interface BatchState {
  readonly items: readonly BatchItem[];
  /** Parallel to `items`. */
  readonly progress: readonly BatchProgress[];
  /** The existing order per tier, as given. */
  readonly existing: Readonly<Record<Tier, readonly RankableItem[]>>;
  /** The settled order per tier: existing games and the new games already placed. */
  readonly chains: Readonly<Record<Tier, readonly RankableItem[]>>;
  /** Tiers by how many new games they hold, most first. */
  readonly tierOrder: readonly Tier[];
  readonly tieBreak: readonly string[];
  /** Every answer, in the order given. */
  readonly log: readonly ComparisonRecord[];
  /** The question on screen: its game's index into `items` and that game's insertion state. */
  readonly current: { readonly itemIndex: number; readonly insertion: InsertionState } | null;
  readonly options: InsertionOptions;
  /** The last number the header showed; the next one never exceeds it. */
  readonly estimateCeiling: number;
}

export interface BatchQuestion {
  tier: Tier;
  /** The new game being placed. */
  item: RankableItem;
  /** The game it is compared with. */
  pivot: RankableItem;
  pivotReason: PivotReason;
  /** True when the opponent is another game of this batch, not one ranked before. */
  pivotIsNew: boolean;
  /** The new game's insertion state with this pivot, for prompt.ts. */
  insertion: InsertionState;
}

export interface BatchPlacement {
  item: RankableItem;
  tier: Tier;
  /** Index in the tier's final order, 0 being best. */
  position: number;
  placedBy: PlacedBy;
  /** This game's own answers, in order. */
  log: readonly ComparisonRecord[];
}

export interface BatchResult {
  /** Every tier's final order, best first. */
  tiers: Record<Tier, RankableItem[]>;
  /** One per new game, in write order: tier by tier, best position first. */
  placements: BatchPlacement[];
}

export type BatchFinishArgs = FinishInsertionArgs & { placedBy: PlacedBy };

/**
 * How far a guess is expected to be off, in score points, by confidence. Sets
 * how sure the guess is about a pair. Provisional; tune with the harness.
 */
const SPREAD: Readonly<Record<PredictionConfidence, number>> = {
  high: 0.5,
  medium: 1,
  needs_more_data: 2,
};

/** Chance a guess misses its slot, by confidence, for the estimate only. Provisional. */
const MISS: Readonly<Record<PredictionConfidence, number>> = {
  high: 0.25,
  medium: 0.5,
  needs_more_data: 0.75,
};

/** A coin flip: the priority of a question no guess has an opinion on. */
const COIN = 0.5;

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

interface TierView {
  tier: Tier;
  chain: readonly RankableItem[];
  /** One score per settled game, never increasing down the order. */
  anchors: readonly number[];
  index: ReadonlyMap<string, number>;
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high);
}

/** The predicted score, or null when there is none (or it is not a number). */
function guessScore(entry: BatchItem): number | null {
  return entry.predictedScore !== null && Number.isFinite(entry.predictedScore)
    ? entry.predictedScore
    : null;
}

function itemIndexById(state: BatchState): Map<string, number> {
  return new Map(state.items.map((entry, i) => [entry.item.id, i]));
}

/**
 * Scores for the settled order, which is what a guess is read against.
 * Existing games keep the score their position gave them at the start, so the
 * guess is read on the user's own scale; a guess above the tier's band points
 * at its top, one below at its bottom. A placed new game takes its predicted
 * score, held between the existing scores around it and never above the game
 * placed over it; one with no guess is spaced evenly between its neighbours.
 */
function anchorsFor(state: BatchState, tier: Tier, byId: ReadonlyMap<string, number>): number[] {
  const chain = state.chains[tier];
  const existing = state.existing[tier];
  const [low, high] = TIER_BANDS[tier];
  const existingAt = new Map(existing.map((it, i) => [it.id, i]));
  const out: (number | null)[] = chain.map((it) => {
    const i = existingAt.get(it.id);
    return i === undefined ? null : scoreForPosition(tier, i, existing.length);
  });

  let k = 0;
  while (k < chain.length) {
    if (existingAt.has(chain[k]!.id)) {
      k++;
      continue;
    }
    let end = k;
    while (end < chain.length && !existingAt.has(chain[end]!.id)) end++;
    // Open-ended at the top and bottom of the tier, so a game predicted above
    // the band keeps its score against another one predicted above it.
    const upper = k > 0 ? out[k - 1]! : Number.POSITIVE_INFINITY;
    const lower = end < chain.length ? out[end]! : Number.NEGATIVE_INFINITY;

    const run: (number | null)[] = [];
    let ceiling = upper;
    for (let j = k; j < end; j++) {
      const entry = state.items[byId.get(chain[j]!.id)!]!;
      const p = guessScore(entry);
      if (p === null) {
        run.push(null);
        continue;
      }
      const v = clamp(p, lower, ceiling);
      run.push(v);
      ceiling = v;
    }
    for (let j = 0; j < run.length; j++) {
      if (run[j] !== null) continue;
      let s = j;
      while (s < run.length && run[s] === null) s++;
      const above = j > 0 ? run[j - 1]! : upper;
      const below = s < run.length ? run[s]! : lower;
      const top = Number.isFinite(above) ? above : Math.max(high, Number.isFinite(below) ? below : high);
      const bottom = Number.isFinite(below) ? below : Math.min(low, top);
      const n = s - j;
      for (let t = 0; t < n; t++) run[j + t] = top - ((top - bottom) * (t + 1)) / (n + 1);
      j = s - 1;
    }
    run.forEach((v, t) => {
      out[k + t] = v;
    });
    k = end;
  }
  return out as number[];
}

function viewFor(state: BatchState, tier: Tier, byId: ReadonlyMap<string, number>): TierView {
  const chain = state.chains[tier];
  return {
    tier,
    chain,
    anchors: anchorsFor(state, tier, byId),
    index: new Map(chain.map((it, i) => [it.id, i])),
  };
}

function bracket(view: TierView, p: BatchProgress): { lo: number; hi: number } {
  const lo = p.above === null ? 0 : view.index.get(p.above)! + 1;
  const hi = p.below === null ? view.chain.length : view.index.get(p.below)!;
  return { lo, hi };
}

/** The gap the guess points at, inside the bracket. Null without a guess. */
function predictedSlot(view: TierView, entry: BatchItem, lo: number, hi: number): number | null {
  const p = guessScore(entry);
  if (p === null) return null;
  let g = view.anchors.findIndex((a) => a < p);
  if (g === -1) g = view.anchors.length;
  return clamp(g, lo, hi);
}

function reasonFor(item: RankableItem, pivot: RankableItem, options: InsertionOptions): PivotReason {
  const genre = sharedGenre(item, pivot, options.ignoredGenres);
  return genre === null ? { kind: 'midpoint' } : { kind: 'genre', genre };
}

/** The game's insertion state on the current settled order, with or without a pivot. */
function insertionFor(
  state: BatchState,
  itemIndex: number,
  view: TierView,
  pivotIndex: number | null,
): InsertionState {
  const entry = state.items[itemIndex]!;
  const p = state.progress[itemIndex]!;
  const { lo, hi } = bracket(view, p);
  const pivot = pivotIndex === null ? undefined : view.chain[pivotIndex];
  return {
    tier: entry.tier,
    item: entry.item,
    list: view.chain,
    lo,
    hi,
    pivotIndex: pivot ? pivotIndex : null,
    pivotReason: pivot ? reasonFor(entry.item, pivot, state.options) : null,
    declined: p.declined.map((id) => view.index.get(id)).filter((i): i is number => i !== undefined),
    consecutiveCantCompare: p.consecutiveCantCompare,
    records: p.records,
    done: false,
    insertAt: null,
    options: state.options,
  };
}

function genrePreferenceOn(item: RankableItem, chain: readonly RankableItem[], options: InsertionOptions): boolean {
  if (options.genreWindow <= 0) return false;
  let peers = 0;
  for (const other of chain) if (sharesGenre(item, other, options.ignoredGenres)) peers++;
  return peers >= options.minGenrePeers;
}

/** The opponent this game would be asked about next, or null when its bracket is empty. */
function pickPivot(state: BatchState, itemIndex: number, view: TierView): number | null {
  const entry = state.items[itemIndex]!;
  const p = state.progress[itemIndex]!;
  const base = insertionFor(state, itemIndex, view, null);
  const { lo, hi, declined } = base;
  if (lo >= hi) return null;
  const eligible = (i: number) => i >= lo && i <= hi - 1 && !declined.includes(i);

  if (p.guess) {
    const g = predictedSlot(view, entry, lo, hi);
    if (g !== null) {
      const sides = [g - 1, g].filter(eligible);
      if (sides.length === 2) {
        const [above, below] = sides as [number, number];
        if (genrePreferenceOn(entry.item, view.chain, state.options)) {
          const peers = sides.filter((i) => sharesGenre(entry.item, view.chain[i]!, state.options.ignoredGenres));
          if (peers.length === 1) return peers[0]!;
        }
        const score = guessScore(entry)!;
        const dAbove = Math.abs(view.anchors[above]! - score);
        const dBelow = Math.abs(view.anchors[below]! - score);
        return dBelow < dAbove ? below : above;
      }
      if (sides.length === 1) return sides[0]!;
    }
  } else if (p.walk) {
    const target = p.walk.dir === 'down' ? lo + p.walk.step - 1 : hi - p.walk.step;
    if (eligible(target)) return target;
  }
  return choosePivot(base);
}

/** How likely the guess is to get this pair wrong: 0.5 when there is no live guess. */
function priority(state: BatchState, itemIndex: number, view: TierView, pivotIndex: number): number {
  const entry = state.items[itemIndex]!;
  const p = state.progress[itemIndex]!;
  const score = guessScore(entry);
  if (!p.guess || score === null) return COIN;
  const gap = Math.abs(view.anchors[pivotIndex]! - score);
  const spread = SPREAD[entry.confidence ?? 'needs_more_data'];
  return 1 / (1 + Math.exp((1.7 * gap) / spread));
}

function tieRank(state: BatchState): (id: string) => number {
  const rank = new Map(state.tieBreak.map((id, i) => [id, i]));
  return (id) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
}

function pendingIn(state: BatchState, tier: Tier): number[] {
  const out: number[] = [];
  state.items.forEach((entry, i) => {
    if (entry.tier === tier && !state.progress[i]!.placed) out.push(i);
  });
  return out;
}

/** Games the guess and then the tie-break order put first. */
function guessOrder(state: BatchState): (a: number, b: number) => number {
  const rank = tieRank(state);
  return (a, b) => {
    const sa = guessScore(state.items[a]!);
    const sb = guessScore(state.items[b]!);
    if (sa !== sb) {
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sb - sa;
    }
    return rank(state.items[a]!.item.id) - rank(state.items[b]!.item.id) || a - b;
  };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function withProgress(state: BatchState, itemIndex: number, next: BatchProgress): BatchState {
  const progress = state.progress.slice();
  progress[itemIndex] = next;
  return { ...state, progress };
}

function settle(state: BatchState, itemIndex: number, at: number, records: readonly ComparisonRecord[]): BatchState {
  const entry = state.items[itemIndex]!;
  const chain = state.chains[entry.tier].slice();
  chain.splice(at, 0, entry.item);
  const p = state.progress[itemIndex]!;
  const next = withProgress(state, itemIndex, {
    ...p,
    placed: true,
    placedBy: 'user',
    free: records.length === 0,
    records,
    walk: null,
    declined: [],
    consecutiveCantCompare: 0,
  });
  return { ...next, chains: { ...next.chains, [entry.tier]: chain } };
}

/** Place every game whose bracket holds no settled game, one at a time. */
function settleEmptyBrackets(state: BatchState): BatchState {
  const byId = itemIndexById(state);
  let s = state;
  for (;;) {
    const ready: { index: number; at: number }[] = [];
    for (const tier of TIERS) {
      const pending = pendingIn(s, tier);
      if (pending.length === 0) continue;
      const view = viewFor(s, tier, byId);
      for (const i of pending) {
        const { lo, hi } = bracket(view, s.progress[i]!);
        if (lo === hi) ready.push({ index: i, at: lo });
      }
    }
    if (ready.length === 0) return s;
    const order = guessOrder(s);
    ready.sort((a, b) => order(a.index, b.index));
    const first = ready[0]!;
    s = settle(s, first.index, first.at, s.progress[first.index]!.records);
  }
}

function selectQuestion(state: BatchState): BatchState['current'] {
  const byId = itemIndexById(state);
  const rank = tieRank(state);
  let best: { index: number; view: TierView; pivot: number; value: number } | null = null;
  for (const tier of state.tierOrder) {
    const pending = pendingIn(state, tier)
      .slice()
      .sort((a, b) => rank(state.items[a]!.item.id) - rank(state.items[b]!.item.id) || a - b);
    if (pending.length === 0) continue;
    const view = viewFor(state, tier, byId);
    for (const i of pending) {
      const pivot = pickPivot(state, i, view);
      if (pivot === null) continue;
      const value = priority(state, i, view, pivot);
      if (best === null || value > best.value) best = { index: i, view, pivot, value };
    }
  }
  if (best === null) return null;
  return { itemIndex: best.index, insertion: insertionFor(state, best.index, best.view, best.pivot) };
}

function emptyTiers(): Record<Tier, readonly RankableItem[]> {
  return { loved: [], liked: [], fine: [], disliked: [] };
}

/** Build the session. Throws when an id appears twice or a new game is already ranked. */
export function startBatch(input: BatchInput, options: Partial<InsertionOptions> = {}): BatchState {
  const existing = emptyTiers();
  for (const tier of TIERS) existing[tier] = [...(input.tiers?.[tier] ?? [])];

  const seen = new Set<string>();
  const claim = (id: string) => {
    if (seen.has(id)) throw new Error(`duplicate item in batch: ${id}`);
    seen.add(id);
  };
  for (const tier of TIERS) for (const it of existing[tier]) claim(it.id);
  for (const entry of input.items) claim(entry.item.id);

  const newCount = (tier: Tier) => input.items.filter((e) => e.tier === tier).length;
  const tierOrder = TIERS.slice().sort(
    (a, b) =>
      newCount(b) - newCount(a) ||
      existing[b].length - existing[a].length ||
      TIERS.indexOf(a) - TIERS.indexOf(b),
  );

  const state: BatchState = {
    items: input.items.slice(),
    progress: input.items.map((entry) => ({
      placed: false,
      placedBy: null,
      free: false,
      above: null,
      below: null,
      guess: guessScore(entry) !== null,
      walk: null,
      declined: [],
      consecutiveCantCompare: 0,
      records: [],
    })),
    existing,
    chains: { ...existing },
    tierOrder,
    tieBreak: input.tieBreak?.slice() ?? [],
    log: [],
    current: null,
    options: { ...DEFAULT_INSERTION_OPTIONS, ...options },
    estimateCeiling: Number.MAX_SAFE_INTEGER,
  };
  const settled = settleEmptyBrackets(state);
  return { ...settled, current: selectQuestion(settled) };
}

/** The comparison to ask now, or null when every game is placed. */
export function nextQuestion(state: BatchState): BatchQuestion | null {
  const current = state.current;
  if (current === null) return null;
  const { insertion } = current;
  const pivot = insertion.list[insertion.pivotIndex!]!;
  const isNew = state.items.some((entry) => entry.item.id === pivot.id);
  return {
    tier: insertion.tier,
    item: insertion.item,
    pivot,
    pivotReason: insertion.pivotReason!,
    pivotIsNew: isNew,
    insertion,
  };
}

/**
 * Apply one answer to the current question.
 *  - 'a': the new game beats the opponent; 'b': the opponent beats it.
 *  - 'too_close': place it directly below the opponent.
 *  - 'cant_compare': another opponent; after the configured number in a row,
 *    place it at the middle of its current range.
 * A no-op once every game is placed.
 */
export function answerBatch(state: BatchState, outcome: ComparisonOutcome): BatchState {
  const current = state.current;
  if (current === null) return state;
  const { itemIndex, insertion } = current;
  const entry = state.items[itemIndex]!;
  const before = state.progress[itemIndex]!;
  const pivotIndex = insertion.pivotIndex!;

  const next = answer(insertion, outcome);
  const record = next.records[next.records.length - 1]!;
  const ceiling = remainingEstimate(state);
  let s: BatchState = { ...state, log: [...state.log, record], current: null, estimateCeiling: ceiling };

  if (next.done && next.insertAt !== null) {
    s = settle(s, itemIndex, next.insertAt, next.records);
  } else {
    const chain = insertion.list;
    let guess = before.guess;
    let walk = before.walk;
    if (outcome === 'a' || outcome === 'b') {
      if (guess) {
        const byId = itemIndexById(state);
        const view = viewFor(state, entry.tier, byId);
        const g = predictedSlot(view, entry, insertion.lo, insertion.hi);
        const agreed = g === null || outcome === (pivotIndex < g ? 'b' : 'a');
        if (!agreed) {
          guess = false;
          walk = { dir: outcome === 'a' ? 'up' : 'down', step: 1 };
        }
      } else if (walk) {
        const onward = (walk.dir === 'down') === (outcome === 'b');
        walk = onward ? { dir: walk.dir, step: walk.step * 2 } : null;
      }
    }
    s = withProgress(s, itemIndex, {
      ...before,
      above: next.lo > 0 ? chain[next.lo - 1]!.id : null,
      below: next.hi < chain.length ? chain[next.hi]!.id : null,
      guess,
      walk,
      declined: next.declined.map((i) => chain[i]!.id),
      consecutiveCantCompare: next.consecutiveCantCompare,
      records: next.records,
    });
  }

  s = settleEmptyBrackets(s);
  return { ...s, current: selectQuestion(s) };
}

/**
 * "Place the rest for me": every unresolved game goes to its predicted slot
 * inside its bracket (the middle of the bracket when it has no guess), games
 * sharing a slot ordered by predicted score and then the tie-break order, all
 * marked `prior`. A game placed without a question (the first of an empty
 * tier) is marked `prior` too when an unresolved game's bracket still holds
 * it, because its order against that game is a guess as well. Nothing enters
 * the log.
 */
export function placeRest(state: BatchState): BatchState {
  if (state.current === null && state.progress.every((p) => p.placed)) return state;
  const byId = itemIndexById(state);
  const order = guessOrder(state);
  const progress = state.progress.slice();
  const chains = { ...state.chains };

  for (const tier of TIERS) {
    const pending = pendingIn(state, tier);
    if (pending.length === 0) continue;
    const view = viewFor(state, tier, byId);
    const slots = new Map<number, number[]>();
    const brackets: { lo: number; hi: number }[] = [];
    for (const i of pending) {
      const { lo, hi } = bracket(view, state.progress[i]!);
      brackets.push({ lo, hi });
      const g = predictedSlot(view, state.items[i]!, lo, hi) ?? Math.floor((lo + hi) / 2);
      slots.set(g, [...(slots.get(g) ?? []), i]);
    }

    view.chain.forEach((it, c) => {
      const k = byId.get(it.id);
      if (k === undefined || !progress[k]!.free) return;
      if (brackets.some(({ lo, hi }) => c >= lo && c <= hi - 1)) {
        progress[k] = { ...progress[k]!, placedBy: 'prior' };
      }
    });

    const merged: RankableItem[] = [];
    for (let gap = 0; gap <= view.chain.length; gap++) {
      for (const i of (slots.get(gap) ?? []).sort(order)) {
        merged.push(state.items[i]!.item);
        progress[i] = { ...progress[i]!, placed: true, placedBy: 'prior', walk: null };
      }
      const settled = view.chain[gap];
      if (settled) merged.push(settled);
    }
    chains[tier] = merged;
  }

  return { ...state, progress, chains, current: null };
}

/** "About N more to place everything": 0 once nothing is left to ask. */
export function remainingEstimate(state: BatchState): number {
  if (state.current === null) return 0;
  const byId = itemIndexById(state);
  let total = 0;
  for (const tier of TIERS) {
    const pending = pendingIn(state, tier);
    if (pending.length === 0) continue;
    const view = viewFor(state, tier, byId);
    const brackets = pending.map((i) => bracket(view, state.progress[i]!));
    pending.forEach((i, n) => {
      const { lo, hi } = brackets[n]!;
      const sharing = brackets.filter((b, m) => m !== n && Math.max(b.lo, lo) <= Math.min(b.hi, hi)).length;
      const width = hi - lo + sharing / 2;
      const search = Math.log2(width + 1);
      const entry = state.items[i]!;
      const g = state.progress[i]!.guess ? predictedSlot(view, entry, lo, hi) : null;
      if (g === null) {
        total += search;
      } else {
        const openSides = (g > lo ? 1 : 0) + (g < hi ? 1 : 0);
        total += Math.min(search, openSides + MISS[entry.confidence ?? 'needs_more_data'] * search);
      }
    });
  }
  return Math.max(1, Math.min(state.estimateCeiling, Math.round(total)));
}

/**
 * The outcome: every tier's final order and one placement per new game, in
 * write order. Throws while a question is still open; call `placeRest` first
 * to stop early.
 */
export function applyBatch(state: BatchState): BatchResult {
  if (state.current !== null || !state.progress.every((p) => p.placed)) {
    throw new Error('batch not finished');
  }
  const byId = itemIndexById(state);
  const tiers = { loved: [], liked: [], fine: [], disliked: [] } as Record<Tier, RankableItem[]>;
  const placements: BatchPlacement[] = [];
  for (const tier of TIERS) {
    tiers[tier] = state.chains[tier].slice();
    tiers[tier].forEach((item, position) => {
      const k = byId.get(item.id);
      if (k === undefined) return;
      const p = state.progress[k]!;
      placements.push({ item, tier, position, placedBy: p.placedBy ?? 'prior', log: p.records });
    });
  }
  return { tiers, placements };
}

/**
 * One `finish_insertion` call per new game, in the order they must be made:
 * tier by tier, best position first, so each game's position is right for the
 * tier as it stands when its call runs. Positions are read from
 * `result.tiers`, so a review that reorders new games (and flips their
 * `placedBy`) passes its lists back in and gets matching positions; existing
 * games must keep their order.
 */
export function batchFinishArgs(result: BatchResult, ids: InsertionIds): BatchFinishArgs[] {
  const toId = ids.mediaItemId ?? ((id: string) => id);
  const placed = new Map(result.placements.map((p) => [p.item.id, p]));
  const out: BatchFinishArgs[] = [];
  for (const tier of TIERS) {
    result.tiers[tier].forEach((item, position) => {
      const p = placed.get(item.id);
      if (!p) return;
      out.push({
        mediaItemId: toId(item.id),
        medium: ids.medium,
        tier,
        position,
        placedBy: p.placedBy,
        comparisons: p.log.map((r) => ({
          item_a: toId(r.itemA),
          item_b: toId(r.itemB),
          outcome: r.outcome,
          context: { ...r.context },
        })),
      });
    });
  }
  return out;
}
