/**
 * The film search's way out of an empty result (VER-158): one button that
 * asks TMDB for the film through the `tmdb-lookup` function (`lookupMovie` in
 * packages/api), which writes it into the catalog, and then the search again.
 *
 * The state belongs to one query: typing something else puts the empty state
 * back to its plain form, and the answer for "coherence" never shows under
 * "coherent". A film the lookup found but the search still does not list (the
 * typed words match TMDB's title only loosely) is opened directly, so the tap
 * always leads somewhere when TMDB had it.
 *
 * No React and no `react-native` import (`test/search-tmdb-lookup.test.ts`).
 */

import type { TranslationKey } from '../../lib/i18n/dictionary';
import type { Phrase } from '../game/phrase';

/** Where one query's lookup stands. */
export type LookupPhase = 'idle' | 'pending' | 'not_found' | 'limited' | 'error';

/** The lookup last asked, and for which query. */
export interface LookupState {
  query: string;
  phase: Exclude<LookupPhase, 'idle'>;
}

/** The phase for the query on screen: idle unless the state is about this very query. */
export function lookupPhase(state: LookupState | null, query: string): LookupPhase {
  return state !== null && state.query === query ? state.phase : 'idle';
}

/** What the empty state says, and the one button it offers, in each phase. */
export interface NoFilmsCopy {
  body: TranslationKey;
  /** The button's label; null when there is nothing left to try. */
  action: Phrase | null;
  /** True while the lookup is out: the button shows it and does nothing. */
  busy: boolean;
}

export function noFilmsCopy(phase: LookupPhase, query: string): NoFilmsCopy {
  const ask: Phrase = { key: 'browse.search.searchTmdb', vars: { query } };
  switch (phase) {
    case 'pending':
      return { body: 'browse.search.noResultsBody', action: { key: 'browse.search.searchingTmdb' }, busy: true };
    case 'not_found':
      return { body: 'browse.search.notOnTmdb', action: null, busy: false };
    case 'limited':
      return { body: 'browse.search.tmdbLimited', action: ask, busy: false };
    case 'error':
      return { body: 'browse.search.tmdbError', action: ask, busy: false };
    case 'idle':
      return { body: 'browse.search.noResultsBody', action: ask, busy: false };
  }
}

/**
 * Whether to open the found film's page after the search has run again: only
 * when the search still does not list it, and only while the field still
 * holds the query that was looked up (somebody who typed on meanwhile has
 * moved on, and a page opening under them would be a surprise).
 */
export function openFound(
  mediaItemId: string,
  hits: readonly { media_item_id: string }[],
  asked: string,
  current: string,
): boolean {
  return asked === current && !hits.some((row) => row.media_item_id === mediaItemId);
}
