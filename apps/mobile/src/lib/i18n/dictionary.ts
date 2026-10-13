/**
 * The dictionary's shape and the lookup, with no React and no native import.
 *
 * `Dictionary` is the English dictionary's shape with every leaf widened to
 * `string`, which is what the other languages are typed as. `TranslationKey`
 * is every dotted path to a leaf (`signIn.errors.checkConnection`), so a typo
 * in a key is a compile error rather than a key printed on screen.
 */

import { en } from './en';
import { es } from './es';
import { interpolate, type Language } from './model';

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Dictionary = Widen<typeof en>;

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = Paths<typeof en>;

export type TranslationVars = Readonly<Record<string, string | number>>;

const DICTIONARIES: Readonly<Record<Language, Dictionary>> = { en, es };

function leaf(dictionary: Dictionary, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * The sentence for a key in a language, with its variables filled in.
 *
 * The types make a missing key impossible at compile time; at run time
 * (a key built from a string, a dictionary edited by hand) English is the
 * fallback and the key itself the last resort, so the screen always says
 * something a developer can search for.
 */
export function translate(language: Language, key: TranslationKey, vars?: TranslationVars): string {
  const sentence = leaf(DICTIONARIES[language], key) ?? leaf(en, key) ?? key;
  return interpolate(sentence, vars);
}
