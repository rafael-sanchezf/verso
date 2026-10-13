import type { SteamImportResult, SteamLink } from '@verso/api';
import { describe, expect, it } from 'vitest';

import { translate, type TranslationKey, type TranslationVars } from '../src/lib/i18n/dictionary';
import { functionErrorStatus, importFailureMessage, startFailureMessage } from '../src/screens/steam/errors';
import {
  candidateCover,
  candidateSubtitle,
  hasImported,
  importStep,
  lastImportText,
  retryAfterText,
  steamHours,
  steamProfileUrl,
} from '../src/screens/steam/import-outcome';

/** The screens' `t`, in English: the sentences these tests read are the English dictionary's. */
const say = (key: TranslationKey, vars?: TranslationVars) => translate('en', key, vars);

/** A fixed "now" so nothing here depends on the day the suite runs. */
const NOW = new Date(2026, 9, 7, 15, 0); // Wednesday 7 October 2026

const IMPORTED: SteamImportResult = {
  status: 'imported',
  ownedGames: 120,
  resolved: 96,
  removed: 0,
  entriesUpdated: 4,
  playedPlatformsUpdated: 0,
  playtimeHidden: false,
  fetchedAt: '2026-10-07T14:59:00.000Z',
};

function link(overrides: Partial<SteamLink> = {}): SteamLink {
  return { steamId: '76561197960287930', lastSyncedAt: null, syncStatus: 'linked', ...overrides };
}

/** A Response-shaped context, as supabase-js puts on a FunctionsHttpError. */
function httpError(status: number) {
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: { status },
  });
}

