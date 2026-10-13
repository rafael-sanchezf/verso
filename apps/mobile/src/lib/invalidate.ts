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
import { invalidateOnboarding, invalidateProfile } from '@verso/api';

import { queryKeys } from './query-keys';

/**
 * The onboarding's two helpers, from `@verso/api` (onboarding-keys.ts, PR #73),
 * re-exported so every screen keeps importing invalidation from here.
 *
 * `invalidateOnboarding`: the deck's pages, the played-not-ranked drain and a
 * batch's guesses, by prefix. `invalidateEntry` and `invalidateRanking` already
 * call it, since every entry write and every ranking write moves a game into or
 * out of the deck and the drain; call it directly only after a write neither
 * covers.
 *
 * `invalidateProfile`: after `setProfilePlatforms` or `setProfileMedia`, the
 * caller's profile (`['profile', 'me']`, by the `['profile']` prefix) and the
 * deck, whose pages are filtered by the platforms.
 */
export { invalidateOnboarding, invalidateProfile };

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
 * After anything in `entries.ts`: status, finished, played-on platforms, hours,
 * dates, notes, remove.
 *
 * The lists a game can enter or leave, the game's own page, and the profile
 * counts that are built from those lists.
 */
export function invalidateEntry(queryClient: QueryClient, id: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.playing(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.backlog(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.upcoming(), ...REFETCH_EVERYTHING });
  void queryClient.invalidateQueries({ queryKey: queryKeys.game(id), ...REFETCH_EVERYTHING });
  // `['profile']` covers stats, recent, and me in one prefix match.
  void queryClient.invalidateQueries({ queryKey: ['profile'], ...REFETCH_EVERYTHING });
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
  void queryClient.invalidateQueries({ queryKey: ['profile'], ...REFETCH_EVERYTHING });
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
 * deck's boost read the ranked list.
 */
export function invalidateRanking(queryClient: QueryClient, id: string): void {
  invalidateEntry(queryClient, id);
  // Prefix match: every medium's `['ranking', medium]`.
  void queryClient.invalidateQueries({ queryKey: ['ranking'], ...REFETCH_EVERYTHING });
  // Prefix match: every `['tier', tier]`.
  void queryClient.invalidateQueries({ queryKey: ['tier'], ...REFETCH_EVERYTHING });
}
