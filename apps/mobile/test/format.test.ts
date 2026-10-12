import { GENRE_DISPLAY_NAMES } from '@verso/core';
import { describe, expect, it } from 'vitest';

import {
  fullDate,
  genreLabel,
  genres,
  hours,
  personalDate,
  platformGlyph,
  platformGlyphs,
  platforms,
  platformShortName,
  playtime,
  relativeDate,
  releaseDate,
  timeToBeat,
} from '../src/lib/format';

/** A fixed "now" so nothing here depends on the day the suite runs. */
const NOW = new Date(2026, 8, 16, 14, 30); // Wednesday 16 September 2026

describe('timeToBeat', () => {
  it('rounds to the nearest hour and marks the figure as approximate', () => {
    expect(timeToBeat(30 * 3600)).toBe('~30 h');
    expect(timeToBeat(22.4 * 3600)).toBe('~22 h');
    expect(timeToBeat(22.6 * 3600)).toBe('~23 h');
  });

  it('never says ~0 h', () => {
    expect(timeToBeat(600)).toBe('~1 h');
  });

  it('has nothing to say without a figure', () => {
    expect(timeToBeat(null)).toBeNull();
    expect(timeToBeat(undefined)).toBeNull();
    expect(timeToBeat(0)).toBeNull();
    expect(timeToBeat(Number.NaN)).toBeNull();
  });
});

describe('playtime', () => {
  it('reads in hours above the hour', () => {
    expect(playtime(14 * 60)).toBe('14 h played');
    expect(playtime(845)).toBe('14 h played');
  });

  it('reads in minutes below it, rather than rounding to zero hours', () => {
    expect(playtime(40)).toBe('40 min played');
    expect(playtime(59)).toBe('59 min played');
    expect(playtime(60)).toBe('1 h played');
  });

  it('has nothing to say without a figure', () => {
    expect(playtime(null)).toBeNull();
    expect(playtime(0)).toBeNull();
  });
});

describe('hours', () => {
  it('drops the trailing word for the game page row', () => {
    expect(hours(14 * 60)).toBe('14 h');
    expect(hours(40)).toBe('40 min');
    expect(hours(null)).toBeNull();
  });
});

describe('releaseDate', () => {
  it('gives the day inside the current year', () => {
    expect(releaseDate('2026-09-24', NOW)).toBe('Sep 24');
    expect(releaseDate('2026-01-04', NOW)).toBe('Jan 4');
  });

  it('gives the month next year', () => {
    expect(releaseDate('2027-02-11', NOW)).toBe('Feb 2027');
  });

  it('gives only the year further out, because the catalog does not know the day', () => {
    expect(releaseDate('2028-01-01', NOW)).toBe('2028');
    expect(releaseDate('2031-06-30', NOW)).toBe('2031');
  });

  it('gives the day for a date that has already passed', () => {
    expect(releaseDate('2026-03-02', NOW)).toBe('Mar 2');
    expect(releaseDate('2020-09-17', NOW)).toBe('Sep 17');
  });

  it('reads a stored date in local time, not UTC', () => {
    // The trap: `new Date('2026-09-24')` is UTC midnight, which is the 23rd in
    // every timezone west of Greenwich.
    expect(releaseDate('2026-09-24', NOW)).toBe('Sep 24');
    expect(releaseDate('2026-01-01', NOW)).toBe('Jan 1');
  });

  it('has nothing to say without a date', () => {
    expect(releaseDate(null, NOW)).toBeNull();
    expect(releaseDate('', NOW)).toBeNull();
    expect(releaseDate('not a date', NOW)).toBeNull();
  });
});

describe('personalDate', () => {
  it('drops the year inside the current one', () => {
    expect(personalDate('2026-09-02', NOW)).toBe('Sep 2');
  });

  it('keeps the year otherwise, in both directions', () => {
    expect(personalDate('2025-09-02', NOW)).toBe('Sep 2, 2025');
    expect(personalDate('2027-01-08', NOW)).toBe('Jan 8, 2027');
  });

  it('accepts a timestamp as well as a date', () => {
    expect(personalDate('2026-09-02T18:04:11.000Z', NOW)).toMatch(/^Sep [23]$/);
  });
});

