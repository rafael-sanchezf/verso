/**
 * The words on the comparison screen: one prompt, printed above the cards, and
 * the genre cue beside them.
 *
 * Both are pure functions of the insertion state, so the screen renders what
 * the engine already decided instead of working out for itself whether two
 * games are genre peers.
 *
 * The wording is a parameter, not a constant. Open design question 3 in
 * ROADMAP.md is still open: "Which did you enjoy more?" is today's default and
 * "Which would you rather play again tonight?" is still a candidate, and
 * Flickchart's lesson is that changing the question underneath people
 * destabilises their list. Keeping it in one overridable place is what lets the
 * wording be decided later without touching the search.
 *
 * The language is a parameter too (docs/design/spanish-build.md, wave 7): the
 * Spanish asks "¿Cuál disfrutaste más?" and "¿Qué RPG disfrutaste más?", with
 * the genre's noun from core's Spanish table. English when none is given, and
 * an overridden wording wins over either language's default.
 */

import { genreDisplayName } from './genres';
import type { Language } from './language';
import type { InsertionState } from './ranking';

/** Today's default wording. Decided as the default 2026-09-15; still open. */
export const DEFAULT_BASE_PROMPT = 'Which did you enjoy more?';

/** The default wording in each language, for when no genre can be named. */
const BASE_PROMPTS: Readonly<Record<Language, string>> = {
  en: DEFAULT_BASE_PROMPT,
  es: '¿Cuál disfrutaste más?',
};

/** The default base wording in a language: `Which did you enjoy more?`, `¿Cuál disfrutaste más?`. */
export function defaultBasePrompt(language: Language = 'en'): string {
  return BASE_PROMPTS[language];
}

/** Today's default wording when the opponent is a genre peer. */
export function defaultGenrePrompt(genre: string, language: Language = 'en'): string {
  return language === 'es' ? `¿Qué ${genre} disfrutaste más?` : `Which ${genre} did you enjoy more?`;
}

export interface ComparisonPromptOptions {
  /** Wording when no genre can be named. Defaults to the language's base prompt. */
  basePrompt?: string;
  /**
   * Wording when the opponent is a genre peer, built from the genre's short
   * form ("RPG", "platformer"). Defaults to defaultGenrePrompt in the language.
   */
  genrePrompt?: (genre: string) => string;
  /** The language the default wordings and the genre's noun are in. English when absent. */
  language?: Language;
}

/**
 * The genre to show beside the cards, or null for no cue.
 *
 * Null covers three cases that all deserve the plain screen: there is no pivot,
 * the pivot is not a genre peer, and the shared genre has no short form worth
 * printing (IGDB's "Indie" is ignored upstream; a genre IGDB adds later simply
 * has no entry yet). The short form is in the language given, English by default.
 */
export function genreCue(state: InsertionState, language: Language = 'en'): string | null {
  const reason = state.pivotReason;
  if (reason === null || reason.kind !== 'genre') return null;
  return genreDisplayName(reason.genre, language);
}

/**
 * The prompt to print above the cards.
 *
 * Reads the cue rather than the reason, so the prompt and the cue can never
 * disagree: if the screen shows "RPG" beside the cards it asks "Which RPG did
 * you enjoy more?", and if it shows no cue it asks the base question.
 */
export function comparisonPrompt(
  state: InsertionState,
  options: ComparisonPromptOptions = {},
): string {
  const language = options.language ?? 'en';
  const cue = genreCue(state, language);
  if (cue === null) return options.basePrompt ?? defaultBasePrompt(language);
  return options.genrePrompt ? options.genrePrompt(cue) : defaultGenrePrompt(cue, language);
}
