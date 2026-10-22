import { afterEach, describe, expect, it } from 'vitest';

import { translate, type TranslationKey, type TranslationVars } from '../src/lib/i18n/dictionary';
import { languageStore } from '../src/lib/i18n/store';
import { joinedLabel, subtitleFor } from '../src/screens/profile/identity';

/** The screens' `t`, in English: the sentences these tests read are the English dictionary's. */
const say = (key: TranslationKey, vars?: TranslationVars) => translate('en', key, vars);

describe('joinedLabel', () => {
  afterEach(() => languageStore.setPreference('system'));

  it("reads the month and year off an ISO timestamp, in the app's language", () => {
    expect(joinedLabel('2026-09-16T12:00:00.000Z')).toBe('Sep 2026');
    languageStore.setPreference('es');
    expect(joinedLabel('2026-09-16T12:00:00.000Z')).toBe('sept 2026');
  });

  it('is null for a string that is not a date', () => {
    expect(joinedLabel('not-a-date')).toBeNull();
  });
});

describe('subtitleFor', () => {
  it('joins the handle and the joined date when a username is set', () => {
    expect(subtitleFor({ username: 'mara', createdAt: '2026-01-05T00:00:00.000Z' }, say)).toBe(
      '@mara · joined Jan 2026',
    );
  });

  it('is the joined date alone without a username, never an invented handle', () => {
    expect(subtitleFor({ username: null, createdAt: '2026-01-05T00:00:00.000Z' }, say)).toBe(
      'joined Jan 2026',
    );
  });
});