describe('fullDate', () => {
  it('always carries the year', () => {
    expect(fullDate('2020-09-17')).toBe('Sep 17, 2020');
    expect(fullDate('2026-09-16')).toBe('Sep 16, 2026');
    expect(fullDate(null)).toBeNull();
  });
});

describe('relativeDate', () => {
  it('names today and yesterday', () => {
    expect(relativeDate('2026-09-16', NOW)).toBe('Today');
    expect(relativeDate('2026-09-15', NOW)).toBe('Yesterday');
  });

  it('names the weekday for the rest of the week', () => {
    expect(relativeDate('2026-09-14', NOW)).toBe('Monday');
    expect(relativeDate('2026-09-11', NOW)).toBe('Friday');
    expect(relativeDate('2026-09-10', NOW)).toBe('Thursday');
  });

  it('falls back to the date at a week old', () => {
    expect(relativeDate('2026-09-09', NOW)).toBe('Sep 9');
    expect(relativeDate('2025-12-30', NOW)).toBe('Dec 30, 2025');
  });

  it('does not name a weekday in the future, where it would be ambiguous', () => {
    expect(relativeDate('2026-09-18', NOW)).toBe('Sep 18');
  });

  it('counts calendar days, not 24-hour spans', () => {
    // 23:50 last night is "Yesterday", though it is under an hour ago at 00:30.
    const justAfterMidnight = new Date(2026, 8, 16, 0, 30);
    expect(relativeDate('2026-09-15T23:50:00', justAfterMidnight)).toBe('Yesterday');
  });
});

describe('platforms', () => {
  it('joins with the separator the screen asked for', () => {
    expect(platforms(['PC', 'PS5'])).toBe('PC, PS5');
    expect(platforms(['PC', 'PS5'], ' · ')).toBe('PC · PS5');
  });

  it('shows three and counts the rest', () => {
    expect(platforms(['PC', 'PS5', 'Switch 2', 'Xbox', 'Mac'])).toBe('PC, PS5, Switch 2 +2');
    expect(platforms(['PC', 'PS5', 'Switch 2', 'Xbox'], ' · ')).toBe('PC · PS5 · Switch 2 +1');
  });

  it('shows exactly three without a count', () => {
    expect(platforms(['PC', 'PS5', 'Switch 2'])).toBe('PC, PS5, Switch 2');
  });

  it('has nothing to say without platforms', () => {
    expect(platforms([])).toBeNull();
    expect(platforms(null)).toBeNull();
    expect(platforms(['  ', ''])).toBeNull();
  });

  it('prints the short form of the names the catalog actually stores', () => {
    // What a real `search_games` row looks like, and what the frame draws.
    expect(platforms(['PC (Microsoft Windows)', 'Nintendo Switch 2'])).toBe('PC, Switch 2');
    expect(
      platforms(['Xbox Series X|S', 'PlayStation 3', 'PlayStation 4', 'PC (Microsoft Windows)'], ' \u00b7 '),
    ).toBe('Xbox Series X|S \u00b7 PS3 \u00b7 PS4 +1');
  });
});

describe('platformShortName', () => {
  it('shortens the long forms IGDB stores', () => {
    expect(platformShortName('PC (Microsoft Windows)')).toBe('PC');
    expect(platformShortName('PlayStation 5')).toBe('PS5');
    expect(platformShortName('Nintendo Switch 2')).toBe('Switch 2');
    expect(platformShortName('Nintendo Switch')).toBe('Switch');
    expect(platformShortName('Super Nintendo Entertainment System')).toBe('SNES');
    expect(platformShortName('Sega Mega Drive/Genesis')).toBe('Genesis');
  });

  it('leaves Xbox Series X|S alone', () => {
    // Already short, already Microsoft's own name, and no abbreviation of it
    // is a string anyone says out loud.
    expect(platformShortName('Xbox Series X|S')).toBe('Xbox Series X|S');
    expect(platformShortName('Xbox One')).toBe('Xbox One');
  });

  it('calls the original PlayStation PS1, because there are five of them now', () => {
    expect(platformShortName('PlayStation')).toBe('PS1');
    expect(platformShortName('PlayStation 2')).toBe('PS2');
  });

  it('handles a numbered PlayStation the map has never met', () => {
    expect(platformShortName('PlayStation 6')).toBe('PS6');
  });

  it("drops IGDB's trailing disambiguation on an unknown platform", () => {
    expect(platformShortName('Commodore CDTV (Something)')).toBe('Commodore CDTV');
  });

  it('returns an unknown name exactly as it came, never a guess', () => {
    // Rule 9: a platform we have no short form for keeps its full name rather
    // than being abbreviated into something that might be wrong.
    expect(platformShortName('Sharp X68000')).toBe('Sharp X68000');
    expect(platformShortName('Legacy Computer')).toBe('Legacy Computer');
  });

  it('trims, and gives an empty name back as empty', () => {
    expect(platformShortName('  PlayStation 5  ')).toBe('PS5');
    expect(platformShortName('   ')).toBe('');
  });
});

