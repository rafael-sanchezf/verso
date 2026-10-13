/**
 * A sentence as the onboarding's pure modules hand it to a screen: the
 * dictionary key and its variables, which the screen turns into words with
 * `t(sentence.key, sentence.vars)` (spanish-build.md, rule 2).
 *
 * The modules that build these run in the Vitest node environment and must
 * not load the language store (`@/lib/i18n` pulls in expo-localization), so
 * the import below is type-only: it is erased before the tests run.
 */

import type { TranslationKey, TranslationVars } from '../../lib/i18n/dictionary';

export type { TranslationKey };

export interface Sentence {
  readonly key: TranslationKey;
  readonly vars?: TranslationVars;
}
