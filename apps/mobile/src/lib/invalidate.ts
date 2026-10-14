/**
 * What to refetch after a write.
 *
 * A single game shows up on most screens at once — Home's Playing block, the
 * backlog, the ranking, the profile's recent list, the game page itself — so
 * "which queries did that change?" is the same question every time and gets
 * one answer here rather than seven. A screen calls the matching helper after
 * its mutation and does not think about the other screens' caches.
 *
 * Both are deliberately broad. Invalidation costs a refetch of data the app
 * already had; a missed invalidation costs a screen that quietly lies until it
 * is remounted, which is much harder to notice and much worse.
 */

import type { QueryClient } from '@tanstack/react-query';
import { invalidateOnboarding } from '@verso/api';
import type { Medium } from '@verso/core';

import { queryKeys } from './query-keys';

/**
 * The onboarding's helper, from `@verso/api` (onboarding-keys.ts, PR #73),
 * re-exported so every screen keeps importing invalidation from here.
 *
 * `invalidateOnboarding`: the deck's pages, the played-not-ranked drain and a
 * batch's guesses, by prefix. `invalidateEntry` and `invalidateRanking` already
 * call it, since every entry write and every ranking write moves a game into or
 * out of the deck and the drain; call it directly only after a write neither
 * covers.
 *
 * `@verso/api` also has an `invalidateProfile`, the profile prefix and the
 * deck; the app's own pair below replaced it (VER-201): `invalidateProfile`
 * for the Profile's reads, by medium when the write knows it, and
 * `invalidateProfileSettings` for the profile writes that also move the deck.
 */
export { invalidateOnboarding };

/**
 * Refetch what was invalidated even when nothing is currently observing it.
 *
 * TanStack's default is `refetchType: 'active'`: a stale query with no active
 * observer is marked and left, to be refetched whenever something mounts on it
 * again. That is the wrong default for this app, and the first real run of the
 * log flow is why. The flow is a form sheet presented over the game page, and
 * react-native-screens freezes the screen underneath a presented sheet — so at
 * the moment `finishInsertion` lands and `invalidateRanking` runs, the game
 * page's `['game', id]` query has no active observer. It was marked stale and
 * never refetched, the sheet dismissed onto it, and the page went on offering
 * "I finished this" for a game that was now ranked #2. It stayed wrong until
 * the page was left and reopened.
 *
 * The comment at the top of this file already said the right thing — "a missed
 * invalidation costs a screen that quietly lies until it is remounted" — and
 * the default was quietly arranging exactly that.
 */
const REFETCH_EVERYTHING = { refetchType: 'all' } as const;

/**
 * Every medium, checked against `Medium` itself: a fourth medium added to the
 * core type fails to compile here until it is listed, so a profile key naming
 * it is never mistaken for one that names no medium.
 */
const MEDIA: Record<Medium, true> = { game: true, movie: true, tv: true };

function isMedium(value: unknown): value is Medium {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MEDIA, value);
}

/**
 * The medium a Profile key belongs to, or null when it is about every medium:
 * `['profile', 'me']`, `['profile', 'recent']` and every key read for `'all'`.
 *
 * Games' stats keep the bare `['profile', 'stats']` (query-keys.ts,
 * `profileStatsFor`), so that one key is games' though it names no medium.
 * Every other per-medium key carries its medium as one of its parts.
 */
export function profileKeyMedium(key: readonly unknown[]): Medium | null {
  if (key[0] !== 'profile') return null;
  if (key.length === 2 && key[1] === 'stats') return 'game';
  return key.slice(1).find(isMedium) ?? null;
}

/**
 * Whether a write to `medium` (or to no one medium, when it is left out) has
 * to refetch this key: every key under `['profile']`, less the ones that
 * belong to another medium. So a film's write refetches the film counts, the
 * film and `'all'` views of the percentile, the hours, Recent and the Activity
 * month, the identity and the recent list, and leaves the games' counts alone.
 */
export function isStaleAfterProfileWrite(key: readonly unknown[], medium?: Medium): boolean {
  if (key[0] !== 'profile') return false;
  if (medium === undefined) return true;
  const owner = profileKeyMedium(key);
  return owner === null || owner === medium;
}

/**
 * After a write that changes what Profile or Activity shows (VER-201): every
 * Profile read for `medium` and for `'all'`, plus the identity and the recent
 * list, refetched now whether or not the page is mounted (`REFETCH_EVERYTHING`
 * above says why). Without a medium, every key under `['profile']`.
 *
 * A predicate rather than a list of keys, so a Profile read added later under
 * `['profile']` is covered without touching this. `invalidateEntry` and
 * `invalidateRanking` call it, so every entry, diary and ranking write reaches
 * it; call it directly after a write neither covers.
 */
export function invalidateProfile(queryClient: QueryClient, medium?: Medium): void {
  void queryClient.invalidateQueries({
    predicate: (query) => isStaleAfterProfileWrite(query.queryKey, medium),
    ...REFETCH_EVERYTHING,
  });
}

/**
 * When Profile, Activity or Edit profile comes back into focus (VER-201): the
 * Profile reads on screen that are stale, invalidated or past the cache's
 * thirty seconds, refetched; fresh ones are left alone.
 *
 * This is the fix for what Rafa saw. The Profile tab mounts once and stays
 * mounted, so `refetchOnMount` never fires on a switch back to it, and a write
 * whose refetch did not reach the tab (under react-native-screens' freeze, a
 * blurred tab's observers can miss it) left the page wrong until a reload.
 * `useRefetchProfileOnFocus` (screens/profile/data.ts) calls this on every
 * focus after the first, which the mount's own fetch covers.
 */
