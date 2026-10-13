/**
 * The Letterboxd import, up to the point where the catalog is needed: read the
 * export's CSV files, fold them into one record per film, and turn each film's
 * star rating into a proposed place in the four tiers.
 *
 * Nothing here touches a database or a screen, so the whole of it is tested in
 * node (test/letterboxd.test.ts). The catalog match and the write are
 * `matchLetterboxdFilms` and `applyLetterboxdImport` in packages/api.
 *
 * The proposal is only ever a draft the user asked for. Rule 35 holds: the
 * import marks films watched and ranks nothing unless the user turns on
 * "Rank from my stars", sees this proposal, and confirms it (ROADMAP.md
 * decision 35, 2026-10-12).
 *
 * ## The files
 *
 * Letterboxd's "Export your data" is a zip of CSVs. The ones that matter:
 *
 *   ratings.csv   Date, Name, Year, Letterboxd URI, Rating
 *   diary.csv     Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
 *   watched.csv   Date, Name, Year, Letterboxd URI
 *   watchlist.csv Date, Name, Year, Letterboxd URI
 *   reviews.csv   Date, Name, Year, Letterboxd URI, Rating, Rewatch, Review, Tags, Watched Date
 *
 * `Date` is the day the row was logged, not the day the film was watched;
 * only the diary (and reviews) carry a `Watched Date`. `Rating` is 0.5 to 5 in
 * half steps and is blank when the film was logged without one. Note what the
 * export does *not* carry: a TMDB id. docs/research/film-tv-data-sources.md
 * said matching would be exact on `tmdbID`, but that column belongs to the
 * format Letterboxd *accepts* on import (letterboxd.com/about/importing-data),
 * not to the one it exports. Files in that import format are read here too,
 * since other tools produce them, and when a `tmdbID` is present it is used;
 * the export itself is matched on title and year, which is why the confirm
 * screen exists.
 *
 * `watched.csv` and `watchlist.csv` have the same four columns, and a watchlist
 * is the one list that must never mark anything watched. The file name is the
 * only way to tell them apart, so a four-column file whose name says neither
 * is reported as `ambiguous` and left alone rather than guessed at.
 *
 * ## Rating to tier
 *
 * The app's four tiers each own a band of the 0 to 10 scale (`TIER_BANDS`), and
 * a Letterboxd star rating doubled is a 0 to 10 number. So a rating lands in
 * the tier whose band holds twice its value: 4.5 and 5 stars in Loved, 3.5 and
 * 4 in Liked, 2 to 3 in Fine, 0.5 to 1.5 in Didn't like. This is the same
 * scale the app shows beside every ranked item, which is what makes the
 * proposal explainable: "4 stars is an 8, and 8 is Liked".
 *
 * Within a tier the order is by rating, best first. Letterboxd gives nothing to
 * break a tie with, so films with the same rating are ordered most recently
 * watched first — the one you saw last week is the one you can place — and by
 * title after that. That tie order is the part of the proposal most likely to
 * be wrong, and it is the whole reason the confirm screen lets the user drag
 * (ROADMAP.md decision 35).
 *
 * Films the user already has in their ranking keep the place they earned
 * through comparisons: an imported film slots in around them by comparing its
 * doubled rating with the score each existing position already carries
 * (`scoreForPosition`), and on a tie the earned placement wins.
 */

import { TIER_BANDS, TIERS, type Tier } from './model';
import { scoreForPosition } from './ranking';

// CSV ---------------------------------------------------------------------------