describe('platformGlyph', () => {
  it('gives a platform its family and its mark', () => {
    expect(platformGlyph('PlayStation 5')).toEqual({
      name: 'PlayStation 5',
      shortName: 'PS5',
      family: 'playstation',
      glyph: 'playstation',
      suffix: '',
    });
  });

  it('maps IGDB’s PC name to the PC family and the Windows mark', () => {
    const pc = platformGlyph('PC (Microsoft Windows)');
    expect(pc.family).toBe('pc');
    expect(pc.glyph).toBe('windows');
    expect(pc.shortName).toBe('PC');
  });

  it('draws the Switch mark for the Switch family and the wordmark for the rest', () => {
    expect(platformGlyph('Nintendo Switch').glyph).toBe('switch');
    expect(platformGlyph('Nintendo Switch 2').glyph).toBe('switch');
    expect(platformGlyph('Nintendo 3DS').glyph).toBe('nintendo');
    expect(platformGlyph('Wii U').glyph).toBe('nintendo');
    // Same family either way; only the mark differs.
    expect(platformGlyph('Nintendo Switch').family).toBe('nintendo');
    expect(platformGlyph('Nintendo 3DS').family).toBe('nintendo');
  });

  it('gives Mac and iOS the same apple and their own families', () => {
    expect(platformGlyph('Mac')).toMatchObject({ family: 'mac', glyph: 'apple' });
    expect(platformGlyph('iOS')).toMatchObject({ family: 'ios', glyph: 'apple' });
  });

  it('knows a PlayStation the map has never met', () => {
    expect(platformGlyph('PlayStation 6')).toMatchObject({
      family: 'playstation',
      glyph: 'playstation',
      shortName: 'PS6',
    });
  });

  it('falls back to no mark and the short name for a platform it has none for', () => {
    // Rule 9: a gamepad and the real name beats borrowing somebody's logo.
    expect(platformGlyph('Sega Mega Drive/Genesis')).toMatchObject({
      family: 'other',
      glyph: null,
      shortName: 'Genesis',
    });
    expect(platformGlyph('Sharp X68000')).toMatchObject({
      family: 'other',
      glyph: null,
      shortName: 'Sharp X68000',
    });
  });

  it('trims, and never has a suffix of its own', () => {
    expect(platformGlyph('  PlayStation 4  ')).toMatchObject({ name: 'PlayStation 4', suffix: '' });
  });
});

