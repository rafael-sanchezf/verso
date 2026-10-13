/**
 * Said in English, for the tests of the pure modules that return phrases
 * rather than sentences since the Spanish wave (`src/screens/game/phrase.ts`).
 *
 * The tests keep asserting the English the screens show, so a key that points
 * at the wrong sentence fails here the way a wrong sentence used to.
 */

import { translate, type TranslationKey } from '../src/lib/i18n/dictionary';
import { say, sayJoined, type Words } from '../src/screens/game/phrase';

const t = (key: TranslationKey, vars?: Readonly<Record<string, string | number>>) => translate('en', key, vars);

/** A phrase, a key or plain data, in English. */
export function english(words: Words | TranslationKey): string {
  return typeof words === 'string' ? (words.startsWith('browse.') ? t(words as TranslationKey) : words) : say(t, words);
}

/** Parts joined with ` · `, in English. */
export function englishJoined(parts: readonly Words[]): string {
  return sayJoined(t, parts);
}