/**
 * RFC 4180: fields split on commas, quoted fields may hold commas, newlines
 * and doubled quotes. Letterboxd quotes a field only when it has to, so "Name"
 * is sometimes quoted and sometimes not within one file. A UTF-8 byte order
 * mark and CRLF line endings are both tolerated; a trailing newline does not
 * make an empty last row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (; i < text.length; i += 1) {
    const ch = text[i]!;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      // CRLF: the \n that follows ends the row.
      if (text[i + 1] !== '\n') endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
  }

  // A last line without a newline still counts; a file ending in one does not
  // produce an empty row.
  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}

// Reading one file --------------------------------------------------------------

/** Which of Letterboxd's files a CSV turned out to be. */
export type LetterboxdFileKind =
  | 'ratings'
  | 'diary'
  | 'reviews'
  | 'watched'
  | 'watchlist'
  /** The format letterboxd.com/about/importing-data accepts, which carries `tmdbID`. */
  | 'import'
  /** Four columns and a file name that says neither watched nor watchlist. Skipped. */
  | 'ambiguous'
  /** Not a Letterboxd file at all. */
  | 'unknown';

/** One row of one file, with the columns every kind shares read into one shape. */
export interface LetterboxdRow {
  /** `Letterboxd URI` (https://boxd.it/…), the only stable id the export has. Null in the import format. */
  uri: string | null;
  title: string;
  year: number | null;
  /** 0.5 to 5 in half steps, or null when the row has no rating. */
  rating: number | null;
  /** `YYYY-MM-DD`, from `Watched Date` (diary, reviews, import format). Null elsewhere. */
  watchedOn: string | null;
  /** `YYYY-MM-DD`, from `Date`: when the row was logged. Orders two ratings of one film. */
  loggedOn: string | null;
  rewatch: boolean;
  /** From the import format's `tmdbID`; null in a real export. */
  tmdbId: number | null;
}

export interface LetterboxdFile {
  name: string;
  kind: LetterboxdFileKind;
  rows: LetterboxdRow[];
  /** Lines that did not read as a film: wrong column count, unparseable rating. Counted, never imported. */
  malformed: number;
}

/** Header names folded to lowercase with the spaces removed, so "Watched Date" and "WatchedDate" agree. */
function foldHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_]+/g, '');
}

function kindOf(headers: string[], fileName: string): LetterboxdFileKind {
  const has = (name: string) => headers.includes(name);

  // The export spells it "Letterboxd URI" and the import format "LetterboxdURI";
  // folded, both are "letterboxduri". What tells the import format apart is its
  // other columns: `Title` where the export has `Name`, `tmdbID`, `Rating10`.
  if (has('letterboxduri') && (has('tmdbid') || has('rating10') || has('title'))) return 'import';

  if (!(has('date') && has('name') && has('year') && has('letterboxduri'))) return 'unknown';

  if (has('review')) return 'reviews';
  if (has('watcheddate')) return 'diary';
  if (has('rating')) return 'ratings';

  const name = fileName.toLowerCase();
  if (name.includes('watchlist')) return 'watchlist';
  if (name.includes('watched')) return 'watched';
  return 'ambiguous';
}

function readRating(raw: string | undefined): number | null | typeof INVALID {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return INVALID;
  // Half steps only, 0.5 to 5. Rating10 (the import format's 1 to 10) is halved
  // by the caller before it gets here.
  if (value < 0.5 || value > 5 || Math.round(value * 2) !== value * 2) return INVALID;
  return value;
}

const INVALID = Symbol('invalid');

function readYear(raw: string | undefined): number | null {
  const text = (raw ?? '').trim();
  if (!/^\d{4}$/.test(text)) return null;
  return Number(text);
}