describe('platformGlyphs', () => {
  const suffixes = (list: string[]) =>
    Object.fromEntries(platformGlyphs(list).map((glyph) => [glyph.name, glyph.suffix]));

  it('tells two PlayStations apart and leaves a lone one bare', () => {
    expect(suffixes(['PlayStation 4', 'PlayStation 5'])).toEqual({
      'PlayStation 4': '4',
      'PlayStation 5': '5',
    });
    expect(suffixes(['PlayStation 5'])).toEqual({ 'PlayStation 5': '' });
    expect(suffixes(['PlayStation 5', 'PC (Microsoft Windows)', 'Nintendo Switch'])).toEqual({
      'PlayStation 5': '',
      'PC (Microsoft Windows)': '',
      'Nintendo Switch': '',
    });
  });

  it('marks the Switch 2 when the Switch is beside it, and neither otherwise', () => {
    // Rafa 2026-09-16: "2" for Switch 2 next to Switch. The plain Switch is the
    // mark itself, so it says nothing.
    expect(suffixes(['Nintendo Switch', 'Nintendo Switch 2'])).toEqual({
      'Nintendo Switch': '',
      'Nintendo Switch 2': '2',
    });
    expect(suffixes(['Nintendo Switch 2'])).toEqual({ 'Nintendo Switch 2': '' });
  });

  it('names both Xboxes when both are there', () => {
    expect(suffixes(['Xbox One', 'Xbox Series X|S'])).toEqual({
      'Xbox One': 'One',
      'Xbox Series X|S': 'X|S',
    });
  });

  it('separates Mac from iOS, which are two families drawn with one apple', () => {
    expect(suffixes(['Mac', 'iOS'])).toEqual({ Mac: 'Mac', iOS: 'iOS' });
    expect(suffixes(['Mac', 'PC (Microsoft Windows)'])).toEqual({
      Mac: '',
      'PC (Microsoft Windows)': '',
    });
  });

  it('keeps iOS named even on its own, because a lone apple reads as a Mac', () => {
    expect(suffixes(['iOS'])).toEqual({ iOS: 'iOS' });
    expect(suffixes(['iOS', 'Android'])).toEqual({ iOS: 'iOS', Android: '' });
    // The Mac is the reading people already make, so it says nothing.
    expect(suffixes(['Mac'])).toEqual({ Mac: '' });
  });

  it('leaves two Nintendos alone when they already draw different marks', () => {
    expect(suffixes(['Nintendo Switch', 'Nintendo 3DS'])).toEqual({
      'Nintendo Switch': '',
      'Nintendo 3DS': '',
    });
    // Two of the wordmark do need telling apart.
    expect(suffixes(['Nintendo 3DS', 'Nintendo DS'])).toEqual({
      'Nintendo 3DS': '3DS',
      'Nintendo DS': 'DS',
    });
  });

  it('never suffixes a platform with no mark, however many of them there are', () => {
    expect(suffixes(['Sharp X68000', 'Sega Saturn'])).toEqual({
      'Sharp X68000': '',
      'Sega Saturn': '',
    });
  });

  it('keeps the order it was given and drops blanks', () => {
    const list = platformGlyphs(['  Nintendo Switch  ', '   ', 'PlayStation 5']);
    expect(list.map((glyph) => glyph.name)).toEqual(['Nintendo Switch', 'PlayStation 5']);
  });

  it('has nothing to say about nothing', () => {
    expect(platformGlyphs([])).toEqual([]);
    expect(platformGlyphs(null)).toEqual([]);
    expect(platformGlyphs(undefined)).toEqual([]);
  });
});

describe('genres', () => {
  it('shows at most two, in their display names', () => {
    expect(genres(['Shooter', 'Adventure', 'Puzzle'])).toBe('shooter, adventure game');
    expect(genres(['Role-playing (RPG)'])).toBe('RPG');
  });

  it('skips genres with no display name before counting to two', () => {
    // "Indie" describes who made a game, not what it is, so it has no short
    // form in core; dropping it after the slice would have cost a real genre.
    expect(genres(['Indie', 'Shooter', 'Adventure'])).toBe('shooter, adventure game');
  });

  it('has nothing to say when nothing maps', () => {
    expect(genres(['Indie'])).toBeNull();
    expect(genres([])).toBeNull();
    expect(genres(null)).toBeNull();
  });
});

describe('genreLabel', () => {
  it('is the display name with a capital to start it', () => {
    expect(genreLabel('Platform')).toBe('Platformer');
    expect(genreLabel('Adventure')).toBe('Adventure game');
    expect(genreLabel('Simulator')).toBe('Sim');
    expect(genreLabel("Hack and slash/Beat 'em up")).toBe('Hack and slash');
    expect(genreLabel('Point-and-click')).toBe('Point-and-click');
  });

  it('leaves an acronym as it is', () => {
    expect(genreLabel('Role-playing (RPG)')).toBe('RPG');
    expect(genreLabel('MOBA')).toBe('MOBA');
  });

  it('forgives what genreDisplayName forgives', () => {
    expect(genreLabel('  visual NOVEL ')).toBe('Visual novel');
  });

  it('is null for a genre the app does not name', () => {
    expect(genreLabel('Indie')).toBeNull();
    expect(genreLabel('Roguelike')).toBeNull();
    expect(genreLabel('')).toBeNull();
  });

  it('never starts a label with a lower-case letter (entry 2)', () => {
    for (const genre of Object.keys(GENRE_DISPLAY_NAMES)) {
      const label = genreLabel(genre);
      expect(label).not.toBeNull();
      expect(label!.charAt(0)).toBe(label!.charAt(0).toUpperCase());
    }
  });
});
