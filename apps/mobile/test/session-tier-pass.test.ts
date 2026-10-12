/**
 * The tier pass that runs before the comparisons when games arrive without a
 * tier (the drain and add-many): one game per screen, in arrival order.
 */

import { describe, expect, it } from 'vitest';

import {
  assignPassTier,
  passCurrent,
  passDone,
  passFill,
  passLabel,
  startTierPass,
  stopPass,
  withPassTiers,
} from '../src/screens/onboarding/session/tier-pass';

const items = [
  { mediaItemId: 'a', tier: null },
  { mediaItemId: 'b', tier: 'liked' as const },
  { mediaItemId: 'c', tier: null },
  { mediaItemId: 'd', tier: null },
];

describe('the tier pass', () => {
  it('asks only about the games with no tier, in the order they arrived', () => {
    const pass = startTierPass(items);
    expect(pass.ids).toEqual(['a', 'c', 'd']);
    expect(passCurrent(pass)).toBe('a');
    expect(passLabel(pass)).toBe('1 of 3');
    expect(passFill(pass)).toBe(0);
  });

  it('is over at once when every game came with a tier', () => {
    const pass = startTierPass([{ mediaItemId: 'x', tier: 'fine' }]);
    expect(passDone(pass)).toBe(true);
    expect(passCurrent(pass)).toBeNull();
    expect(passFill(pass)).toBe(1);
  });

  it('assigns the tapped tier and moves on, one game a tap', () => {
    let pass = startTierPass(items);
    pass = assignPassTier(pass, 'loved');
    expect(passCurrent(pass)).toBe('c');
    expect(passLabel(pass)).toBe('2 of 3');
    pass = assignPassTier(pass, 'fine');
    pass = assignPassTier(pass, 'disliked');
    expect(passDone(pass)).toBe(true);
    expect(passLabel(pass)).toBe('3 of 3');
    expect(assignPassTier(pass, 'loved')).toBe(pass);

    expect(withPassTiers(items, pass).map((i) => [i.mediaItemId, i.tier])).toEqual([
      ['a', 'loved'],
      ['b', 'liked'],
      ['c', 'fine'],
      ['d', 'disliked'],
    ]);
  });

  it('stopped early, keeps the games already tiered and leaves the rest out', () => {
    let pass = startTierPass(items);
    pass = assignPassTier(pass, 'liked');
    pass = stopPass(pass);
    expect(passDone(pass)).toBe(true);
    expect(withPassTiers(items, pass).map((i) => i.mediaItemId)).toEqual(['a', 'b']);
  });
});
