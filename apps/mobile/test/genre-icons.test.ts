import { GENRE_DISPLAY_NAMES, genreDisplayName } from '@verso/core';
import { describe, expect, it } from 'vitest';

import { GENRE_ICONS, genreIcon } from '../src/lib/format';

/**
 * The genre icon set (docs/private/phone-feedback.md, entry 3) is a proposal Rafa
 * reacts to, so it will be edited by hand. These are the rules an edit must
 * keep; which icon each genre gets is not tested, because that is taste.
 */

/** Every genre the app shows: the ones `genreDisplayName` has a name for. */
const SHOWN_GENRES = Object.keys(GENRE_DISPLAY_NAMES);

describe('GENRE_ICONS', () => {
  it('gives every genre the app shows an icon', () => {
    const missing = SHOWN_GENRES.filter((genre) => genreIcon(genre) === null);
    expect(missing).toEqual([]);
    expect(SHOWN_GENRES).toHaveLength(22);
  });

  it('gives no two genres the same icon', () => {
    const icons = Object.values(GENRE_ICONS);
    const repeated = icons.filter((icon, index) => icons.indexOf(icon) !== index);
    expect(repeated).toEqual([]);
  });

  it('has no entry for a genre the app does not show', () => {
    const extra = Object.keys(GENRE_ICONS).filter((genre) => genreDisplayName(genre) === null);
    expect(extra).toEqual([]);
    expect(Object.keys(GENRE_ICONS).sort()).toEqual([...SHOWN_GENRES].sort());
  });

  it('borrows no icon the app already means something else by', () => {
    // The shell's own icons: tabs, media, the tools row, hours, the fallback
    // mark for a platform with none. A genre drawn with one of these would
    // say two things at once.
    const taken = [
      'house',
      'search',
      'trophy',
      'layers',
      'user',
      'gamepad-2',
      'book-open',
      'film',
      'tv',
      'play',
      'clock',
      'calendar',
      'star',
      'grid-2x2',
      'list',
      'check',
      'settings',
    ];
    expect(Object.values(GENRE_ICONS).filter((icon) => taken.includes(icon))).toEqual([]);
  });
});

describe('genreIcon', () => {
  it('looks a genre up by its IGDB name', () => {
    expect(genreIcon('Role-playing (RPG)')).toBe('wand-sparkles');
    expect(genreIcon('Fighting')).toBe('swords');
    expect(genreIcon('Puzzle')).toBe('puzzle');
  });

  it('forgives case, spacing, and a curly apostrophe, as the display names do', () => {
    expect(genreIcon('  role-playing (rpg) ')).toBe(genreIcon('Role-playing (RPG)'));
    expect(genreIcon('Hack and slash/Beat ’em up')).toBe(genreIcon("Hack and slash/Beat 'em up"));
  });

  it('is null for a genre the app does not name', () => {
    expect(genreIcon('Indie')).toBeNull();
    expect(genreIcon('Roguelike')).toBeNull();
    expect(genreIcon('')).toBeNull();
  });
});
