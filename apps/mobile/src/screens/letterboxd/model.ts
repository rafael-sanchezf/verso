/**
 * Everything the Letterboxd review screen computes, with nothing on screen.
 *
 * The screen gets three things: the films folded out of the files
 * (`foldFilms` in @verso/core), the catalog's answer for each
 * (`matchLetterboxdFilms` in @verso/api), and the user's current movie
 * ranking (four `tierList` calls). This file sorts the films into buckets,
 * lays out the draft ranking from `proposeRanking` as one sortable list,
 * dividers and all, and turns the user's choice back into the arguments
 * `applyLetterboxdImport` wants.
 *
 * The choice is the point (rule 35, decision 35): by default every matched
 * film is marked watched and nothing is ranked. Only when the user turns on
 * "Rank from my stars" does the draft list matter, and then the write carries
 * the whole order as they left it and the films they dragged.
 *
 * Nothing here imports `react-native`, on purpose: the unit suite runs in
 * node (test/letterboxd-model.test.ts). The shape mirrors
 * `screens/ranking/model.ts` closely enough that the drag works the same way,
 * with one difference: every tier has a divider here even when it is empty,
 * because the whole point of the screen is that a film can be dragged into
 * the tier the rating got wrong.
 */

import { coverCandidates, type LetterboxdImportArgs, type LetterboxdImportFilm, type LetterboxdMatchRow, type TierListRow } from '@verso/api';
import { proposeRanking, scoreForPosition, TIERS, type LetterboxdFilm, type ProposalFilm, type Tier } from '@verso/core';

/** The four lists as `tierList` returns them for movies. */
export type MovieTiers = Readonly<Record<Tier, readonly TierListRow[]>>;

export const EMPTY_MOVIE_TIERS: MovieTiers = { loved: [], liked: [], fine: [], disliked: [] };

/** One row of the review list: a film from the import, or one already ranked. */
export interface ReviewRow {
  /** `media_items.id`, which is also the list key. */
  readonly mediaItemId: string;
  readonly kind: 'existing' | 'imported';
  /** The catalog's title, which is what will be ranked. */
  readonly title: string;
  readonly year: number | null;
  /** From `coverCandidates`, best first; empty means the placeholder. */
  readonly candidates: readonly string[];
  /** The Letterboxd rating; null for an existing row. */
  readonly rating: number | null;
  /**
   * The title as the file spelled it, when the match was fuzzy and the two
   * differ. Shown under the row so a wrong match is caught before it is
   * ranked. Null when the match was exact.
   */
  readonly fileTitle: string | null;
}

export type ReviewListItem =
  | { readonly kind: 'divider'; readonly key: string; readonly tier: Tier }
  | { readonly kind: 'film'; readonly key: string; readonly row: ReviewRow };

/** A film from the files with whatever the catalog said about it. */
export interface ReviewFilm {
  readonly film: LetterboxdFilm;
  readonly match: LetterboxdMatchRow | null;
}

/** What the review screen shows and what the write will say. */
export interface Review {
  /** The draft ranking as first proposed. The screen owns the live copy. */
  readonly list: ReviewListItem[];
  /** Matched and rated: marked watched by default, ranked from the stars only if the user chooses. */
  readonly rated: ReviewFilm[];
  /** Matched with no rating: marked watched whatever the choice. */
  readonly watched: ReviewFilm[];
  /** Nothing in the catalog. Named on screen, nothing written. */
  readonly unmatched: ReviewFilm[];
  /** Matched, but already in the ranking (the earned place stays) or a second file row for the same film. */
  readonly skipped: ReviewFilm[];
  /** How many rated rows came from a fuzzy title match. */
  readonly fuzzy: number;
}

/** What the user chose on the review screen. */
export interface ImportChoice {
  /** "Rank from my stars": off by default. */
  readonly rank: boolean;
  /** The imported films the user dragged in the draft. */
  readonly moved: ReadonlySet<string>;
}

export const DEFAULT_CHOICE: ImportChoice = { rank: false, moved: new Set() };

function dividerKey(tier: Tier): string {
  return `divider:${tier}`;
}

function existingRow(row: TierListRow): ReviewRow {
  return {
    mediaItemId: row.media_item_id,
    kind: 'existing',
    title: row.title,
    year: row.year ?? null,
    candidates: coverCandidates({ cover_image_id: row.cover_image_id ?? null, external_ids: row.external_ids ?? null }),
    rating: null,
    fileTitle: null,
  };
}

