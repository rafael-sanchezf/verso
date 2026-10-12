import { expandPlatforms, type PlatformPickId } from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  isFamilyPicked,
  orderedPicks,
  pickShortName,
  picksFromPlatforms,
  toggleFamily,
  togglePick,
} from '../src/screens/onboarding/platform-picks';

const none = new Set<PlatformPickId>();

describe('tapping a family', () => {
  it('picks its first generation', () => {
    expect([...toggleFamily(none, 'playstation')]).toEqual(['ps5']);
    expect([...toggleFamily(none, 'xbox')]).toEqual(['xbox-series']);
    expect([...toggleFamily(none, 'nintendo')]).toEqual(['switch-2']);
    expect([...toggleFamily(none, 'mobile')]).toEqual(['ios']);
  });

  it('picks PC as the tile itself, with nothing further', () => {
    expect([...toggleFamily(none, 'pc')]).toEqual(['pc']);
  });

  it('clears every chip of a picked family and leaves the others alone', () => {
    const picks = new Set<PlatformPickId>(['ps5', 'ps3', 'switch']);
    expect([...toggleFamily(picks, 'playstation')]).toEqual(['switch']);
  });

  it('reads as picked while any of its chips is', () => {
    expect(isFamilyPicked(new Set(['ps3']), 'playstation')).toBe(true);
    expect(isFamilyPicked(new Set(['ps3']), 'xbox')).toBe(false);
  });
});

describe('tapping a chip', () => {
  it('toggles that generation alone', () => {
    const picks = togglePick(new Set(['ps5']), 'ps4');
    expect([...picks].sort()).toEqual(['ps4', 'ps5']);
    expect([...togglePick(picks, 'ps5')]).toEqual(['ps4']);
  });

  it('unpicks the family with its last chip', () => {
    const picks = togglePick(new Set(['ps5']), 'ps5');
    expect(isFamilyPicked(picks, 'playstation')).toBe(false);
  });

  it('never mutates the set it was given', () => {
    const picks = new Set<PlatformPickId>(['ps5']);
    togglePick(picks, 'ps4');
    toggleFamily(picks, 'xbox');
    expect([...picks]).toEqual(['ps5']);
  });
});

describe('orderedPicks', () => {
  it('follows the picker, not the order of the taps', () => {
    const picks = new Set<PlatformPickId>(['pc', 'switch-2', 'ps5']);
    expect(orderedPicks(picks).map((pick) => pick.id)).toEqual(['ps5', 'switch-2', 'pc']);
  });
});

describe('picksFromPlatforms', () => {
  it('reads an empty or missing profile as no picks', () => {
    expect([...picksFromPlatforms([])]).toEqual([]);
    expect([...picksFromPlatforms(null)]).toEqual([]);
  });

  it('round-trips what Continue wrote for the usual picks', () => {
    const cases: PlatformPickId[][] = [
      ['ps5'],
      ['switch-2', 'pc'],
      ['xbox-series', 'ps3'],
      ['ios', 'android'],
      ['playstation-older', 'nintendo-older'],
      ['ps5', 'xbox-360', 'switch', 'pc', 'android'],
    ];
    for (const picks of cases) {
      expect([...picksFromPlatforms(expandPlatforms(picks))].sort()).toEqual([...picks].sort());
    }
  });

  it('does not bring back a fold as a chip the user never tapped', () => {
    // PS5 stores PlayStation 4 too; the PS4 chip stays off.
    expect([...picksFromPlatforms(expandPlatforms(['ps5']))]).toEqual(['ps5']);
    expect([...picksFromPlatforms(expandPlatforms(['switch-2']))]).toEqual(['switch-2']);
    expect([...picksFromPlatforms(expandPlatforms(['xbox-series']))]).toEqual(['xbox-series']);
  });

  it('keeps an older generation picked on its own', () => {
    expect([...picksFromPlatforms(expandPlatforms(['ps4']))]).toEqual(['ps4']);
  });

  it('turns a pick on only when every name it stands for is stored', () => {
    // Windows alone is not the PC pick, which is Windows, Mac and Linux.
    expect([...picksFromPlatforms(['PC (Microsoft Windows)'])]).toEqual([]);
    expect([...picksFromPlatforms(['PC (Microsoft Windows)', 'Mac', 'Linux'])]).toEqual(['pc']);
  });

  it('writes the same list back after a round trip', () => {
    const stored = expandPlatforms(['ps5', 'ps4', 'switch-2']);
    expect(expandPlatforms(picksFromPlatforms(stored))).toEqual(stored);
  });
});

describe('pickShortName', () => {
  const name = (id: PlatformPickId) => pickShortName(orderedPicks(new Set([id]))[0]!);

  it('uses the platform short names', () => {
    expect(name('ps5')).toBe('PS5');
    expect(name('switch-2')).toBe('Switch 2');
    expect(name('xbox-series')).toBe('Xbox Series X|S');
    expect(name('pc')).toBe('PC');
    expect(name('ios')).toBe('iOS');
  });

  it('names an "Older" chip by its family', () => {
    expect(name('playstation-older')).toBe('PlayStation');
    expect(name('nintendo-older')).toBe('Nintendo');
    expect(name('xbox-older')).toBe('Xbox');
  });
});