describe('importStep', () => {
  it('sends an import on to the games it found, with the playtime hint', () => {
    expect(importStep(IMPORTED, 'steam', say)).toEqual({ kind: 'candidates', playtimeHidden: false });
    expect(importStep({ ...IMPORTED, playtimeHidden: true }, 'privacy', say)).toEqual({
      kind: 'candidates',
      playtimeHidden: true,
    });
  });

  it('sends a private profile to the checklist, and keeps the checklist where it is', () => {
    expect(importStep({ status: 'private_profile' }, 'steam', say)).toEqual({ kind: 'privacy' });
    const again = importStep({ status: 'private_profile' }, 'privacy', say);
    expect(again.kind).toBe('line');
    expect(again.kind === 'line' && again.message).toMatch(/still isn't sharing/);
  });

  it('says when a rate limit ends', () => {
    expect(importStep({ status: 'rate_limited', retryAfterSeconds: 480 }, 'steam', say)).toEqual({
      kind: 'line',
      message: 'Imports are ten minutes apart. Try again in about 8 minutes.',
    });
  });

  it('says a lost link in one line', () => {
    expect(importStep({ status: 'not_linked' }, 'steam', say)).toEqual({
      kind: 'line',
      message: "Steam isn't linked to this account any more.",
    });
  });
});

describe('retryAfterText', () => {
  it('rounds up to whole minutes', () => {
    expect(retryAfterText(599, say)).toBe('in about 10 minutes');
    expect(retryAfterText(61, say)).toBe('in about 2 minutes');
    expect(retryAfterText(60, say)).toBe('in about a minute');
    expect(retryAfterText(5, say)).toBe('in about a minute');
  });

  it('says now for a window that has already closed or a nonsense figure', () => {
    expect(retryAfterText(0, say)).toBe('now');
    expect(retryAfterText(-3, say)).toBe('now');
    expect(retryAfterText(Number.NaN, say)).toBe('now');
  });
});

describe('lastImportText', () => {
  it('says Never before the first import', () => {
    expect(lastImportText(link(), say, NOW)).toBe('Never');
  });

  it('gives the date of a good one', () => {
    expect(lastImportText(link({ lastSyncedAt: '2026-10-07T14:00:00', syncStatus: 'ok' }), say, NOW)).toBe('Today');
    expect(lastImportText(link({ lastSyncedAt: '2026-09-03T14:00:00', syncStatus: 'ok' }), say, NOW)).toBe('Sep 3');
  });

  it('does not call a failed or private import a sync', () => {
    expect(lastImportText(link({ lastSyncedAt: '2026-10-06T14:00:00', syncStatus: 'private' }), say, NOW)).toBe(
      'Yesterday · Private profile',
    );
    expect(lastImportText(link({ lastSyncedAt: '2026-10-07T14:00:00', syncStatus: 'error' }), say, NOW)).toBe(
      'Today · Failed',
    );
  });

  it('says an import is running, and ignores a status it does not know', () => {
    expect(lastImportText(link({ lastSyncedAt: '2026-10-07T14:00:00', syncStatus: 'importing' }), say, NOW)).toBe(
      'In progress',
    );
    expect(lastImportText(link({ lastSyncedAt: '2026-10-07T14:00:00', syncStatus: 'paused' }), say, NOW)).toBe('Today');
  });
});

describe('hasImported', () => {
  it('is true once an import has started', () => {
    expect(hasImported(link())).toBe(false);
    expect(hasImported(link({ lastSyncedAt: '2026-10-07T14:00:00', syncStatus: 'error' }))).toBe(true);
  });
});

describe('the candidate row', () => {
  it('gives Steam’s hours with their source', () => {
    expect(steamHours(14 * 60 + 10, say)).toBe('14 h on Steam');
    expect(steamHours(40, say)).toBe('40 min on Steam');
  });

  it('never calls a zero "not played", since hidden playtime reads as zero too', () => {
    expect(steamHours(0, say)).toBe('No hours on Steam');
  });

  it('adds the year when the catalog has one', () => {
    expect(candidateSubtitle({ playtimeForeverMinutes: 600, year: 2017 }, say)).toBe('10 h on Steam · 2017');
    expect(candidateSubtitle({ playtimeForeverMinutes: 0, year: null }, say)).toBe('No hours on Steam');
  });

  it('builds its cover from the catalog, or from the Steam id when the catalog has no ids', () => {
    expect(candidateCover({ coverImageId: 'co1', externalIds: { steam: 367520 }, steamAppId: 367520 })).toEqual({
      coverImageId: 'co1',
      externalIds: { steam: 367520 },
    });
    expect(candidateCover({ coverImageId: null, externalIds: null, steamAppId: 367520 })).toEqual({
      coverImageId: null,
      externalIds: { steam: 367520 },
    });
  });

  it('links a SteamID64 to its public profile', () => {
    expect(steamProfileUrl('76561197960287930')).toBe('https://steamcommunity.com/profiles/76561197960287930');
  });
});

describe('a thrown function call', () => {
  it('reads the status supabase-js leaves on the error', () => {
    expect(functionErrorStatus(httpError(503))).toBe(503);
    expect(functionErrorStatus(new Error('offline'))).toBeNull();
    expect(functionErrorStatus(null)).toBeNull();
    expect(functionErrorStatus({ context: null })).toBeNull();
    expect(functionErrorStatus({ context: { status: '503' } })).toBeNull();
  });

  it('says "not set up" for a 503 and "not answering" for Steam’s 502', () => {
    expect(say(importFailureMessage(httpError(503)))).toMatch(/isn't set up/);
    expect(say(importFailureMessage(httpError(502)))).toMatch(/Steam isn't answering/);
    expect(say(startFailureMessage(httpError(503)))).toMatch(/isn't set up/);
  });

  it('falls back to one plain line, never the server’s words', () => {
    expect(say(importFailureMessage(httpError(500)))).toBe(
      "Couldn't import from Steam. Check your connection and try again.",
    );
    expect(say(importFailureMessage(new Error('relation "steam_library" does not exist')))).not.toMatch(/relation/);
    expect(say(startFailureMessage(new TypeError('Network request failed')))).toMatch(/Couldn't open/);
  });
});
