import { describe, expect, it } from 'vitest';

import { crossesTenRanked, offersSteam, onboardingGate, PC_PLATFORM } from '../src/screens/onboarding/gate';

describe('onboardingGate', () => {
  it('sends a profile with no media to the onboarding', () => {
    expect(onboardingGate({ media: null }, false)).toEqual({ routed: true, newUser: true });
    expect(onboardingGate({ media: [] }, false)).toEqual({ routed: true, newUser: true });
  });

  it('sends a profile with media to the tabs', () => {
    expect(onboardingGate({ media: ['game'] }, false)).toEqual({ routed: true, newUser: false });
  });

  it('routes nobody until the profile has answered', () => {
    expect(onboardingGate(undefined, false)).toEqual({ routed: false, newUser: false });
  });

  it('lets a user whose profile could not be read into the tabs rather than the questionnaire', () => {
    expect(onboardingGate(undefined, true)).toEqual({ routed: true, newUser: false });
  });
});

describe('offersSteam', () => {
  it('offers the link to a PC player with none', () => {
    expect(offersSteam([PC_PLATFORM, 'Mac', 'Linux'], false)).toBe(true);
  });

  it('skips it for everyone else', () => {
    expect(offersSteam([PC_PLATFORM], true)).toBe(false);
    expect(offersSteam(['PlayStation 5'], false)).toBe(false);
    expect(offersSteam([], false)).toBe(false);
    expect(offersSteam(null, false)).toBe(false);
  });

  it('waits for the link to be read', () => {
    expect(offersSteam([PC_PLATFORM], undefined)).toBe(false);
  });
});

describe('crossesTenRanked', () => {
  it('is true for the write that reaches ten', () => {
    expect(crossesTenRanked(9, 10)).toBe(true);
    expect(crossesTenRanked(4, 12)).toBe(true);
  });

  it('is false below ten and once past it', () => {
    expect(crossesTenRanked(8, 9)).toBe(false);
    expect(crossesTenRanked(10, 11)).toBe(false);
  });
});