function importedRow(entry: ReviewFilm, rating: number): ReviewRow {
  const match = entry.match!;
  const title = match.title ?? entry.film.title;
  return {
    mediaItemId: match.media_item_id!,
    kind: 'imported',
    title,
    year: match.year ?? entry.film.year,
    candidates: coverCandidates({ cover_image_id: match.cover_image_id ?? null, external_ids: match.external_ids ?? null }),
    rating,
    fileTitle: match.match === 'fuzzy' && title !== entry.film.title ? entry.film.title : null,
  };
}

/**
 * Sort every film into its bucket and lay the proposal out as one list.
 *
 * A film the user already ranked is skipped whatever the file says: the
 * comparisons already answered it. Two file rows that resolve to the same
 * catalog row (a film logged under two Letterboxd URIs, say) keep the first
 * and skip the second, so no id appears twice in the order.
 */
export function buildReview(
  films: readonly LetterboxdFilm[],
  matches: readonly LetterboxdMatchRow[],
  existing: MovieTiers,
): Review {
  const matchByKey = new Map<string, LetterboxdMatchRow>();
  for (const match of matches) matchByKey.set(match.key, match);

  const existingRows = new Map<string, TierListRow>();
  const existingIds: Record<Tier, string[]> = { loved: [], liked: [], fine: [], disliked: [] };
  for (const tier of TIERS) {
    for (const row of existing[tier]) {
      existingRows.set(row.media_item_id, row);
      existingIds[tier].push(row.media_item_id);
    }
  }

  const rated: ReviewFilm[] = [];
  const watched: ReviewFilm[] = [];
  const unmatched: ReviewFilm[] = [];
  const skipped: ReviewFilm[] = [];
  const seen = new Set<string>();

  for (const film of films) {
    const match = matchByKey.get(film.key) ?? null;
    const entry: ReviewFilm = { film, match };

    if (!match || !match.media_item_id) {
      unmatched.push({ film, match: null });
      continue;
    }
    if (existingRows.has(match.media_item_id) || seen.has(match.media_item_id)) {
      skipped.push(entry);
      continue;
    }
    seen.add(match.media_item_id);
    if (film.rating === null) watched.push(entry);
    else rated.push(entry);
  }

  const ratedById = new Map<string, ReviewFilm>();
  const proposalFilms: ProposalFilm[] = rated.map((entry) => {
    ratedById.set(entry.match!.media_item_id!, entry);
    return {
      id: entry.match!.media_item_id!,
      rating: entry.film.rating!,
      lastWatchedOn: entry.film.watchedDates[entry.film.watchedDates.length - 1] ?? null,
      title: entry.match!.title ?? entry.film.title,
    };
  });

  const proposal = proposeRanking(proposalFilms, existingIds);

  const list: ReviewListItem[] = [];
  let fuzzy = 0;
  for (const tier of TIERS) {
    list.push({ kind: 'divider', key: dividerKey(tier), tier });
    for (const proposed of proposal[tier]) {
      if (proposed.kind === 'existing') {
        list.push({ kind: 'film', key: proposed.id, row: existingRow(existingRows.get(proposed.id)!) });
      } else {
        const entry = ratedById.get(proposed.id)!;
        const row = importedRow(entry, proposed.rating);
        if (entry.match!.match === 'fuzzy') fuzzy += 1;
        list.push({ kind: 'film', key: proposed.id, row });
      }
    }
  }

  return { list, rated, watched, unmatched, skipped, fuzzy };
}

/** What the list says about one row once the dividers are read: where it sits and what it will score. */
export interface RowFacts {
  readonly tier: Tier;
  /** Position within the tier, 0 best. */
  readonly position: number;
  /** Global rank across the four tiers, 1 best. */
  readonly rank: number;
  /** From `scoreForPosition` over the tier as the list currently stands. */
  readonly score: number;
}

/**
 * The tier and position of every film, read off the dividers above it, the
 * same way `dropTarget` does on the Ranking tab. A row above the first divider
 * cannot happen here (the list starts with one) but would count as Loved.
 */
