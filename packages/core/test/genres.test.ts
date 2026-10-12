import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IGNORED_GENRES,
  GENRE_DISPLAY_NAMES,
  genreDisplayName,
  isIgnoredGenre,
} from '../src/genres';

/**
 * IGDB's genre list, verbatim, 23 entries as of 2026-09. Written out here so
 * that a genre IGDB adds or renames shows up as a failing test rather than as
 * a silently generic prompt.
 */
const IGDB_GENRES = [
  'Adventure',
  'Arcade',
  'Card & Board Game',
  'Fighting',
  "Hack and slash/Beat 'em up",
  'Indie',
  'MOBA',
  'Music',
  'Pinball',
  'Platform',
  'Point-and-click',
  'Puzzle',
  'Quiz/Trivia',
  'Racing',
  'Real Time Strategy (RTS)',
  'Role-playing (RPG)',
  'Shooter',
  'Simulator',
  'Sport',
  'Strategy',
  'Tactical',
  'Turn-based strategy (TBS)',
  'Visual Novel',
];

describe('GENRE_DISPLAY_NAMES', () => {
  it('names every IGDB genre except the ignored one', () => {
    const named = IGDB_GENRES.filter((genre) => genreDisplayName(genre) !== null);
    const unnamed = IGDB_GENRES.filter((genre) => genreDisplayName(genre) === null);
    expect(named).toHaveLength(22);
    expect(unnamed).toEqual(['Indie']);
    expect(Object.keys(GENRE_DISPLAY_NAMES)).toHaveLength(22);
  });

  it('has no key that is not an IGDB genre', () => {
    expect(Object.keys(GENRE_DISPLAY_NAMES).filter((k) => !IGDB_GENRES.includes(k))).toEqual([]);
  });

  it('reads as a noun the prompt can swallow whole', () => {
    for (const genre of IGDB_GENRES) {
      const display = genreDisplayName(genre);
      if (display === null) continue;
      expect(display.trim()).toBe(display);
      expect(display).not.toBe('');
      expect(`Which ${display} did you enjoy more?`).toMatch(/^Which .+ did you enjoy more\?$/);
    }
  });

  it('keeps acronyms upper case and everything else lower case', () => {
    expect(genreDisplayName('Role-playing (RPG)')).toBe('RPG');
    expect(genreDisplayName('Real Time Strategy (RTS)')).toBe('RTS');
    expect(genreDisplayName('MOBA')).toBe('MOBA');
    expect(genreDisplayName('Shooter')).toBe('shooter');
    expect(genreDisplayName('Platform')).toBe('platformer');
    expect(genreDisplayName('Simulator')).toBe('sim');
    expect(genreDisplayName('Music')).toBe('rhythm game');
    expect(genreDisplayName("Hack and slash/Beat 'em up")).toBe('hack and slash');
  });
});

describe('genreDisplayName', () => {
  it('returns null for a genre it does not know', () => {
    expect(genreDisplayName('Indie')).toBeNull();
    expect(genreDisplayName('Roguelike')).toBeNull();
    expect(genreDisplayName('')).toBeNull();
  });

  it('forgives case, stray whitespace, and curly apostrophes', () => {
    expect(genreDisplayName('  role-playing (rpg) ')).toBe('RPG');
    expect(genreDisplayName('VISUAL NOVEL')).toBe('visual novel');
    expect(genreDisplayName('Real  Time  Strategy (RTS)')).toBe('RTS');
    expect(genreDisplayName('Hack and slash/Beat ’em up')).toBe('hack and slash');
  });
});

describe('isIgnoredGenre', () => {
  it('ignores Indie by default and nothing else', () => {
    expect(DEFAULT_IGNORED_GENRES).toEqual(['Indie']);
    expect(isIgnoredGenre('Indie', DEFAULT_IGNORED_GENRES)).toBe(true);
    expect(isIgnoredGenre('indie', DEFAULT_IGNORED_GENRES)).toBe(true);
    expect(isIgnoredGenre('Shooter', DEFAULT_IGNORED_GENRES)).toBe(false);
  });

  it('ignores nothing when the list is empty', () => {
    expect(isIgnoredGenre('Indie', [])).toBe(false);
  });
});
