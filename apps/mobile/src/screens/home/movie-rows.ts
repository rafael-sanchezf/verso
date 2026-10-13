/**
 * Movies Home's rows by reason, as words (decision 28; frame `Home · Movies H
 * · Rows by reason` 143:173 and the site's `MoviesHomePhone`): how a row's
 * title is set, which facts a poster carries, and where "See all" goes.
 *
 * - The title: the variable part in italics and the rest plain words
 *   ("Because you loved *Past Lives*"). A title that is nothing but its
 *   variable part, the genre row, is set plain: a one-word title has no plain
 *   part to stand apart from (round seven, as the frame and the site draw
 *   "Horror" and "Comedy"). The genre is printed the way the movie screens
 *   print it ("Sci-fi" for TMDB's "Science Fiction", lib/film.ts).
 * - The facts: the first row's large cards carry four pills (service, genre,
 *   year, duration); the rows under it carry the service alone. The service
 *   is one of the caller's own (`onMyServices`), never a service they do not
 *   have, so a film on none of theirs has no service pill.
 * - "See all": the watchlist row opens the Watchlist, scoped to everywhere so
 *   the list matches the row (the row is the whole watchlist). Every other
 *   row opens its own page (`app/home/row.tsx`): that row's candidates as a
 *   poster grid. They are unseen films, never on the Watchlist, so a
 *   Watchlist filtered by the row's genre would be empty or unrelated. The
 *   row page reads the rows Home already loaded and finds its row with
 *   `findRow`.
 *
 * No React; relative imports only (`test/home-movie-rows.test.ts`).
 */

import type { HomeRow, HomeRowCandidate } from '@verso/api';

import { filmGenreLabel, filmGenreLabels, filmRuntime } from '../../lib/film';

/** One run of a row title: italic or plain. */
export interface TitlePart {
  text: string;
  italic: boolean;
}

/** The title a row prints, in runs; the genre word mapped to the app's label. */
export function rowTitleParts(row: Pick<HomeRow, 'kind' | 'title' | 'variablePart'>): TitlePart[] {
  if (row.kind === 'genre') {
    return [{ text: filmGenreLabel(row.title) ?? row.title, italic: false }];
  }
  const variable = row.variablePart;
  const at = variable ? row.title.lastIndexOf(variable) : -1;
  if (!variable || at < 0 || variable === row.title) return [{ text: row.title, italic: false }];

  const parts: TitlePart[] = [];
  const before = row.title.slice(0, at);
  const after = row.title.slice(at + variable.length);
  if (before !== '') parts.push({ text: before, italic: false });
  parts.push({ text: variable, italic: true });
  if (after !== '') parts.push({ text: after, italic: false });
  return parts;
}

/** The whole title as one string, for the screen reader. */
export function rowTitleText(row: Pick<HomeRow, 'kind' | 'title' | 'variablePart'>): string {
  return rowTitleParts(row)
    .map((part) => part.text)
    .join('');
}

export type CardSize = 'large' | 'small';

/** The site's two card sizes (movie-screens.tsx, `CARD`). */
export const CARD_WIDTH: Readonly<Record<CardSize, number>> = { large: 190, small: 104 };

/** The first row is the large carousel; every row under it is small. */
export function cardSize(rowIndex: number): CardSize {
  return rowIndex === 0 ? 'large' : 'small';
}

/**
 * The service pill: the first of the caller's services the film streams on,
 * by name. Null when it is on none of theirs, or the directory has no name
 * for it yet.
 */
export function servicePill(
  candidate: Pick<HomeRowCandidate, 'onMyServices'>,
  providerNames: ReadonlyMap<number, string>,
): string | null {
  for (const id of candidate.onMyServices) {
    const name = providerNames.get(id);
    if (name) return name;
  }
  return null;
}

/** The pills on a poster's foot, in the site's order; a fact the film lacks is left out. */
export function cardFacts(
  candidate: Pick<HomeRowCandidate, 'onMyServices' | 'genres' | 'year' | 'runtimeMinutes'>,
  size: CardSize,
  providerNames: ReadonlyMap<number, string>,
): string[] {
  const service = servicePill(candidate, providerNames);
  if (size === 'small') return service ? [service] : [];
  return [
    service,
    filmGenreLabels(candidate.genres)[0] ?? null,
    candidate.year === null ? null : String(candidate.year),
    filmRuntime(candidate.runtimeMinutes),
  ].filter((fact): fact is string => fact !== null);
}

/** What names a row across reads: its kind and its variable part (or its title), with where it sat. */
export interface RowRef {
  index: number;
  kind: HomeRow['kind'];
  value: string;
}

/** Where a row's "See all" goes: the Watchlist for the watchlist row, the row's own page for the rest. */
export type SeeAll = { to: 'watchlist' } | { to: 'row'; ref: RowRef };

export function seeAllTarget(row: Pick<HomeRow, 'kind' | 'title' | 'variablePart'>, index: number): SeeAll {
  if (row.kind === 'watchlist') return { to: 'watchlist' };
  return { to: 'row', ref: { index, kind: row.kind, value: row.variablePart ?? row.title } };
}

/**
 * The row a row page is about, in the rows Home loaded: the one at its index
 * when that is still the same row, else the first of its kind and value (a
 * refetch can reorder the rows), else null.
 */
export function findRow<T extends Pick<HomeRow, 'kind' | 'title' | 'variablePart'>>(
  rows: readonly T[],
  ref: RowRef,
): T | null {
  const same = (row: T) => row.kind === ref.kind && (row.variablePart ?? row.title) === ref.value;
  const at = rows[ref.index];
  if (at && same(at)) return at;
  return rows.find(same) ?? null;
}
