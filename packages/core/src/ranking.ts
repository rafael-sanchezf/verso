/**
 * Option A ranking engine (see docs/design/ranking-algorithm.md).
 *
 * Binary-search insertion of one new item into an ordered tier list, with:
 *  - genre-preferring pivot choice once the tier has enough genre peers,
 *  - "too close" (place directly below the pivot) and "can't compare"
 *    (swap the pivot; two in a row ends at the range midpoint) escape hatches,
 *  - a full record of every answer for the comparisons log.
 *
 * The engine is a pure state machine so the UI can drive it one answer at a
 * time and persist the records. It never touches storage.
 */

import type { ComparisonOutcome, ComparisonRecord, PivotReason, Tier } from './model';
import { TIER_BANDS } from './model';
import { DEFAULT_IGNORED_GENRES, isIgnoredGenre } from './genres';

export interface RankableItem {
  id: string;
  /** Genre tags used only for pivot preference. Empty array is fine. */
  genres: readonly string[];
}

export interface InsertionOptions {
  /**
   * How many positions away from the exact midpoint a same-genre pivot may be
   * and still be preferred over the midpoint. 0 disables the preference.
   * Provisional default; tune by using the app.
   */
  genreWindow: number;
  /**
   * Minimum number of same-genre items already in the tier before the genre
   * preference kicks in. Below this, plain midpoint pivots are used.
   * Provisional default; tune by using the app.
   */
  minGenrePeers: number;
  /** Consecutive "can't compare" answers that end the search at the range midpoint. */
  maxConsecutiveCantCompare: number;
  /**
   * Genre names that never make two items "same genre": they neither attract a
   * pivot nor count towards `minGenrePeers` nor show up as a cue on screen.
   *
   * Defaults to ["Indie"], which is a production model rather than a kind of
   * game. Two indie games have no more in common than two games from large
   * studios, so treating a shared "Indie" tag as a genre match pulls the pivot
   * off the midpoint and makes the screen claim a kinship the player does not
   * feel. This is tuning inside the deliberately unset threshold of open design
   * question 2 in ROADMAP.md, not a change to the algorithm: genre is still a
   * pivot preference and never a filter.
   */
  ignoredGenres: readonly string[];
}

export const DEFAULT_INSERTION_OPTIONS: InsertionOptions = {
  genreWindow: 1,
  minGenrePeers: 3,
  maxConsecutiveCantCompare: 2,
  ignoredGenres: DEFAULT_IGNORED_GENRES,
};

export interface InsertionState {
  readonly tier: Tier;
  readonly item: RankableItem;
  /** The tier's current order, best first. Not mutated. */
  readonly list: readonly RankableItem[];
  /** The item belongs at an insertion index in [lo, hi]. Indices are into `list`, 0..list.length. */
  readonly lo: number;
  readonly hi: number;
  /** Index into `list` of the item currently being compared against, or null when done. */
  readonly pivotIndex: number | null;
  /**
   * Why that item is the pivot, so the comparison screen can show the genre cue
   * and the genre prompt without recomputing anything. Null exactly when
   * `pivotIndex` is null. Always describes the current pivot, never a previous
   * one: every transition that sets `pivotIndex` sets this in the same step.
   */
  readonly pivotReason: PivotReason | null;
  /** Pivots declined with "can't compare" during the current range. */
  readonly declined: readonly number[];
  readonly consecutiveCantCompare: number;
  readonly records: readonly ComparisonRecord[];
  readonly done: boolean;
  /** Final insertion index into `list` once done. */
  readonly insertAt: number | null;
  readonly options: InsertionOptions;
}

/**
 * The first genre of `a` that `b` also has and that is not ignored, or null.
 *
 * "First in `a`'s order" is what makes the named genre deterministic when two
 * games share more than one: pass the NEW item as `a` and its own ordering
 * decides which genre the screen says out loud.
 */
