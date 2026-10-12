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
 */

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

const BY_NORMALIZED_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(GENRE_DISPLAY_NAMES).map(([name, display]) => [normalize(name), display]),
);

/**
 * The short form for an IGDB genre name, or null when there is no good one.
 * Null is the signal to fall back to the base prompt rather than to name a
 * genre awkwardly.
 */
export function genreDisplayName(genre: string): string | null {
  return BY_NORMALIZED_NAME.get(normalize(genre)) ?? null;
}

/** Whether a genre is one the ranking engine has been told to disregard. */
export function isIgnoredGenre(genre: string, ignoredGenres: readonly string[]): boolean {
  if (ignoredGenres.length === 0) return false;
  const target = normalize(genre);
  return ignoredGenres.some((ignored) => normalize(ignored) === target);
}
