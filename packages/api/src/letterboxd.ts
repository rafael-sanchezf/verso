/**
 * The Letterboxd import, from the app's side: match the films of an export to
 * the catalog, then write what the user confirmed.
 *
 * The backend is one migration (supabase/migrations/20261012130000_letterboxd_import.sql);
 * the reading of the CSV files and the proposal of a tier order are pure and
 * live in packages/core (letterboxd.ts). This file is the two calls a screen
 * makes in between. What a screen has to know:
 *
 * 1. **Matching is a guess the user checks.** The export carries no TMDB id
 *    (see the note in packages/core), so `matchLetterboxdFilms` resolves by
 *    title and year and says how sure it was in `match`: 'tmdb' is exact,
 *    'title' is the same title with the year within one, 'fuzzy' is a trigram
 *    match the screen should show the user. A null `media_item_id` is a film
 *    the catalog does not know; nothing will be written for it.
 *
 * 2. **The default ranks nothing** (rule 35, decision 35). Without `tiers`,
 *    every matched film is marked watched and its watched dates become diary
 *    rows (`watch_log`); the films then wait in the Ranking banner's drain.
 *
 * 3. **Ranking from stars is the user's choice, and the write is the whole
 *    order.** When the user turned it on and confirmed the draft, `tiers` is
 *    their complete movie ranking, existing films included, and the database
 *    refuses an order that leaves a ranked film out or re-ranks one. Imported
 *    rows are `placed_by = 'prior'` (the stars' guess, shown with ≈) unless
 *    listed in `moved`, the ones the user dragged, which are 'user'.
 *
 * 4. **Nothing is written until then.** Reading the files and matching them
 *    are reads. A user who backs out of the review screen has imported
 *    nothing.
 */

import type { Tier } from '@verso/core';
import type { Client } from './client';
import type { Database, Json } from './database.types';

type Functions = Database['public']['Functions'];

/** Re-adds the nullability that `supabase gen types` drops for set-returning functions. */
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/** What the matcher needs about one film: a key to hand back, and what the file said. */
export interface LetterboxdMatchInput {
  /** Any string unique within the call; the row comes back under it. */
  key: string;
  title: string;
  year: number | null;
  /** From a file in Letterboxd's import format only; null for a real export. */
  tmdbId: number | null;
}

/** How a film was matched. Absent (null on the row) when it was not. */
export type LetterboxdMatchKind = 'tmdb' | 'title' | 'fuzzy';

/**
 * One film's match, column names as the RPC returns them. `cover_image_id`
 * and `external_ids` together satisfy `CoverSourceRow`, so a matched film
 * draws its poster through `coverCandidates` like any other row.
 */
export type LetterboxdMatchRow = Nullable<
  Functions['match_letterboxd_films']['Returns'][number],
  'media_item_id' | 'title' | 'year' | 'cover_image_id' | 'external_ids' | 'genres' | 'match'
>;

/** How many films go to the database per call. An export can hold thousands. */
const MATCH_BATCH = 200;

/**
 * Resolve the films of an export to catalog rows. One row per input, in input
 * order, the catalog columns null where nothing matched.
 */
export async function matchLetterboxdFilms(
  client: Client,
  films: readonly LetterboxdMatchInput[],
): Promise<LetterboxdMatchRow[]> {
  const rows: LetterboxdMatchRow[] = [];

  for (let start = 0; start < films.length; start += MATCH_BATCH) {
    const batch = films.slice(start, start + MATCH_BATCH).map((film) => ({
      key: film.key,
      title: film.title,
      year: film.year,
      tmdb_id: film.tmdbId,
    }));

    const { data, error } = await client.rpc('match_letterboxd_films', {
      p_films: batch as unknown as Json,
    });
    if (error) throw error;
    rows.push(...((data ?? []) as LetterboxdMatchRow[]));
  }

  return rows;
}

/** What became of one film in the upload. See the column comment in the migration. */
export type LetterboxdOutcome = 'ranked' | 'watched' | 'unmatched' | 'skipped';

/** One film of the upload, as the record and the entry write need it. */
export interface LetterboxdImportFilm {
  letterboxdUri: string | null;
  title: string;
  year: number | null;
  /** 0.5 to 5 in half steps, or null. */
  rating: number | null;
  /** `YYYY-MM-DD` each. The latest becomes `finished_at` when the entry has none. */
  watchedDates: readonly string[];
  rewatches: number;
  /** The catalog row, required for ranked and watched, null for unmatched. */
  mediaItemId: string | null;
  outcome: LetterboxdOutcome;
}

export interface LetterboxdImportArgs {
  /** The uploaded files' names, for the record. */
  fileNames: readonly string[];
  films: readonly LetterboxdImportFilm[];
  /**
   * Null or absent for the default import, which ranks nothing; then no film
   * may have the outcome 'ranked'. When the user chose to rank from stars and
   * confirmed: their whole movie ranking, every tier, best first, films
   * already ranked and films being imported together. The database refuses
   * an order that drops a ranked film or includes one it does not know.
   */
  tiers?: Readonly<Record<Tier, readonly string[]>> | null;
  /** The imported films the user dragged on the review: placed_by 'user' rather than 'prior'. */
  moved?: readonly string[];
}

export interface LetterboxdImportResult {
  importId: string;
  ranked: number;
  watched: number;
  unmatched: number;
  skipped: number;
  /** Diary rows written: one per watched date the diary did not already hold. */
  diary: number;
}

/**
 * Write one confirmed import as a single transaction: the films marked played,
 * their watched dates added to the diary, the four movie tiers renumbered from
 * the confirmed order when there is one, the upload recorded.
 *
 * Throws with code 22023 when the order is incomplete or inconsistent, which
 * is a programming error in the caller rather than something to show the
 * user; 28000 when signed out.
 */
export async function applyLetterboxdImport(
  client: Client,
  args: LetterboxdImportArgs,
): Promise<LetterboxdImportResult> {
  const films = args.films.map((film) => ({
    letterboxd_uri: film.letterboxdUri,
    title: film.title,
    year: film.year,
    rating: film.rating,
    watched_dates: [...film.watchedDates],
    rewatches: film.rewatches,
    media_item_id: film.mediaItemId,
    outcome: film.outcome,
  }));

  const { data, error } = await client.rpc('apply_letterboxd_import', {
    p_file_names: [...args.fileNames],
    p_films: films as unknown as Json,
    p_tiers: (args.tiers
      ? {
          loved: [...args.tiers.loved],
          liked: [...args.tiers.liked],
          fine: [...args.tiers.fine],
          disliked: [...args.tiers.disliked],
        }
      : null) as unknown as Json,
    p_moved: [...(args.moved ?? [])],
  });
  if (error) throw error;

  const row = (data ?? [])[0];
  if (!row) throw new Error('apply_letterboxd_import returned no row');

  return {
    importId: row.import_id,
    ranked: row.ranked,
    watched: row.watched,
    unmatched: row.unmatched,
    skipped: row.skipped,
    diary: row.diary,
  };
}
