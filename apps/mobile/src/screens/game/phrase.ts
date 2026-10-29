/**
 * A sentence as data: a dictionary key and its variables, for the pure modules
 * the node tests load (spanish-build.md, wave 4).
 *
 * Those modules cannot import `@/lib/i18n` (it pulls `expo-localization`), so
 * where one used to return an English sentence it returns a `Phrase` and the
 * component says it with its own `t`. A variable may itself be a phrase (a
 * tier's name), said in the same language first; a word that is data (a title,
 * a date or a month name `format.ts` already wrote) stays a string.
 *
 * No React; relative imports only.
 */

import type { TranslationKey, TranslationVars } from '../../lib/i18n/dictionary';

export interface Phrase {
  key: TranslationKey;
  vars?: Readonly<Record<string, string | number | Phrase>>;
}

/** Text that is either data already (a name, a date) or a phrase to say. */
export type Words = string | Phrase;

/** The `t` a component gets from `useT()`, or `translate` bound to a language in a test. */
export type Say = (key: TranslationKey, vars?: TranslationVars) => string;

/** A phrase as words in the language `t` speaks, its nested phrases first. */
export function say(t: Say, words: Words): string {
  if (typeof words === 'string') return words;
  if (!words.vars) return t(words.key);
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(words.vars)) {
    vars[name] = typeof value === 'object' ? say(t, value) : value;
  }
  return t(words.key, vars);
}

/** Several parts said and joined with the subtitle separator, ` · `. */
export function sayJoined(t: Say, parts: readonly Words[]): string {
  return parts.map((part) => say(t, part)).join(' · ');
}