function readDate(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function readBoolean(raw: string | undefined): boolean {
  const text = (raw ?? '').trim().toLowerCase();
  return text === 'yes' || text === 'true' || text === '1';
}

function readTmdbId(raw: string | undefined): number | null {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Read one CSV as a Letterboxd file. Never throws: a file that is not one comes
 * back as `kind: 'unknown'` with no rows, and a row that cannot be read is
 * counted in `malformed`.
 */
export function readLetterboxdFile(name: string, text: string): LetterboxdFile {
  const table = parseCsv(text);
  const headerRow = table[0];
  if (!headerRow) return { name, kind: 'unknown', rows: [], malformed: 0 };

  const headers = headerRow.map(foldHeader);
  const kind = kindOf(headers, name);
  if (kind === 'unknown' || kind === 'ambiguous' || kind === 'watchlist') {
    return { name, kind, rows: [], malformed: 0 };
  }

  const column = (folded: string): number => headers.indexOf(folded);
  const at = (cells: string[], folded: string): string | undefined => {
    const index = column(folded);
    return index === -1 ? undefined : cells[index];
  };

  const isImport = kind === 'import';
  const rows: LetterboxdRow[] = [];
  let malformed = 0;

  for (const cells of table.slice(1)) {
    // A blank line, which some editors leave at the end.
    if (cells.length === 1 && cells[0] === '') continue;
    if (cells.length !== headers.length) {
      malformed += 1;
      continue;
    }

    const title = (at(cells, isImport ? 'title' : 'name') ?? '').trim();
    if (title === '') {
      malformed += 1;
      continue;
    }

    let rating: number | null | typeof INVALID;
    if (isImport && (at(cells, 'rating') ?? '').trim() === '' && at(cells, 'rating10') !== undefined) {
      const ten = Number((at(cells, 'rating10') ?? '').trim());
      rating = Number.isInteger(ten) && ten >= 1 && ten <= 10 ? ten / 2 : (at(cells, 'rating10') ?? '').trim() === '' ? null : INVALID;
    } else {
      rating = readRating(at(cells, 'rating'));
    }
    if (rating === INVALID) {
      malformed += 1;
      continue;
    }

    rows.push({
      uri: (at(cells, 'letterboxduri') ?? '').trim() || null,
      title,
      year: readYear(at(cells, 'year')),
      rating,
      watchedOn: readDate(at(cells, 'watcheddate')),
      loggedOn: readDate(at(cells, 'date')),
      rewatch: readBoolean(at(cells, 'rewatch')),
      tmdbId: isImport ? readTmdbId(at(cells, 'tmdbid')) : null,
    });
  }

  return { name, kind, rows, malformed };
}

// Folding files into films ------------------------------------------------------

/** One film, as every file that mentioned it agrees. */
export interface LetterboxdFilm {
  /** The URI when the export had one, else the title and year. Unique within one import. */
  key: string;
  uri: string | null;
  title: string;
  year: number | null;
  /** The most recently logged rating, or null when no file rated it. */
  rating: number | null;
  /** Every `Watched Date` seen, oldest first, de-duplicated. Empty for a film only in ratings.csv or watched.csv. */
  watchedDates: string[];
  /** Diary entries beyond the first, or rows flagged Rewatch, whichever is more. */
  rewatches: number;
  tmdbId: number | null;
}

/** Title folded for a key: case and punctuation do not make two films. */
export function foldTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function keyOf(row: LetterboxdRow): string {
  if (row.uri) return row.uri;
  return `${foldTitle(row.title)}|${row.year ?? ''}`;
}

/**
 * Fold the rows of every file into one record per film.
 *
 * Rating: the one logged last. ratings.csv's `Date` is the day the rating was
 * given and diary.csv's is the day the entry was logged, so across both files
 * the latest `Date` is the user's current opinion; Letterboxd itself keeps one
 * rating per film and shows the latest. Rows with no date sort first, so a
 * dated rating always beats an undated one.
 */
export function foldFilms(files: readonly LetterboxdFile[]): LetterboxdFilm[] {
  const films = new Map<string, LetterboxdFilm & { ratedOn: string | null; flaggedRewatches: number }>();

  for (const file of files) {
    for (const row of file.rows) {
      const key = keyOf(row);
      let film = films.get(key);
      if (!film) {
        film = {
          key,
          uri: row.uri,
          title: row.title,
          year: row.year,
          rating: null,
          watchedDates: [],
          rewatches: 0,
          tmdbId: row.tmdbId,
          ratedOn: null,
          flaggedRewatches: 0,
        };
        films.set(key, film);
      }

      if (row.rating !== null) {
        const later = film.rating === null || (row.loggedOn ?? '') >= (film.ratedOn ?? '');
        if (later) {
          film.rating = row.rating;
          film.ratedOn = row.loggedOn;
        }
      }
      if (row.watchedOn && !film.watchedDates.includes(row.watchedOn)) film.watchedDates.push(row.watchedOn);
      if (row.rewatch) film.flaggedRewatches += 1;
      if (film.tmdbId === null && row.tmdbId !== null) film.tmdbId = row.tmdbId;
      if (film.year === null && row.year !== null) film.year = row.year;
    }
  }

  return [...films.values()].map(({ ratedOn: _ratedOn, flaggedRewatches, ...film }) => {
    film.watchedDates.sort();
    return {
      ...film,
      rewatches: Math.max(flaggedRewatches, film.watchedDates.length - 1, 0),
    };
  });
}

// Rating to tier ----------------------------------------------------------------

/** A Letterboxd rating on the app's 0 to 10 scale: twice the stars. */
export function ratingScore(rating: number): number {
  return rating * 2;
}

/** The tier whose band holds the rating. See the header. */
export function tierForRating(rating: number): Tier {
  const score = ratingScore(rating);
  for (const tier of TIERS) {
    if (score >= TIER_BANDS[tier][0]) return tier;
  }
  return 'disliked';
}

/** "★★★★½", the way Letterboxd writes it. */
export function starsText(rating: number): string {
  const full = Math.floor(rating);
  return '★'.repeat(full) + (rating - full >= 0.5 ? '½' : '');
}

// The proposal ------------------------------------------------------------------

/** What the proposal needs to know about one imported, rated film. */
export interface ProposalFilm {
  /** Whatever the caller ranks by; the catalog id once matched. */
  id: string;
  rating: number;
  /** The last watched date, for the tie order. Null sorts last. */
  lastWatchedOn: string | null;
  title: string;
}

export type ProposedRow =
  /** Already in the user's ranking, keeping its earned order. */
  | { kind: 'existing'; id: string }
  /** From the import, placed by its rating. */
  | { kind: 'imported'; id: string; rating: number };

/** The four tiers as the confirm screen first shows them, best first within each. */
export type Proposal = Record<Tier, ProposedRow[]>;

function compareImported(a: ProposalFilm, b: ProposalFilm): number {
  if (a.rating !== b.rating) return b.rating - a.rating;
  const aDate = a.lastWatchedOn ?? '';
  const bDate = b.lastWatchedOn ?? '';
  if (aDate !== bDate) return aDate > bDate ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/**
 * Where every imported film should land, around what the user has already
 * ranked. `existing` is the user's current movie ranking, best first in each
 * tier; a film in it is never moved by the proposal, even if the import rates
 * it — that is the one answer the comparisons already gave.
 */
export function proposeRanking(
  films: readonly ProposalFilm[],
  existing: Readonly<Record<Tier, readonly string[]>>,
): Proposal {
  const ranked = new Set<string>();
  for (const tier of TIERS) for (const id of existing[tier]) ranked.add(id);

  const incoming: Record<Tier, ProposalFilm[]> = { loved: [], liked: [], fine: [], disliked: [] };
  const seen = new Set<string>();
  for (const film of films) {
    if (ranked.has(film.id) || seen.has(film.id)) continue;
    seen.add(film.id);
    incoming[tierForRating(film.rating)].push(film);
  }

  const proposal = {} as Proposal;
  for (const tier of TIERS) {
    const current = existing[tier];
    const size = current.length;
    const fresh = incoming[tier].sort(compareImported);

    const rows: ProposedRow[] = [];
    let next = 0;
    for (let index = 0; index < size; index += 1) {
      const score = scoreForPosition(tier, index, size);
      // Everything rated strictly above this earned place goes before it; a
      // tie keeps the earned place first.
      while (next < fresh.length && ratingScore(fresh[next]!.rating) > score) {
        const film = fresh[next]!;
        rows.push({ kind: 'imported', id: film.id, rating: film.rating });
        next += 1;
      }
      rows.push({ kind: 'existing', id: current[index]! });
    }
    for (; next < fresh.length; next += 1) {
      const film = fresh[next]!;
      rows.push({ kind: 'imported', id: film.id, rating: film.rating });
    }

    proposal[tier] = rows;
  }

  return proposal;
}
