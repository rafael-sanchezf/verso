/**
 * The rules of the app's language, with no storage, no React and no native
 * module: which languages exist, how the device's and the person's choice
 * resolve into one, and the store that holds it (spanish-build.md, PR 1).
 *
 * The app is in exactly one language at a time. The person's preference is
 * `system` until they pick one in Settings; `system` follows the device, read
 * once at start and again when Android comes back to the foreground, since
 * Android lets the locale change under a running app. A device set to
 * anything the app does not speak reads English.
 *
 * Relative imports only, for the node test suite (`test/i18n-model.test.ts`);
 * the one package import is a type from @verso/core, erased at run time.
 */

import type { Language } from '@verso/core';

import { createHolder } from '../../screens/onboarding/session/holder';

/**
 * The languages the app speaks. Defined once, in @verso/core, whose words
 * (genre names, platform labels, Steam's phrase) take one (wave 7).
 */
export type { Language };

/** `system` follows the device. */
export type LanguagePreference = 'system' | Language;

/** In the order Settings lists them. */
export const LANGUAGES: readonly Language[] = ['en', 'es'];

/** Where the preference is kept on the device. */
export const LANGUAGE_STORAGE_KEY = 'verso.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** What was stored, if it is a preference; anything else is no answer. */
export function parseStoredPreference(raw: string | null | undefined): LanguagePreference | null {
  if (raw === 'system') return 'system';
  return isLanguage(raw) ? raw : null;
}

/**
 * The language the device asks for, from its locales in the order the person
 * set them: the first one the app speaks, else English. A tag's language is
 * what comes before the first hyphen (`es-MX` is Spanish), lowercase.
 */
export function languageFromTags(tags: readonly string[]): Language {
  for (const tag of tags) {
    const code = tag.split('-')[0]?.toLowerCase();
    if (isLanguage(code)) return code;
  }
  return 'en';
}

/** The one language the app is in, given the preference and the device. */
export function resolveLanguage(preference: LanguagePreference, device: Language): Language {
  return preference === 'system' ? device : preference;
}

/**
 * `{name}` in a template becomes `vars.name`. A name the caller did not pass
 * stays as written, so a missing variable shows up on screen rather than as
 * an empty gap (rule 9: never an empty field that pretends to be a value).
 */
export function interpolate(template: string, vars?: Readonly<Record<string, string | number>>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** The two calls the store needs from AsyncStorage, so the tests can hand it a map. */
export interface LanguageStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface LanguageStore {
  /** The person's choice; `system` before the read answers or when there is none. */
  preference(): LanguagePreference;
  /** What the device asks for. */
  device(): Language;
  /** The language the app is in now. */
  language(): Language;
  /** Choose, and remember it. */
  setPreference(preference: LanguagePreference, storage?: LanguageStorage): void;
  /** The device's locales changed (Android, on foreground) or were first read. */
  setDevice(language: Language): void;
  /** Called after every change to the preference or the device. */
  subscribe(listener: () => void): () => void;
  /** Read the stored preference; resolves once it is in. A choice made before it answers wins. */
  hydrate(storage: LanguageStorage): Promise<void>;
}

interface State {
  preference: LanguagePreference;
  device: Language;
}

/**
 * The persisted holder, after `createMediumStore`. A failed read or write is
 * swallowed: no stored preference follows the device, and a choice that could
 * not be written still holds for the session.
 */
export function createLanguageStore(initialDevice: Language = 'en'): LanguageStore {
  const holder = createHolder<State>({ preference: 'system', device: initialDevice });
  let touched = false;

  return {
    preference: () => holder.get().preference,
    device: () => holder.get().device,
    language: () => resolveLanguage(holder.get().preference, holder.get().device),
    subscribe: holder.subscribe,
    setPreference(preference, storage) {
      touched = true;
      holder.set({ ...holder.get(), preference });
      void storage?.setItem(LANGUAGE_STORAGE_KEY, preference).catch(() => undefined);
    },
    setDevice(device) {
      if (device === holder.get().device) return;
      holder.set({ ...holder.get(), device });
    },
    async hydrate(storage) {
      try {
        const raw = await storage.getItem(LANGUAGE_STORAGE_KEY);
        const stored = parseStoredPreference(raw);
        if (!touched && stored !== null) holder.set({ ...holder.get(), preference: stored });
      } catch {
        // Nothing stored is a fine answer: the device decides.
      }
    },
  };
}
