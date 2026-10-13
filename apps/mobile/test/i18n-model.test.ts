import { describe, expect, it } from 'vitest';

import { translate, type TranslationKey } from '../src/lib/i18n/dictionary';
import { en } from '../src/lib/i18n/en';
import { es } from '../src/lib/i18n/es';
import {
  createLanguageStore,
  interpolate,
  LANGUAGE_STORAGE_KEY,
  languageFromTags,
  parseStoredPreference,
  resolveLanguage,
  type LanguageStorage,
} from '../src/lib/i18n/model';

/** AsyncStorage's two calls over a map, with a way to make either fail. */
function memoryStorage(initial: Record<string, string> = {}, failing = false): LanguageStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async getItem(key) {
      if (failing) throw new Error('storage down');
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      if (failing) throw new Error('storage down');
      map.set(key, value);
    },
  };
}

describe('languageFromTags', () => {
  it('takes the first device locale the app speaks', () => {
    expect(languageFromTags(['es-MX', 'en-US'])).toBe('es');
    expect(languageFromTags(['fr-FR', 'es-ES'])).toBe('es');
    expect(languageFromTags(['en-GB'])).toBe('en');
  });

  it('reads English for a device the app does not speak, or no locales at all', () => {
    expect(languageFromTags(['fr-FR', 'de-DE'])).toBe('en');
    expect(languageFromTags([])).toBe('en');
  });

  it('is not fooled by case or a bare code', () => {
    expect(languageFromTags(['ES'])).toBe('es');
    expect(languageFromTags(['es'])).toBe('es');
  });
});

describe('resolveLanguage and parseStoredPreference', () => {
  it('follows the device under system and the choice otherwise', () => {
    expect(resolveLanguage('system', 'es')).toBe('es');
    expect(resolveLanguage('en', 'es')).toBe('en');
    expect(resolveLanguage('es', 'en')).toBe('es');
  });

  it('reads back only what it wrote', () => {
    expect(parseStoredPreference('system')).toBe('system');
    expect(parseStoredPreference('es')).toBe('es');
    expect(parseStoredPreference('fr')).toBeNull();
    expect(parseStoredPreference(null)).toBeNull();
  });
});

describe('interpolate', () => {
  it('fills the variables it is given and leaves the rest visible', () => {
    expect(interpolate('At least {min} characters', { min: 8 })).toBe('At least 8 characters');
    expect(interpolate('Hello {name}, {missing}', { name: 'Rafa' })).toBe('Hello Rafa, {missing}');
    expect(interpolate('No variables')).toBe('No variables');
  });
});

describe('createLanguageStore', () => {
  it('starts on the device and reads the stored choice', async () => {
    const storage = memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'es' });
    const store = createLanguageStore('en');
    expect(store.language()).toBe('en');
    await store.hydrate(storage);
    expect(store.preference()).toBe('es');
    expect(store.language()).toBe('es');
  });

  it('writes a choice and tells its subscribers', () => {
    const storage = memoryStorage();
    const store = createLanguageStore('en');
    let told = 0;
    store.subscribe(() => told++);
    store.setPreference('es', storage);
    expect(store.language()).toBe('es');
    expect(told).toBe(1);
    expect(storage.map.get(LANGUAGE_STORAGE_KEY)).toBe('es');
  });

  it('lets a choice made before the read answers win', async () => {
    const storage = memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'es' });
    const store = createLanguageStore('en');
    const reading = store.hydrate(storage);
    store.setPreference('en', storage);
    await reading;
    expect(store.preference()).toBe('en');
  });

  it('follows a device change only while on system', () => {
    const store = createLanguageStore('en');
    store.setDevice('es');
    expect(store.language()).toBe('es');
    store.setPreference('en');
    store.setDevice('es');
    expect(store.language()).toBe('en');
  });

  it('survives storage that is down', async () => {
    const storage = memoryStorage({}, true);
    const store = createLanguageStore('es');
    await expect(store.hydrate(storage)).resolves.toBeUndefined();
    store.setPreference('en', storage);
    expect(store.language()).toBe('en');
  });
});

/** Every dotted path to a string in a dictionary. */
function keysOf(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix.slice(0, -1)];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => keysOf(value, `${prefix}${key}.`));
}

describe('the dictionaries', () => {
  const keys = keysOf(en);

  it('say something for every key in every language', () => {
    for (const key of keys) {
      expect(translate('es', key as TranslationKey)).not.toBe(key);
    }
    expect(keysOf(es).sort()).toEqual(keys.sort());
  });

  it('carry the same variables in both languages', () => {
    for (const key of keys) {
      const vars = (sentence: string) => (sentence.match(/\{\w+\}/g) ?? []).sort();
      expect(vars(translate('es', key as TranslationKey))).toEqual(vars(translate('en', key as TranslationKey)));
    }
  });

  it('translate and fill in', () => {
    expect(translate('en', 'signIn.useAtLeast', { min: 8 })).toBe('Use at least 8 characters');
    expect(translate('es', 'signIn.useAtLeast', { min: 8 })).toBe('Usa al menos 8 caracteres');
  });
});
