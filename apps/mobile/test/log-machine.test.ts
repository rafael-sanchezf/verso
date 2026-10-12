/**
 * The log flow's step machine.
 *
 * The engine's own behaviour is tested in packages/core; what is tested here is
 * the screen's use of it: which step each engine state belongs on, that an
 * answer only counts on the comparison step, and that the nudges move the
 * provisional index without touching the record of what was asked.
 */

import { startInsertion, type RankableItem } from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  canNudge,
  chooseTier,
  nudge,
  progress,
  provisionalList,
  respond,
  TIER_STEP,
  type ConfirmState,
  type LogState,
} from '../src/screens/log/machine';

const RPG = ['Role-playing (RPG)'];

/** Eight ranked games, best first, none of them genre peers of the new one. */
function tierOf(size: number): RankableItem[] {
  return Array.from({ length: size }, (_, i) => ({ id: `game-${i}`, genres: [] }));
}

const NEW_GAME: RankableItem = { id: 'new', genres: RPG };

function compareState(state: LogState) {
  if (state.step !== 'compare') throw new Error(`expected the compare step, got ${state.step}`);
  return state;
}

function confirmState(state: LogState): ConfirmState {
  if (state.step !== 'confirm') throw new Error(`expected the confirm step, got ${state.step}`);
  return state;
}

describe('chooseTier', () => {
  it('opens the comparisons on a tier that has games in it', () => {
    const state = chooseTier('loved', NEW_GAME, tierOf(8));

    const compare = compareState(state);
    expect(compare.insertion.pivotIndex).not.toBeNull();
    expect(compare.insertion.tier).toBe('loved');
  });

  it('skips straight to confirm on an empty tier', () => {
    const state = chooseTier('liked', NEW_GAME, []);

    expect(confirmState(state).insertAt).toBe(0);
  });
});

describe('respond', () => {
  it('walks the binary search down to a placement', () => {
    let state = chooseTier('loved', NEW_GAME, tierOf(8));

    // Worst case for eight games is four questions; each answer must either
    // move the search on or finish it.
    for (let asked = 0; asked < 4 && state.step === 'compare'; asked++) {
      state = respond(state, 'b');
    }

    const confirm = confirmState(state);
    // Beaten by every pivot it met, so it belongs at the bottom of the tier.
    expect(confirm.insertAt).toBe(8);
    expect(confirm.insertion.records).toHaveLength(4);
  });

  it('places the game directly below the pivot on "too close"', () => {
    const state = chooseTier('loved', NEW_GAME, tierOf(8));
    const pivot = compareState(state).insertion.pivotIndex;

    const confirm = confirmState(respond(state, 'too_close'));

    expect(confirm.insertAt).toBe((pivot ?? 0) + 1);
  });

  it('swaps the pivot on "can\'t compare" without narrowing the range', () => {
    const state = compareState(chooseTier('loved', NEW_GAME, tierOf(8)));

    const next = compareState(respond(state, 'cant_compare'));

    expect(next.insertion.pivotIndex).not.toBe(state.insertion.pivotIndex);
    expect(next.insertion.lo).toBe(state.insertion.lo);
    expect(next.insertion.hi).toBe(state.insertion.hi);
  });

  it('ignores an answer that arrives on another step', () => {
    expect(respond(TIER_STEP, 'a')).toBe(TIER_STEP);

    const confirm = confirmState(chooseTier('liked', NEW_GAME, []));
    expect(respond(confirm, 'a')).toBe(confirm);
  });
});