export function placedTiers(list: readonly ReviewListItem[]): Record<Tier, string[]> {
  const tiers: Record<Tier, string[]> = { loved: [], liked: [], fine: [], disliked: [] };
  let tier: Tier = 'loved';
  for (const entry of list) {
    if (entry.kind === 'divider') tier = entry.tier;
    else tiers[tier].push(entry.key);
  }
  return tiers;
}

/** The rank, position and score of every film as the list currently stands, by key. */
export function rowFacts(list: readonly ReviewListItem[]): Map<string, RowFacts> {
  const tiers = placedTiers(list);
  const facts = new Map<string, RowFacts>();
  let rank = 0;
  for (const tier of TIERS) {
    const ids = tiers[tier];
    ids.forEach((id, position) => {
      rank += 1;
      facts.set(id, { tier, position, rank, score: scoreForPosition(tier, position, ids.length) });
    });
  }
  return facts;
}

function filmOf(entry: ReviewFilm, outcome: LetterboxdImportFilm['outcome']): LetterboxdImportFilm {
  return {
    letterboxdUri: entry.film.uri,
    title: entry.film.title,
    year: entry.film.year,
    rating: entry.film.rating,
    watchedDates: entry.film.watchedDates,
    rewatches: entry.film.rewatches,
    mediaItemId: entry.match?.media_item_id ?? null,
    outcome,
  };
}

/**
 * The write, from the review, the list as the user left it, and their choice.
 * Every film in the files is in the result with its outcome. Without "Rank
 * from my stars" the rated films are watched like the rest and there is no
 * order, so nothing is ranked; with it, the order is the whole movie ranking,
 * which is what the database insists on, and `moved` names the dragged films.
 */
export function applyArgs(
  review: Review,
  list: readonly ReviewListItem[],
  fileNames: readonly string[],
  choice: ImportChoice = DEFAULT_CHOICE,
): LetterboxdImportArgs {
  const films = [
    ...review.rated.map((entry) => filmOf(entry, choice.rank ? 'ranked' : 'watched')),
    ...review.watched.map((entry) => filmOf(entry, 'watched')),
    ...review.unmatched.map((entry) => filmOf(entry, 'unmatched')),
    ...review.skipped.map((entry) => filmOf(entry, 'skipped')),
  ];
  if (!choice.rank) return { fileNames, films, tiers: null, moved: [] };

  const rated = new Set(review.rated.map((entry) => entry.match!.media_item_id!));
  return {
    fileNames,
    films,
    tiers: placedTiers(list),
    moved: [...choice.moved].filter((id) => rated.has(id)),
  };
}

/**
 * The film a drop moved, from the sortable's result: the item now at
 * `toIndex`. Null for a divider, which cannot be picked up anyway.
 */
export function droppedKey(list: readonly ReviewListItem[], toIndex: number): string | null {
  const entry = list[toIndex];
  return entry?.kind === 'film' ? entry.key : null;
}

/**
 * VoiceOver's "Move up" and "Move down": the film swaps with its neighbour,
 * a divider included, so moving up past a tier line changes the tier, the way
 * a drag across it does. Never above the first divider. Returns the same list
 * when the move cannot happen.
 */
export function moveInList(list: readonly ReviewListItem[], key: string, delta: -1 | 1): ReviewListItem[] {
  const from = list.findIndex((entry) => entry.key === key);
  const to = from + delta;
  if (from < 0 || to < 1 || to >= list.length) return [...list];
  const next = [...list];
  next[from] = list[to]!;
  next[to] = list[from]!;
  return next;
}

/** "42 films" / "1 film". */
export function filmCount(n: number): string {
  return `${n} ${n === 1 ? 'film' : 'films'}`;
}

/** The one line above the list, for the choice as it stands. */
export function reviewHeadline(review: Review, rank = false): string {
  const parts = rank
    ? [`${filmCount(review.rated.length)} to rank`, ...(review.watched.length > 0 ? [`${review.watched.length} watched, unrated`] : [])]
    : [`${filmCount(review.rated.length + review.watched.length)} to mark watched`];
  if (review.unmatched.length > 0) parts.push(`${review.unmatched.length} not found`);
  return parts.join(' · ');
}

/** How many diary dates the files carry for the films that will be written. */
export function diaryDates(review: Review): number {
  return [...review.rated, ...review.watched].reduce((sum, entry) => sum + entry.film.watchedDates.length, 0);
}
