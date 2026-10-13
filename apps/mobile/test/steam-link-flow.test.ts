import { describe, expect, it } from 'vitest';

import { translate, type TranslationKey, type TranslationVars } from '../src/lib/i18n/dictionary';
import {
  failureOf,
  IDLE,
  isBusy,
  linkButtonLabel,
  linkReducer,
  type LinkEvent,
  type LinkPhase,
} from '../src/screens/steam/link-flow';

/** The screens' `t`, in English: the sentences these tests read are the English dictionary's. */
const say = (key: TranslationKey, vars?: TranslationVars) => translate('en', key, vars);

/** The line under the button, in English. */
function failureText(phase: LinkPhase): string | null {
  const key = failureOf(phase);
  return key === null ? null : say(key);
}

/** Any two keys stand in for the start's failures; what the reducer does with them is the point. */
const SERVER: TranslationKey = 'profile.steam.errors.linkNotSetUp';
const BROWSER: TranslationKey = 'profile.steam.link.couldNotOpenSignIn';

/** Run a list of events from idle. */
function run(...events: LinkEvent[]): LinkPhase {
  return events.reduce(linkReducer, IDLE);
}

const START: LinkEvent[] = [{ type: 'start' }, { type: 'opened' }];

describe('the link round trip', () => {
  it('walks idle, starting, in the browser, confirming, linked', () => {
    expect(run({ type: 'start' })).toEqual({ kind: 'starting' });
    expect(run(...START)).toEqual({ kind: 'in-browser' });
    expect(run(...START, { type: 'returned', result: { status: 'ok' } })).toEqual({
      kind: 'confirming',
      returned: { status: 'ok' },
    });
    expect(run(...START, { type: 'returned', result: { status: 'ok' } }, { type: 'confirmed', linked: true })).toEqual({
      kind: 'linked',
    });
  });

  it('ignores a second tap while a trip is under way', () => {
    expect(run({ type: 'start' }, { type: 'start' })).toEqual({ kind: 'starting' });
    expect(run(...START, { type: 'start' })).toEqual({ kind: 'in-browser' });
  });

  it('starts again after a failure', () => {
    const failed = run({ type: 'start' }, { type: 'start-failed', message: SERVER });
    expect(failed).toEqual({ kind: 'failed', message: SERVER });
    expect(linkReducer(failed, { type: 'start' })).toEqual({ kind: 'starting' });
  });

  it('fails when the URL cannot be had or the browser will not open', () => {
    expect(failureOf(run({ type: 'start' }, { type: 'start-failed', message: SERVER }))).toBe(SERVER);
    expect(failureOf(run(...START, { type: 'start-failed', message: BROWSER }))).toBe(BROWSER);
  });
});

describe('the database decides', () => {
  it('a link in the database is a link, whatever the browser said', () => {
    // Android's browser can settle as a plain dismiss before the deep link.
    expect(run(...START, { type: 'returned', result: null }, { type: 'confirmed', linked: true })).toEqual({
      kind: 'linked',
    });
  });

  it('a cancel with no link says nothing', () => {
    const phase = run(
      ...START,
      { type: 'returned', result: { status: 'error', reason: 'cancelled' } },
      { type: 'confirmed', linked: false },
    );
    expect(phase).toEqual(IDLE);
    expect(failureOf(phase)).toBeNull();
  });

  it('a closed browser with no link says nothing', () => {
    expect(run(...START, { type: 'returned', result: null }, { type: 'confirmed', linked: false })).toEqual(IDLE);
  });

  it('an error with no link says the reason’s line', () => {
    const phase = run(
      ...START,
      { type: 'returned', result: { status: 'error', reason: 'already_linked_elsewhere' } },
      { type: 'confirmed', linked: false },
    );
    expect(failureText(phase)).toMatch(/another Verso account/);
  });

  it('an ok with no row says the link did not save', () => {
    const phase = run(...START, { type: 'returned', result: { status: 'ok' } }, { type: 'confirmed', linked: false });
    expect(failureText(phase)).toMatch(/didn't save/);
  });

  it('a failed read says so', () => {
    const phase = run(...START, { type: 'returned', result: { status: 'ok' } }, { type: 'confirm-failed' });
    expect(failureText(phase)).toMatch(/Couldn't check/);
  });
});

describe('two roads back', () => {
  it('reads the link once when the same return arrives twice', () => {
    const once = run(...START, { type: 'returned', result: { status: 'ok' } });
    expect(linkReducer(once, { type: 'returned', result: { status: 'ok' } })).toBe(once);
  });

  it('keeps the return that says more', () => {
    // The browser settled as a dismiss, then the Linking listener heard why.
    const dismissed = run(...START, { type: 'returned', result: null });
    expect(
      linkReducer(dismissed, { type: 'returned', result: { status: 'error', reason: 'state_not_valid' } }),
    ).toEqual({ kind: 'confirming', returned: { status: 'error', reason: 'state_not_valid' } });

    const told = run(...START, { type: 'returned', result: { status: 'ok' } });
    expect(linkReducer(told, { type: 'returned', result: null })).toBe(told);
  });

  it('checks a real return that arrives with no flow waiting', () => {
    // The cold start forwarded by /steam/linked, or a late deep link.
    expect(run({ type: 'returned', result: { status: 'ok' } })).toEqual({
      kind: 'confirming',
      returned: { status: 'ok' },
    });
  });

  it('ignores a browser closing when no flow opened one', () => {
    expect(run({ type: 'returned', result: null })).toEqual(IDLE);
  });

  it('ignores answers that arrive when nothing is being confirmed', () => {
    expect(run({ type: 'confirmed', linked: true })).toEqual(IDLE);
    expect(run({ type: 'confirm-failed' })).toEqual(IDLE);
    expect(run({ type: 'opened' })).toEqual(IDLE);
    expect(run({ type: 'start-failed', message: SERVER })).toEqual(IDLE);
  });
});

describe('isBusy and the button label', () => {
  it('is busy from the tap to the answer', () => {
    expect(isBusy(IDLE)).toBe(false);
    expect(isBusy({ kind: 'starting' })).toBe(true);
    expect(isBusy({ kind: 'in-browser' })).toBe(true);
    expect(isBusy({ kind: 'confirming', returned: null })).toBe(true);
    expect(isBusy({ kind: 'linked' })).toBe(false);
    expect(isBusy({ kind: 'failed', message: SERVER })).toBe(false);
  });

  it('says what it is waiting for', () => {
    expect(linkButtonLabel(IDLE, say)).toBe('Link Steam');
    expect(linkButtonLabel(IDLE, say, 'Link your Steam account')).toBe('Link your Steam account');
    expect(linkButtonLabel({ kind: 'starting' }, say)).toBe('Opening Steam…');
    expect(linkButtonLabel({ kind: 'in-browser' }, say)).toBe('Waiting for Steam…');
    expect(linkButtonLabel({ kind: 'confirming', returned: null }, say)).toBe('Checking the link…');
    expect(linkButtonLabel({ kind: 'failed', message: SERVER }, say)).toBe('Link Steam');
  });
});