describe('nudge', () => {
  const placed = () => confirmState(respond(chooseTier('loved', NEW_GAME, tierOf(8)), 'too_close'));

  it('moves one position up or down', () => {
    const state = placed();

    expect(confirmState(nudge(state, -1)).insertAt).toBe(state.insertAt - 1);
    expect(confirmState(nudge(state, 1)).insertAt).toBe(state.insertAt + 1);
  });

  it('clamps at the top and the bottom of the tier', () => {
    const top = { ...placed(), insertAt: 0 };
    const bottom = { ...placed(), insertAt: 8 };

    expect(nudge(top, -1)).toBe(top);
    expect(canNudge(top, -1)).toBe(false);
    expect(nudge(bottom, 1)).toBe(bottom);
    expect(canNudge(bottom, 1)).toBe(false);
    expect(canNudge(top, 1)).toBe(true);
  });

  it('cannot move anywhere when the tier was empty', () => {
    const first = confirmState(chooseTier('fine', NEW_GAME, []));

    expect(canNudge(first, -1)).toBe(false);
    expect(canNudge(first, 1)).toBe(false);
  });

  it('leaves the engine state and its comparison log alone', () => {
    const state = placed();

    const moved = confirmState(nudge(state, -1));

    expect(moved.insertion).toBe(state.insertion);
    expect(moved.insertion.insertAt).toBe(state.insertion.insertAt);
  });

  it('is what the provisional list is built from', () => {
    const state = { ...placed(), insertAt: 3 };

    expect(provisionalList(state).map((item) => item.id)).toEqual([
      'game-0',
      'game-1',
      'game-2',
      'new',
      'game-3',
      'game-4',
      'game-5',
      'game-6',
      'game-7',
    ]);
  });
});

describe('progress', () => {
  it('counts the answers given plus one, over the search bound', () => {
    const first = compareState(chooseTier('loved', NEW_GAME, tierOf(8)));

    expect(progress(first.insertion).label).toBe('1 of ~4');

    const second = compareState(respond(first, 'a'));
    expect(progress(second.insertion).label).toBe('2 of ~4');
  });

  it('never counts past its own total when a hatch adds a question', () => {
    // A tier of three expects two questions. "Can't compare" swaps the pivot
    // without narrowing the range, so this run reaches a third one.
    let state: LogState = chooseTier('loved', NEW_GAME, tierOf(3));
    expect(progress(compareState(state).insertion).total).toBe(2);

    state = respond(state, 'cant_compare');
    state = respond(state, 'b');

    expect(progress(compareState(state).insertion).label).toBe('3 of ~3');
  });

  it('keeps the total at or above the question on screen', () => {
    expect(progress(startInsertion('loved', NEW_GAME, []))).toMatchObject({ current: 1, total: 1 });
  });

  // `answered` and `expected` are what the compare step's progress dots draw
  // from (rule 33: dots replaced the "1 of ~3" counter, Rafa 2026-09-16). They
  // are exposed separately from `current`/`total`/`label` above, which stay
  // for the (now unused on screen) counter string.
  it('exposes answered and expected for the dots', () => {
    const first = compareState(chooseTier('loved', NEW_GAME, tierOf(8)));
    expect(progress(first.insertion)).toMatchObject({ answered: 0, expected: 4 });

    const second = compareState(respond(first, 'a'));
    expect(progress(second.insertion)).toMatchObject({ answered: 1, expected: 4 });
  });

  it('never grows expected past the estimate, unlike total', () => {
    // The same hatch run as "never counts past its own total" above: a tier of
    // three expects two dots, and two answers (one of them a "can't compare")
    // reaches a third question without finishing.
    let state: LogState = chooseTier('loved', NEW_GAME, tierOf(3));
    expect(progress(compareState(state).insertion).expected).toBe(2);

    state = respond(state, 'cant_compare');
    state = respond(state, 'b');

    const steps = progress(compareState(state).insertion);
    expect(steps.expected).toBe(2);
    expect(steps.answered).toBe(2);
    expect(steps.total).toBe(3); // the label's total, unlike expected, does grow
  });

  it('can answer more than expected, which is the case the dots must clamp', () => {
    // A tier of seven expects three dots (worst case for plain binary search).
    // Alternating "can't compare" with a real answer keeps the run alive
    // without narrowing the range every time, so it outlives that estimate
    // while still on the compare step — the exact shape `ProgressDots` (in
    // ./pieces) clamps `answered` against `expected` for, since this run has
    // more answers than the row of dots the spec draws.
    let state: LogState = chooseTier('loved', NEW_GAME, tierOf(7));
    state = respond(state, 'cant_compare');
    state = respond(state, 'a');
    state = respond(state, 'cant_compare');
    state = respond(state, 'a');

    const compare = compareState(state);
    expect(compare.insertion.records).toHaveLength(4);

    const steps = progress(compare.insertion);
    expect(steps.expected).toBe(3);
    expect(steps.answered).toBe(4);
    expect(steps.answered).toBeGreaterThan(steps.expected);
    // What the dots row actually draws: never more filled dots than the row.
    expect(Math.min(steps.answered, steps.expected)).toBe(steps.expected);
  });
});