export function refetchStaleProfile(queryClient: QueryClient): Promise<void> {
  return queryClient.refetchQueries({
    predicate: (query) => query.queryKey[0] === 'profile' && query.isStale(),
    type: 'active',
  });
}

/**
 * After a write to the profile row itself: `setProfileMedia` (the onboarding's
 * media step, the switcher's "add a medium"), `setProfilePlatforms`, and Edit
 * profile's save. Every Profile read, since the tracked media decide which
 * sections the page draws, and the deck, whose pages are filtered by the
 * platforms. What `@verso/api`'s `invalidateProfile` did, kept for these.
 */
export function invalidateProfileSettings(queryClient: QueryClient): void {
  invalidateProfile(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['deck'], ...REFETCH_EVERYTHING });
}

/**
 * After anything in `entries.ts`: status, finished, played-on platforms, hours,
 * dates, notes, remove. And the diary's writes in `diary.ts`.
 *
 * The lists a game can enter or leave, the game's own page, and the profile
 * counts that are built from those lists. `medium`, when the caller knows it,
 * narrows only the Profile's refetch to that medium and `'all'`
 * (`invalidateProfile`); every other key is cleared as before.
 */
export function invalidateEntry(queryClient: QueryClient, id: string, medium?: Medium): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.playing(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.backlog(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.upcoming(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.game(id), ...REFETCH_EVERYTHING });
  // Stats, recent, me, the percentile, the hours and Activity: every key under
  // `['profile']`, or that medium's and `'all'`'s when the medium is known.
  invalidateProfile(queryClient, medium);
  // Prefix match: every `['tracked', ids]`. Adding or removing an entry is
  // exactly what flips Search's check, and the key carries a list of ids
  // rather than this one, so there is nothing more specific to invalidate.
  void queryClient.invalidateQueries({ queryKey: ['tracked'], ...REFETCH_EVERYTHING });
  // The deck leaves out every game with an entry, and the drain is the played
  // games with no ranking: a status write can move a game into or out of both.
  invalidateOnboarding(queryClient);
  // The movie screens: the Watchlist, the Calendar, a film's page and diary.
  // A diary row, a planned day or a watchlist write moves a film between all
  // four, and they are cheap reads.
  void queryClient.invalidateQueries({ queryKey: ['movies'], ...REFETCH_EVERYTHING });
  // Marked stale, not refetched: movies Home refetches it on its next focus.
  void queryClient.invalidateQueries({ queryKey: queryKeys.movieHomeRows(), refetchType: 'none' });
}

/**
 * After a movie write that changes the watchlist (want to watch, a log, a
 * removal): movies Home's rows, refetched now if Home is mounted. Every other
 * entry write leaves them stale for Home's next focus (`invalidateEntry`), so
 * a deck that writes thirty films does not re-read Home thirty times.
 */
export function invalidateMovieHome(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.movieHomeRows(), refetchType: 'active' });
}

/**
 * After a write that touched entries this screen cannot name: the JSON import.
 *
 * `invalidateEntry` wants one id and clears that game's page along with the
 * lists. An import creates and updates many entries at once and knows only how
 * many, so the per-id key becomes a prefix: every `['game', …]` rather than one
 * of them.
 *
 * Not the ranking. `importEntries` is entries-only by design — it counts the
 * document's rankings and comparisons as `skipped` and writes neither — so a
 * ranked list that was correct before the import is still correct after it.
 */
export function invalidateAllEntries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.playing(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.backlog(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.upcoming(), ...REFETCH_EVERYTHING });
  // Prefix matches, because the ids are not known here.
  void queryClient.invalidateQueries({ queryKey: ['game'], ...REFETCH_EVERYTHING });
  invalidateProfile(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['tracked'], ...REFETCH_EVERYTHING });
  invalidateOnboarding(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['movies'], ...REFETCH_EVERYTHING });
  // Marked stale, not refetched: movies Home refetches it on its next focus.
  void queryClient.invalidateQueries({ queryKey: queryKeys.movieHomeRows(), refetchType: 'none' });
}

/**
 * After anything in `steam.ts` that writes: a link, an import, an unlink.
 *
 * `['steam']` is the link and the candidates together: an import moves the
 * link's `lastSyncedAt` and replaces the library the candidates are read from,
 * and an unlink removes both. An import that changed playtime on entries
 * (`entriesUpdated` above zero) has also touched rows this screen cannot name,
 * so it clears what the JSON import clears; an unlink keeps the imported hours
 * on the entries (steam.ts, point 5) and leaves them alone.
 */
export function invalidateSteam(queryClient: QueryClient, { entriesChanged = false } = {}): void {
  void queryClient.invalidateQueries({ queryKey: ['steam'], ...REFETCH_EVERYTHING });
  if (entriesChanged) invalidateAllEntries(queryClient);
}

/**
 * After anything in `ranking.ts`: an insertion, a move, a removal.
 *
 * Everything `invalidateEntry` covers, because ranking a game also takes it out
 * of Playing and changes the counts, plus the ranked list itself and the
 * per-tier lists the log flow reads. The onboarding's reads come with
 * `invalidateEntry`: a ranked game leaves the drain, and the guesses and the
 * deck's boost read the ranked list. `medium` narrows the Profile's refetch
 * as in `invalidateEntry`.
 */
export function invalidateRanking(queryClient: QueryClient, id: string, medium?: Medium): void {
  invalidateEntry(queryClient, id, medium);
  // Prefix match: every medium's `['ranking', medium]`.
  void queryClient.invalidateQueries({ queryKey: ['ranking'], ...REFETCH_EVERYTHING });
  // Prefix match: every `['tier', tier]`.
  void queryClient.invalidateQueries({ queryKey: ['tier'], ...REFETCH_EVERYTHING });
}