export function sharedGenre(
  a: RankableItem,
  b: RankableItem,
  ignoredGenres: readonly string[] = DEFAULT_IGNORED_GENRES,
): string | null {
  if (a.genres.length === 0 || b.genres.length === 0) return null;
  const other = new Set(b.genres);
  for (const genre of a.genres) {
    if (other.has(genre) && !isIgnoredGenre(genre, ignoredGenres)) return genre;
  }
  return null;
}

export function sharesGenre(
  a: RankableItem,
  b: RankableItem,
  ignoredGenres: readonly string[] = DEFAULT_IGNORED_GENRES,
): boolean {
  return sharedGenre(a, b, ignoredGenres) !== null;
}

function genrePeerCount(
  item: RankableItem,
  list: readonly RankableItem[],
  ignoredGenres: readonly string[],
): number {
  let n = 0;
  for (const other of list) if (sharesGenre(item, other, ignoredGenres)) n++;
  return n;
}

/**
 * Choose the pivot for the current range. Candidate pivots are list indices
 * lo..hi-1 (items whose order relative to the new item is unknown).
 */
export function choosePivot(state: InsertionState): number | null {
  const { lo, hi, list, item, options, declined } = state;
  if (hi <= lo) return null;
  const mid = Math.floor((lo + hi - 1) / 2);
  const isDeclined = (i: number) => declined.includes(i);

  const preferGenre =
    options.genreWindow > 0 &&
    genrePeerCount(item, list, options.ignoredGenres) >= options.minGenrePeers;

  if (preferGenre) {
    let best: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    const from = Math.max(lo, mid - options.genreWindow);
    const to = Math.min(hi - 1, mid + options.genreWindow);
    for (let i = from; i <= to; i++) {
      const candidate = list[i];
      if (!candidate || isDeclined(i) || !sharesGenre(item, candidate, options.ignoredGenres)) continue;
      const dist = Math.abs(i - mid);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best !== null) return best;
  }

  if (!isDeclined(mid)) return mid;

  // Midpoint was declined: nearest non-declined index in range, alternating outward.
  for (let d = 1; d < hi - lo; d++) {
    const left = mid - d;
    const right = mid + d;
    if (left >= lo && !isDeclined(left)) return left;
    if (right <= hi - 1 && !isDeclined(right)) return right;
  }
  return null;
}

/**
 * Why `pivot` is the one on screen. Derived from the pivot the search actually
 * landed on rather than from the branch that picked it, so the reason cannot
 * drift away from what the user is looking at: if the two games share a genre,
 * the screen says so, whether the preference steered there or the midpoint
 * happened to be a genre peer.
 */
function pivotReasonFor(
  item: RankableItem,
  pivot: RankableItem,
  ignoredGenres: readonly string[],
): PivotReason {
  const genre = sharedGenre(item, pivot, ignoredGenres);
  return genre === null ? { kind: 'midpoint' } : { kind: 'genre', genre };
}

/**
 * Set `pivotIndex` and `pivotReason` together. The single place either is
 * assigned while the search is running, which is what keeps them in step.
 */
function withPivot(state: InsertionState): InsertionState {
  const index = choosePivot(state);
  const pivot = index === null ? undefined : state.list[index];
  if (index === null || !pivot) return { ...state, pivotIndex: null, pivotReason: null };
  return {
    ...state,
    pivotIndex: index,
    pivotReason: pivotReasonFor(state.item, pivot, state.options.ignoredGenres),
  };
}

export function startInsertion(
  tier: Tier,
  item: RankableItem,
  list: readonly RankableItem[],
  options: Partial<InsertionOptions> = {},
): InsertionState {
  const opts = { ...DEFAULT_INSERTION_OPTIONS, ...options };
  const base: InsertionState = {
    tier,
    item,
    list,
    lo: 0,
    hi: list.length,
    pivotIndex: null,
    pivotReason: null,
    declined: [],
    consecutiveCantCompare: 0,
    records: [],
    done: false,
    insertAt: null,
    options: opts,
  };
  if (list.length === 0) return { ...base, done: true, insertAt: 0 };
  return withPivot(base);
}

