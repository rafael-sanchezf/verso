import { describe, expect, it } from 'vitest';

import {
  LAST_STOP,
  TIER_STOPS,
  TIER_THUMB_ICONS,
  TIER_WORDS,
  TRACK_INSET,
  nearestStop,
  positionAtX,
  sliderWord,
  stepValue,
  stopIndex,
  tierAtStop,
  usableWidth,
  xAtPosition,
} from '../src/screens/onboarding/tier-scale';

/** The frame's track: about 220 wide. */
const WIDTH = 220;
const SPAN = WIDTH - 2 * TRACK_INSET;

describe('the stops', () => {
  it('runs worst to best, left to right, four and only four', () => {
    expect(TIER_STOPS).toEqual(['disliked', 'fine', 'liked', 'loved']);
    expect(LAST_STOP).toBe(3);
  });

  it('names each stop with the axis words and one icon each', () => {
    expect(TIER_STOPS.map((tier) => TIER_WORDS[tier])).toEqual(["Didn't like", 'Fine', 'Liked', 'Loved']);
    expect(TIER_STOPS.map((tier) => TIER_THUMB_ICONS[tier])).toEqual(['thumbs-down', 'meh', 'thumbs-up', 'heart']);
  });

  it('maps a value to its stop and back', () => {
    expect(stopIndex(null)).toBeNull();
    TIER_STOPS.forEach((tier, index) => {
      expect(stopIndex(tier)).toBe(index);
      expect(tierAtStop(index)).toBe(tier);
    });
  });

  it('clamps a stop index outside the track to its ends', () => {
    expect(tierAtStop(-2)).toBe('disliked');
    expect(tierAtStop(9)).toBe('loved');
  });

  it('says "Slide" while untouched and the tier word after', () => {
    expect(sliderWord(null)).toBe('Slide');
    expect(sliderWord('disliked')).toBe("Didn't like");
    expect(sliderWord('loved')).toBe('Loved');
  });
});

describe('the geometry', () => {
  it('keeps the thumb inside the track with an inset of its radius', () => {
    expect(usableWidth(WIDTH)).toBe(SPAN);
    expect(xAtPosition(0, WIDTH)).toBe(TRACK_INSET);
    expect(xAtPosition(3, WIDTH)).toBe(WIDTH - TRACK_INSET);
  });

  it('puts the four stops at 0, 1/3, 2/3 and 1 of the span', () => {
    [0, 1, 2, 3].forEach((stop) => {
      expect(xAtPosition(stop, WIDTH)).toBeCloseTo(TRACK_INSET + (stop / 3) * SPAN);
    });
  });

  it('reads a finger back as a position in stop units', () => {
    [0, 0.5, 1, 1.5, 2, 3].forEach((position) => {
      expect(positionAtX(xAtPosition(position, WIDTH), WIDTH)).toBeCloseTo(position);
    });
  });

  it('clamps a finger off either end of the track', () => {
    expect(positionAtX(-40, WIDTH)).toBe(0);
    expect(positionAtX(0, WIDTH)).toBe(0);
    expect(positionAtX(WIDTH + 40, WIDTH)).toBe(3);
  });

  it('reads an unmeasured track as the first stop rather than dividing by zero', () => {
    expect(positionAtX(10, 0)).toBe(0);
    expect(positionAtX(10, 2 * TRACK_INSET)).toBe(0);
  });
});

describe('snapping', () => {
  it('snaps to the nearest stop and never between', () => {
    expect(nearestStop(0)).toBe(0);
    expect(nearestStop(0.49)).toBe(0);
    expect(nearestStop(0.5)).toBe(1);
    expect(nearestStop(1.4)).toBe(1);
    expect(nearestStop(2.6)).toBe(3);
    expect(nearestStop(3)).toBe(3);
  });

  it('clamps and survives nonsense', () => {
    expect(nearestStop(-1)).toBe(0);
    expect(nearestStop(7)).toBe(3);
    expect(nearestStop(Number.NaN)).toBe(0);
  });

  it('turns a tap anywhere on the track into one of the four tiers', () => {
    const tapped = (x: number) => tierAtStop(nearestStop(positionAtX(x, WIDTH)));
    expect(tapped(0)).toBe('disliked');
    expect(tapped(WIDTH * 0.3)).toBe('fine');
    expect(tapped(WIDTH * 0.7)).toBe('liked');
    expect(tapped(WIDTH)).toBe('loved');
  });
});

describe('the accessibility steps', () => {
  it('moves one stop at a time', () => {
    expect(stepValue('disliked', 'increment')).toBe('fine');
    expect(stepValue('fine', 'increment')).toBe('liked');
    expect(stepValue('loved', 'decrement')).toBe('liked');
  });

  it('clamps at both ends', () => {
    expect(stepValue('loved', 'increment')).toBe('loved');
    expect(stepValue('disliked', 'decrement')).toBe('disliked');
  });

  it('starts an untouched row at the first stop, and a decrement leaves it untouched', () => {
    expect(stepValue(null, 'increment')).toBe('disliked');
    expect(stepValue(null, 'decrement')).toBeNull();
  });
});
