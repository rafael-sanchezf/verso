/**
 * The three steps of the log flow, as a state machine over the engine's state.
 *
 * The ranking engine in `@verso/core` is the source of truth for every
 * transition: which pivot is on screen, what an answer does to the range, when
 * the search is over and where the game lands. Nothing here re-decides any of
 * that. What this adds is the one thing the engine has no opinion about — which
 * of the three screens the user is looking at — plus the provisional index the
 * confirm step's nudges move before anything is written.
 *
 * It is pure and knows nothing about React, Supabase or the sheet, which is
 * what makes the whole flow testable without a renderer (see
 * `apps/mobile/test/log-machine.test.ts`).
 */

import {
  answer,
  applyInsertion,
  maxQuestions,
  startInsertion,
  type ComparisonOutcome,
  type InsertionOptions,
  type InsertionState,
  type RankableItem,
  type Tier,
} from '@verso/core';

/**
 * Step 1 asks for a tier, step 2 asks the comparisons, step 3 confirms.
 *
 * `insertAt` is separate from `insertion.insertAt` on purpose: the nudges move
 * it and nothing else, so the engine's own answer to "where does this go" stays
 * intact next to the user's adjustment of it, and the comparison log written at
 * the end is still exactly what was asked and answered.
 */
export type LogState =
  | { readonly step: 'tier' }
  | { readonly step: 'compare'; readonly insertion: InsertionState }
  | { readonly step: 'confirm'; readonly insertion: InsertionState; readonly insertAt: number };

export type ConfirmState = Extract<LogState, { step: 'confirm' }>;

/** Where every run starts: the tier sheet, at the small detent. */
export const TIER_STEP: LogState = { step: 'tier' };

/**
 * The step an engine state belongs on.
 *
 * A finished insertion goes straight to confirm, which is what sends an empty
 * tier past the comparisons without a special case: `startInsertion` marks an
 * empty tier done at once (specs/log-flow.md, step 1).
 */
function stepFor(insertion: InsertionState): LogState {
  if (!insertion.done || insertion.insertAt === null) return { step: 'compare', insertion };
  return { step: 'confirm', insertion, insertAt: insertion.insertAt };
}

/** Step 1's tap: start the search against that tier's current order. */
export function chooseTier(
  tier: Tier,
  item: RankableItem,
  list: readonly RankableItem[],
  options?: Partial<InsertionOptions>,
): LogState {
  return stepFor(startInsertion(tier, item, list, options));
}

/** Step 2's four answers: the two cards and the two escape hatches. */
export function respond(state: LogState, outcome: ComparisonOutcome): LogState {
  if (state.step !== 'compare') return state;
  return stepFor(answer(state.insertion, outcome));
}

/**
 * Step 3's nudges. `-1` is "move up" (towards the best), `+1` is "move down".
 *
 * Clamped to the insertion positions the tier actually has, which are 0 to
 * `list.length` inclusive — `length` positions plus the slot past the end. An
 * empty tier therefore has exactly one position and both nudges do nothing,
 * which is the spec's "disabled when the tier was empty" falling out of the
 * arithmetic rather than being a case of its own.
 */
export function nudge(state: LogState, delta: number): LogState {
  if (state.step !== 'confirm') return state;
  const next = clamp(state.insertAt + delta, 0, state.insertion.list.length);
  return next === state.insertAt ? state : { ...state, insertAt: next };
}

/** Whether a nudge in that direction would move anything; the button's enabled state. */
export function canNudge(state: LogState, delta: number): boolean {
  return state.step === 'confirm' && nudge(state, delta) !== state;
}

/** The tier's order with the new game dropped in at the nudged index, best first. */
export function provisionalList(state: ConfirmState): RankableItem[] {
  return applyInsertion({ ...state.insertion, insertAt: state.insertAt });
}

export interface Progress {
  /** Which question is on screen, counting from 1. */
  readonly current: number;
  /** How many the search expects to ask, nudged up to at least `current` (see below). */
  readonly total: number;
  /** "1 of ~3". Unused since the dots replaced this counter (rule 33, 2026-09-16). */
  readonly label: string;
  /** Comparisons answered so far: `records.length`, not counting the one on screen. */
  readonly answered: number;
  /**
   * Dots to draw for step 2's progress row: `maxQuestions(list.length)`,
   * floored at one. Unlike `total`, this never grows past the estimate — a run
   * that uses "can't compare" can answer more comparisons than this, and it is
   * up to the caller (`ProgressDots`) to clamp `answered` to `expected` rather
   * than draw more dots than the row the spec asks for.
   */
  readonly expected: number;
}

/**
 * The progress behind step 2's top row: the answers given plus one, over
 * `maxQuestions` for the tier.
 *
 * `total` is a bound on plain binary search, and "can't compare" swaps a pivot
 * without narrowing the range, so a run that uses the hatch can ask more
 * questions than the bound. `label`'s tilde already says the number is
 * approximate, so `total` is nudged up to the current question rather than
 * letting the counter read "4 of ~3", which looks like a bug rather than an
 * estimate; `label` is kept for that reason even though the dots replaced it
 * on screen. `expected` is the row of dots itself and does not get that
 * nudge — it stays fixed at the estimate, and `answered` (which can exceed it
 * the same way `current` can exceed `total`) is clamped by the caller instead.
 */
export function progress(insertion: InsertionState): Progress {
  const answered = insertion.records.length;
  const current = answered + 1;
  const expected = Math.max(maxQuestions(insertion.list.length), 1);
  const total = Math.max(expected, current);
  return { current, total, label: `${current} of ~${total}`, answered, expected };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
