/**
 * What an import's answer means for the screen that asked, and the words for
 * the linked state and the candidate rows. No React here.
 *
 * `importSteamLibrary` returns every outcome the app can act on as a value
 * (steam.ts, point 2), so the branching is a switch over four statuses:
 *
 * - `imported`: on to the games the import found (the candidates screen).
 * - `private_profile`: the privacy checklist. Asked again from the checklist
 *   itself, it is a line instead -- the screen is already the answer.
 * - `rate_limited`: one plain line saying when, with a retry.
 * - `not_linked`: one plain line, with a retry.
 *
 * One thing worth knowing before reading the rate-limit line: the database
 * claims the ten-minute slot when an import *starts* (`begin_steam_import`),
 * so an import that came back `private_profile` has spent it. "Try again" on
 * the checklist straight after fixing the settings will usually say "in about
 * nine minutes". That is the backend's rule, said honestly here; changing it is
 * a migration and out of this screen's reach.
 *
 * Pure, relative imports only (`test/steam-import-outcome.test.ts`).
 */

import type { CoverSource, Json, SteamCandidate, SteamImportResult, SteamLink } from '@verso/api';

import { hours, relativeDate } from '../../lib/format';

/** Which screen asked: the Steam screen, or the privacy checklist's "Try again". */
export type ImportAsker = 'steam' | 'privacy';

export type ImportStep =
  | { kind: 'candidates'; playtimeHidden: boolean }
  | { kind: 'privacy' }
  | { kind: 'line'; message: string };

/** Where an import's answer sends the user. */
export function importStep(result: SteamImportResult, asker: ImportAsker): ImportStep {
  switch (result.status) {
    case 'imported':
      return { kind: 'candidates', playtimeHidden: result.playtimeHidden };
    case 'private_profile':
      return asker === 'privacy'
        ? {
            kind: 'line',
            message: "Steam still isn't sharing your games. Check the three settings above, then try again.",
          }
        : { kind: 'privacy' };
    case 'rate_limited':
      return {
        kind: 'line',
        message: `Imports are ten minutes apart. Try again ${retryAfterText(result.retryAfterSeconds)}.`,
      };
    case 'not_linked':
      return { kind: 'line', message: "Steam isn't linked to this account any more." };
  }
}

/** `in about 8 minutes`, from what is left of the ten. */
export function retryAfterText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'now';
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? 'in about a minute' : `in about ${minutes} minutes`;
}

/**
 * The "Last import" value on the linked screen.
 *
 * `lastSyncedAt` is stamped when an import starts, not when it ends, so a
 * failed or private import still moves it (steam.ts, `SteamLink`). The date
 * alone would call a failure a sync; the status word says which it was.
 * `syncStatus` is free text, so anything unknown is simply not mentioned.
 */
export function lastImportText(link: SteamLink, now: Date = new Date()): string {
  if (link.syncStatus === 'importing') return 'In progress';
  const when = relativeDate(link.lastSyncedAt, now);
  if (!when) return 'Never';
  if (link.syncStatus === 'private') return `${when} · Private profile`;
  if (link.syncStatus === 'error') return `${when} · Failed`;
  return when;
}

/**
 * Whether there is a library to show games from: an import has started at
 * least once. A private or failed one leaves whatever the last good one stored,
 * and an empty list is an ordinary answer the candidates screen draws.
 */
export function hasImported(link: SteamLink): boolean {
  return link.lastSyncedAt !== null;
}

/**
 * The hours half of a candidate's subtitle.
 *
 * Zero is Steam's answer both for "never played" and for "total playtime
 * hidden" (steam.ts, point 4), so it is reported as what Steam showed, never as
 * "not played".
 */
export function steamHours(minutes: number): string {
  const figure = hours(minutes);
  return figure === null ? 'No hours on Steam' : `${figure} on Steam`;
}

/** A candidate row's subtitle: `14 h on Steam · 2017`. */
export function candidateSubtitle(candidate: Pick<SteamCandidate, 'playtimeForeverMinutes' | 'year'>): string {
  const parts = [steamHours(candidate.playtimeForeverMinutes)];
  if (candidate.year !== null) parts.push(String(candidate.year));
  return parts.join(' · ');
}

/**
 * The facts `coverCandidates` wants, from a candidate.
 *
 * `externalIds` is the catalog's own blob and normally carries the Steam id
 * already; when it is missing, the candidate's `steamAppId` is the same fact,
 * so the Steam cover fallback still has something to try.
 */
export function candidateCover(candidate: Pick<SteamCandidate, 'coverImageId' | 'externalIds' | 'steamAppId'>): CoverSource {
  return {
    coverImageId: candidate.coverImageId,
    externalIds: (candidate.externalIds ?? { steam: candidate.steamAppId }) as Json,
  };
}

/** Valve's privacy settings for the signed-in Steam user. */
export const STEAM_PRIVACY_SETTINGS_URL = 'https://steamcommunity.com/my/edit/settings';

/** The Steam storefront, for the attribution's link. */
export const STEAM_STORE_URL = 'https://store.steampowered.com/';

/** A SteamID64's public profile page. */
export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}`;
}
