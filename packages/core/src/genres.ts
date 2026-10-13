/**
 * IGDB genre names and the short forms the comparison screen says out loud.
 *
 * The catalog mirrors IGDB's `genre.name` verbatim (see packages/catalog/src/map.ts),
 * so those exact strings are the keys here. The values are what reads well inside
 * the prompt: "Which RPG did you enjoy more?", "Which platformer did you enjoy
 * more?". They are short and lower case unless the genre is an acronym, because
 * rule 16 in docs/design/ui-principles.md is "cut words".
 *
 * This covers IGDB's full genre list, 23 entries as of 2026-09. "Indie" is the
 * one genre deliberately left out: it describes who made a game, not what kind
 * of game it is, so it gets no short form and is the default member of
 * `ignoredGenres` in ranking.ts instead. A genre that is missing here (IGDB adds
 * one, or the medium is not games) simply falls back to the base prompt, which
 * is why lookups return null rather than inventing a name.
 *
 * Spanish (wave 7 of docs/design/spanish-build.md) has its own table with the
 * same keys, written as the noun the Spanish prompt swallows whole: "¿Qué RPG
 * disfrutaste más?", "¿Qué juego de plataformas disfrutaste más?". Spanish has
 * no one-word "platformer", so a genre that is a modifier in Spanish carries
 * "juego de" the way English carries "game". The words are the ones
 * Spanish-speaking players use: RPG, shooter and MOBA stay as they are said,
 * point-and-click is "aventura gráfica", fighting is "peleas" (Latin America;
 * Spain says "lucha").
 */

import type { Language } from './language';

/** IGDB genre name to the short form used in the prompt and the cue. */
export const GENRE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  Adventure: 'adventure game',
  Arcade: 'arcade game',
  'Card & Board Game': 'card game',
  Fighting: 'fighting game',
  "Hack and slash/Beat 'em up": 'hack and slash',
  MOBA: 'MOBA',
  Music: 'rhythm game',
  Pinball: 'pinball game',
  Platform: 'platformer',
  'Point-and-click': 'point-and-click',
  Puzzle: 'puzzle game',
  'Quiz/Trivia': 'trivia game',
  Racing: 'racing game',
  'Real Time Strategy (RTS)': 'RTS',
  'Role-playing (RPG)': 'RPG',
  Shooter: 'shooter',
  Simulator: 'sim',
  Sport: 'sports game',
  Strategy: 'strategy game',
  Tactical: 'tactics game',
  'Turn-based strategy (TBS)': 'turn-based strategy game',
  'Visual Novel': 'visual novel',
};

/** The same keys in Latin American Spanish: the noun "¿Qué {noun} disfrutaste más?" says. */
export const GENRE_DISPLAY_NAMES_ES: Readonly<Record<string, string>> = {
  Adventure: 'juego de aventura',
  Arcade: 'juego arcade',
  'Card & Board Game': 'juego de cartas',
  Fighting: 'juego de peleas',
  "Hack and slash/Beat 'em up": 'hack and slash',
  MOBA: 'MOBA',
  Music: 'juego de ritmo',
  Pinball: 'pinball',
  Platform: 'juego de plataformas',
  'Point-and-click': 'aventura gráfica',
  Puzzle: 'juego de puzles',
  'Quiz/Trivia': 'juego de trivia',
  Racing: 'juego de carreras',
  'Real Time Strategy (RTS)': 'RTS',
  'Role-playing (RPG)': 'RPG',
  Shooter: 'shooter',
  Simulator: 'simulador',
  Sport: 'juego de deportes',
  Strategy: 'juego de estrategia',
  Tactical: 'juego táctico',
  'Turn-based strategy (TBS)': 'juego de estrategia por turnos',
  'Visual Novel': 'novela visual',
};

/** Each language's table. A third language is one more table and one more line. */
const DISPLAY_NAMES: Readonly<Record<Language, Readonly<Record<string, string>>>> = {
  en: GENRE_DISPLAY_NAMES,
  es: GENRE_DISPLAY_NAMES_ES,
};

/**
 * Genres that never make two games "same genre" and never attract a pivot.
 *
 * "Indie" is a production model, not a kind of game. Two indie games have no
 * more in common than two games from large studios, so a shared "Indie" tag is
 * a false genre match: it would pull the pivot away from the midpoint and make
 * the screen claim a kinship the player does not feel.
 */
export const DEFAULT_IGNORED_GENRES: readonly string[] = ['Indie'];

/**
 * Compare genre names forgivingly: case, surrounding and repeated whitespace,
 * and curly apostrophes are all noise. IGDB's own "Hack and slash/Beat 'em up"
 * is the reason for the apostrophe rule, since a typographic apostrophe
 * survives a surprising number of round trips through spreadsheets and JSON.
 */
function normalize(genre: string): string {
  return genre
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const BY_NORMALIZED_NAME: Readonly<Record<Language, ReadonlyMap<string, string>>> = {
  en: byNormalizedName(DISPLAY_NAMES.en),
  es: byNormalizedName(DISPLAY_NAMES.es),
};

function byNormalizedName(table: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(Object.entries(table).map(([name, display]) => [normalize(name), display]));
}

/**
 * The short form for an IGDB genre name in a language, or null when there is
 * no good one. Null is the signal to fall back to the base prompt rather than
 * to name a genre awkwardly. English when no language is given.
 */
export function genreDisplayName(genre: string, language: Language = 'en'): string | null {
  return BY_NORMALIZED_NAME[language].get(normalize(genre)) ?? null;
}

/** Whether a genre is one the ranking engine has been told to disregard. */
export function isIgnoredGenre(genre: string, ignoredGenres: readonly string[]): boolean {
  if (ignoredGenres.length === 0) return false;
  const target = normalize(genre);
  return ignoredGenres.some((ignored) => normalize(ignored) === target);
}
