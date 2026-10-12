import { describe, expect, it } from 'vitest';
import {
  BACKWARD_COMPATIBILITY,
  PLATFORM_FAMILIES,
  expandPlatforms,
  platformPick,
  withBackwardCompatible,
  type PlatformPickId,
} from '../src/platforms';

const allNames = PLATFORM_FAMILIES.flatMap((f) => f.picks.flatMap((p) => p.platforms));

describe('PLATFORM_FAMILIES', () => {
  it('lists the five families and their picks as the frame prints them', () => {
    expect(PLATFORM_FAMILIES.map((f) => [f.label, f.picks.map((p) => p.label)])).toEqual([
      ['PlayStation', ['PS5', 'PS4', 'PS3', 'Older']],
      ['Xbox', ['Series X|S', 'One', '360', 'Older']],
      ['Nintendo', ['Switch 2', 'Switch', 'Wii U', '3DS', 'Older']],
      ['PC', ['PC']],
      ['Mobile', ['iOS', 'Android']],
    ]);
  });

  it('asks a generation of every family but PC', () => {
    expect(PLATFORM_FAMILIES.filter((f) => !f.asksGeneration).map((f) => f.id)).toEqual(['pc']);
  });

  it('spells every IGDB name once, non-empty and trimmed', () => {
    expect(new Set(allNames).size).toBe(allNames.length);
    for (const name of allNames) {
      expect(name.length).toBeGreaterThan(0);
      expect(name.trim()).toBe(name);
    }
  });

  it('names every console of the map in the table', () => {
    for (const row of BACKWARD_COMPATIBILITY) {
      expect(allNames).toContain(row.platform);
      for (const older of row.plays) expect(allNames).toContain(older);
    }
  });

  it('gives every pick a distinct id that platformPick finds', () => {
    const picks = PLATFORM_FAMILIES.flatMap((f) => f.picks);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
    for (const p of picks) expect(platformPick(p.id)).toBe(p);
    expect(() => platformPick('ps6' as PlatformPickId)).toThrow('unknown platform pick');
  });
});

describe('the compatibility map, folded in', () => {
  it('PS5 plays the PS4 library', () => {
    expect(expandPlatforms(['ps5'])).toEqual(['PlayStation 5', 'PlayStation 4']);
  });

  it('Xbox Series X|S plays the Xbox One library', () => {
    expect(expandPlatforms(['xbox-series'])).toEqual(['Xbox Series X|S', 'Xbox One']);
  });

  it('Switch 2 plays the Switch library', () => {
    expect(expandPlatforms(['switch-2'])).toEqual(['Nintendo Switch 2', 'Nintendo Switch']);
  });

  it('Wii U plays the Wii library', () => {
    expect(expandPlatforms(['wii-u'])).toEqual(['Wii U', 'Wii']);
  });

  it('3DS plays the DS library, the DSi with it', () => {
    expect(expandPlatforms(['3ds'])).toEqual(['Nintendo 3DS', 'New Nintendo 3DS', 'Nintendo DS', 'Nintendo DSi']);
    expect(withBackwardCompatible(['New Nintendo 3DS'])).toEqual(['New Nintendo 3DS', 'Nintendo DS', 'Nintendo DSi']);
  });

  it('PS2 plays the PS1 library', () => {
    expect(withBackwardCompatible(['PlayStation 2'])).toEqual(['PlayStation 2', 'PlayStation']);
  });

  it('has exactly those six rows, the New 3DS sharing the 3DS row', () => {
    expect(BACKWARD_COMPATIBILITY.map((r) => r.platform)).toEqual([
      'PlayStation 5',
      'Xbox Series X|S',
      'Nintendo Switch 2',
      'Wii U',
      'Nintendo 3DS',
      'New Nintendo 3DS',
      'PlayStation 2',
    ]);
  });
});

describe('the compatibility map, never folded in', () => {
  it('PS3 stays its own pick: not on PS4, not on PS5', () => {
    expect(expandPlatforms(['ps4'])).toEqual(['PlayStation 4']);
    expect(expandPlatforms(['ps5'])).not.toContain('PlayStation 3');
  });

  it('PS2 is not on PS3', () => {
    expect(expandPlatforms(['ps3'])).toEqual(['PlayStation 3']);
  });

  it('Xbox 360 and the original Xbox are not on One or Series', () => {
    expect(expandPlatforms(['xbox-one'])).toEqual(['Xbox One']);
    expect(expandPlatforms(['xbox-series'])).not.toContain('Xbox 360');
    expect(expandPlatforms(['xbox-series'])).not.toContain('Xbox');
  });

  it('GameCube is not on Wii (or on Wii U through it)', () => {
    expect(expandPlatforms(['wii-u'])).not.toContain('Nintendo GameCube');
    expect(withBackwardCompatible(['Wii'])).toEqual(['Wii']);
  });

  it('folds one step only: Switch 2 does not reach past the Switch', () => {
    expect(expandPlatforms(['switch'])).toEqual(['Nintendo Switch']);
    expect(expandPlatforms(['switch-2'])).not.toContain('Wii U');
  });
});

describe('the picks with no generation map', () => {
  it('PC is Windows, Mac and Linux together (a Steam Deck is PC)', () => {
    expect(expandPlatforms(['pc'])).toEqual(['PC (Microsoft Windows)', 'Mac', 'Linux']);
  });

  it('Mobile is iOS and Android, each its own pick', () => {
    expect(expandPlatforms(['ios'])).toEqual(['iOS']);
    expect(expandPlatforms(['android'])).toEqual(['Android']);
  });
});

describe('Older', () => {
  it('is every PlayStation the named picks leave out', () => {
    expect(expandPlatforms(['playstation-older'])).toEqual([
      'PlayStation 2',
      'PlayStation',
      'PlayStation Portable',
      'PlayStation Vita',
      'PlayStation VR',
      'PlayStation VR2',
    ]);
  });

  it('is the original Xbox', () => {
    expect(expandPlatforms(['xbox-older'])).toEqual(['Xbox']);
  });

  it('is every Nintendo the named picks leave out, so classics come with it', () => {
    expect(expandPlatforms(['nintendo-older'])).toEqual([
      'Wii',
      'Nintendo DS',
      'Nintendo DSi',
      'Nintendo GameCube',
      'Nintendo 64',
      'Game Boy Advance',
      'Game Boy Color',
      'Game Boy',
      'Super Nintendo Entertainment System',
      'Super Famicom',
      'Nintendo Entertainment System',
      'Family Computer',
    ]);
  });

  it('covers, with the named picks, every name of its family', () => {
    for (const family of PLATFORM_FAMILIES) {
      const covered = expandPlatforms(family.picks.map((p) => p.id));
      expect(covered.sort()).toEqual(family.picks.flatMap((p) => p.platforms).sort());
    }
  });
});

describe('expandPlatforms', () => {
  it('merges picks without duplicates, in table order whatever the order given', () => {
    expect(expandPlatforms(['switch', 'pc', 'ps5', 'switch-2'])).toEqual([
      'PlayStation 5',
      'PlayStation 4',
      'Nintendo Switch 2',
      'Nintendo Switch',
      'PC (Microsoft Windows)',
      'Mac',
      'Linux',
    ]);
  });

  it('is empty for no picks', () => {
    expect(expandPlatforms([])).toEqual([]);
  });

  it('keeps a name the table does not know, after the known ones', () => {
    expect(withBackwardCompatible(['Sega Saturn', 'PlayStation 5'])).toEqual([
      'PlayStation 5',
      'PlayStation 4',
      'Sega Saturn',
    ]);
  });
});