function record(state: InsertionState, pivot: RankableItem, outcome: ComparisonOutcome): ComparisonRecord {
  const pivotReason =
    state.pivotReason ?? pivotReasonFor(state.item, pivot, state.options.ignoredGenres);
  return {
    itemA: state.item.id,
    itemB: pivot.id,
    outcome,
    context: {
      tier: state.tier,
      sameGenre: pivotReason.kind === 'genre',
      tierSize: state.list.length,
      pivotReason,
    },
  };
}

function finish(state: InsertionState, insertAt: number, records: readonly ComparisonRecord[]): InsertionState {
  return { ...state, records, pivotIndex: null, pivotReason: null, done: true, insertAt };
}

function advance(state: InsertionState, lo: number, hi: number, records: readonly ComparisonRecord[]): InsertionState {
  const next: InsertionState = {
    ...state,
    lo,
    hi,
    records,
    declined: [],
    consecutiveCantCompare: 0,
    pivotIndex: null,
    pivotReason: null,
  };
  if (lo === hi) return finish(next, lo, records);
  return withPivot(next);
}

/**
 * Apply one answer.
 *  - 'a': the new item beats the pivot (belongs above it).
 *  - 'b': the pivot beats the new item (belongs below it).
 *  - 'too_close': stop, place directly below the pivot.
 *  - 'cant_compare': try a different pivot; after the configured number in a row, stop at the range midpoint.
 */
export function answer(state: InsertionState, outcome: ComparisonOutcome): InsertionState {
  if (state.done || state.pivotIndex === null) return state;
  const p = state.pivotIndex;
  const pivot = state.list[p];
  if (!pivot) return state;
  const records = [...state.records, record(state, pivot, outcome)];

  switch (outcome) {
    case 'a':
      return advance(state, state.lo, p, records);
    case 'b':
      return advance(state, p + 1, state.hi, records);
    case 'too_close':
      return finish(state, p + 1, records);
    case 'cant_compare': {
      const consecutive = state.consecutiveCantCompare + 1;
      const declined = [...state.declined, p];
      const withDecline: InsertionState = { ...state, records, declined, consecutiveCantCompare: consecutive };
      if (consecutive >= state.options.maxConsecutiveCantCompare) {
        return finish(withDecline, Math.floor((state.lo + state.hi) / 2), records);
      }
      const next = withPivot(withDecline);
      if (next.pivotIndex === null) {
        return finish(withDecline, Math.floor((state.lo + state.hi) / 2), records);
      }
      return next;
    }
  }
}

/** The list with the item inserted at the final position. Only valid when `done`. */
export function applyInsertion(state: InsertionState): RankableItem[] {
  if (!state.done || state.insertAt === null) throw new Error('insertion not finished');
  const out = [...state.list];
  out.splice(state.insertAt, 0, state.item);
  return out;
}

/** Upper bound on questions plain binary search would ask for a tier of this size. */
export function maxQuestions(tierSize: number): number {
  return tierSize === 0 ? 0 : Math.ceil(Math.log2(tierSize + 1));
}

/**
 * Derived 0 to 10 score for a position inside a tier. Position 0 is best.
 * Interpolates linearly inside the tier's band. A single item sits at the band midpoint.
 * Never stored; recomputed on read.
 */
export function scoreForPosition(tier: Tier, position: number, tierSize: number): number {
  const [low, high] = TIER_BANDS[tier];
  if (tierSize <= 0) throw new Error('empty tier has no positions');
  if (position < 0 || position >= tierSize) throw new Error('position out of range');
  if (tierSize === 1) return round1((low + high) / 2);
  const t = position / (tierSize - 1);
  return round1(high - (high - low) * t);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
