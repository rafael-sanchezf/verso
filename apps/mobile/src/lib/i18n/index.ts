/**
 * The app's language: what the device asks for, what the person chose in
 * Settings, and `t`, which every screen's sentences go through
 * (spanish-build.md, PR 1).
 *
 * The device's locales come from `expo-localization`, read once here and again
 * each time the app comes to the foreground, because Android lets the locale
 * change under a running app (the SDK 57 docs); iOS never does. The person's
 * preference is kept on the device under `verso.language` and read as soon as
 * this module loads, so the sign-in screen is in the right language on the
 * first frame after the splash, which holds for storage anyway.
 *
 * Two ways to ask for a sentence:
 *
 * - `useT()` in a component. It subscribes, so the component re-renders when
 *   the language changes, and the function it returns is a new one per
 *   language, so a `useMemo` or `useCallback` that lists it refreshes too.
 * - `t()` anywhere else: an error mapper, a dialog built in a handler, a
 *   title in a route file. It reads the language at the moment of the call.
 *
 * On web the document's `lang` follows, so the browser hyphenates and
 * spell-checks in the right language and a screen reader switches voice.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { translate, type TranslationKey, type TranslationVars } from './dictionary';
import { languageFromTags, type Language, type LanguagePreference } from './model';
import { languageStore } from './store';

export { LANGUAGES, type Language, type LanguagePreference } from './model';
export type { TranslationKey, TranslationVars } from './dictionary';

function readDevice(): void {
  languageStore.setDevice(languageFromTags(getLocales().map((locale) => locale.languageTag)));
}

readDevice();
void languageStore.hydrate(AsyncStorage);

if (Platform.OS === 'android') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') readDevice();
  });
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const follow = () => {
    document.documentElement.lang = languageStore.language();
  };
  follow();
  languageStore.subscribe(follow);
}

/** The sentence for a key in the app's current language. */
export function t(key: TranslationKey, vars?: TranslationVars): string {
  return translate(languageStore.language(), key, vars);
}

/** The language the app is in, re-rendering when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(languageStore.subscribe, languageStore.language, languageStore.language);
}

/** The person's choice (`system` until they pick one), re-rendering when it changes. */
export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(languageStore.subscribe, languageStore.preference, languageStore.preference);
}

/** Choose a language, or `system` to follow the device again, and remember it. */
export function setLanguagePreference(preference: LanguagePreference): void {
  languageStore.setPreference(preference, AsyncStorage);
}

/** `t`, bound to the current language, for a component. */
export function useT(): (key: TranslationKey, vars?: TranslationVars) => string {
  const language = useLanguage();
  return useCallback((key: TranslationKey, vars?: TranslationVars) => translate(language, key, vars), [language]);
}
