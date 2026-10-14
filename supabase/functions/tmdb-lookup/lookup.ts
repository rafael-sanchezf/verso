/**
 * The search-miss lookup: one film fetched from TMDB on demand and written
 * into the mirror, so a title under the popularity threshold
 * (docs/design/film-tv-catalog.md, "Scope") is findable the next time anyone
 * searches for it. VER-158.
 *
 * The flow, everything but the wiring that `index.ts` holds:
 *
 *   1. The per-user meter: at most `perMinute` lookups in any sixty seconds,
 *      counted from the caller's own `events` rows of kind `tmdb_lookup`. The
 *      row is written before TMDB is asked, so a lookup that fails still
 *      counts; the meter protects TMDB's allowance, not the caller's luck.
 *   2. The match: TMDB's movie search, adult results dropped (the request asks
 *      TMDB to leave them out, and one that slips through is dropped here, as
 *      the mirror drops them), then the first result whose title is the query,
 *      else TMDB's first. A caller that already knows the id passes `tmdbId`
 *      and skips the search.
 *   3. The film: the same one request the nightly `tmdb-sync` makes
 *      (`movieDetailPath`), the same keep rule (`keepMovie`), the same mapping
 *      (`mapMovie`), and the same statements (`writeMovieBatch`), imported
 *      from packages/catalog rather than copied, so a film fetched here is
 *      row for row what the mirror would have written.
 *
 * Pure apart from the injected `fetch` and the injected database, so the tests
 * run against fixtures with no network and no stack.
 */

import { keepMovie, mapMovie } from '../../../packages/catalog/src/tmdb-map.ts';
import { movieDetailPath, TMDB_API_BASE, TMDB_LANGUAGE } from '../../../packages/catalog/src/tmdb-paths.ts';
import type { MappedMovie, TmdbMovieDetail } from '../../../packages/catalog/src/tmdb-types.ts';
import {
  emptyTmdbCounts,
  type SqlClient,
  writeMovieBatch,
} from '../../../packages/catalog/src/tmdb-write.ts';

/** Lookups per user per minute unless `TMDB_LOOKUP_PER_MINUTE` says otherwise. */
export const DEFAULT_PER_MINUTE = 5;

/** The window the meter counts over. */
export const WINDOW_MS = 60_000;

/** The `events.kind` a lookup is logged under, and counted by. */
export const LOOKUP_EVENT = 'tmdb_lookup';

/**
 * The regions a looked-up film's availability, certifications and release
 * dates are stored for: the nightly run's default (`--regions US`), so a film
 * that arrived through a search miss carries what every other film carries.
 */
export const LOOKUP_REGIONS: readonly string[] = ['US'];

/** The longest query passed on to TMDB. A title is never this long. */
export const MAX_QUERY_LENGTH = 200;

/** How long one TMDB request may take before the lookup gives up. */
export const TMDB_TIMEOUT_MS = 10_000;

/** What the app sends. */
export interface LookupRequest {
  /** What the person typed. Present unless `tmdbId` is. */
  query: string | null;
  /** A TMDB film id, when the caller already knows it. Skips the search. */
  tmdbId: number | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate the body. Unknown fields are refused, as `suggest` refuses them. */
export function parseLookupRequest(body: unknown): Parsed<LookupRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'the body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'query' && key !== 'tmdbId') return { ok: false, error: `unknown field ${key}` };
  }

  let query: string | null = null;
  if (record.query !== undefined && record.query !== null) {
    if (typeof record.query !== 'string') return { ok: false, error: 'query must be a string' };
    const trimmed = record.query.trim().replace(/\s+/g, ' ');
    if (trimmed.length > MAX_QUERY_LENGTH) {
      return { ok: false, error: `query must be at most ${MAX_QUERY_LENGTH} characters` };
    }
    query = trimmed === '' ? null : trimmed;
  }

  let tmdbId: number | null = null;
  if (record.tmdbId !== undefined && record.tmdbId !== null) {
    if (typeof record.tmdbId !== 'number' || !Number.isInteger(record.tmdbId) || record.tmdbId <= 0) {
      return { ok: false, error: 'tmdbId must be a positive whole number' };
    }
    tmdbId = record.tmdbId;
  }

  if (query === null && tmdbId === null) return { ok: false, error: 'query or tmdbId is required' };
  return { ok: true, value: { query, tmdbId } };
}

/** One entry of `/3/search/movie`, as far as the match reads it. */
export interface TmdbSearchResult {
  id?: number;
  title?: string;
  original_title?: string;
  adult?: boolean;
  video?: boolean;
  poster_path?: string | null;
}

/**
 * A title folded for comparison: case, accents and punctuation gone, spaces
 * collapsed. "Amélie" and "amelie", "Alien: Romulus" and "alien romulus" are
 * the same query.
 */
export function foldTitle(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * The best match among TMDB's results, or null.
 *
 * Dropped first: adult results (the mirror never carries them), `video`
 * records (trailers and concert recordings filed as films, which the mirror's
 * discovery rule skips too), and results with no poster (the keep rule would
 * refuse them after a second request). Of what is left, the first whose title
 * or original title is the query, folded; else the first, because TMDB's own
 * order is already relevance weighted by popularity.
 */
export function bestMatch(results: TmdbSearchResult[], query: string): number | null {
  const usable = results.filter(
    (result) =>
      typeof result.id === 'number' &&
      Number.isInteger(result.id) &&
      result.id > 0 &&
      result.adult !== true &&
      result.video !== true &&
      typeof result.poster_path === 'string' &&
      result.poster_path.length > 0,
  );
  const wanted = foldTitle(query);
  const exact = usable.find(
    (result) => foldTitle(result.title) === wanted || foldTitle(result.original_title) === wanted,
  );
  return (exact ?? usable[0])?.id ?? null;
}

/** TMDB answered something other than a film or a 404. Carries the status, never the URL. */
export class TmdbLookupError extends Error {
  constructor(readonly status: number) {
    super(`TMDB answered ${status}`);
    this.name = 'TmdbLookupError';
  }
}

async function tmdbGet<T>(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
): Promise<T | null> {
  const response = await fetchImpl(`${TMDB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new TmdbLookupError(response.status);
  }
  return (await response.json()) as T;
}

/** The search request: one page, adult titles excluded at the source. */
export function searchPath(query: string): string {
  const params = new URLSearchParams({
    query,
    include_adult: 'false',
    language: TMDB_LANGUAGE,
    page: '1',
  });
  return `/3/search/movie?${params.toString()}`;
}

/** What the function needs from the database, on two connections. */
export interface LookupDb {
  /** The caller's `tmdb_lookup` events since an instant, as the caller (RLS). */
  countRecentLookups(since: string): Promise<number>;
  /** Log one `tmdb_lookup` event as the caller. */
  recordLookup(): Promise<void>;
  /** Write one mapped film into the mirror and hand back its `media_items` uuid. */
  storeMovie(movie: MappedMovie, seenAt: Date): Promise<string>;
}

export interface LookupDeps {
  db: LookupDb;
  fetch: typeof fetch;
  token: string;
  perMinute: number;
  now: () => Date;
  regions?: readonly string[];
}

/** The body of a 200: the film's catalog id, or null when TMDB has nothing the mirror would keep. */
export interface LookupBody {
  mediaItemId: string | null;
  tmdbId: number | null;
}

export type LookupOutcome =
  | { status: 200; body: LookupBody }
  | { status: 429; body: { error: 'rate_limited'; limit: number; used: number; retryAfterSeconds: number } };

export async function lookup(deps: LookupDeps, request: LookupRequest): Promise<LookupOutcome> {
  const now = deps.now();

  const used = await deps.db.countRecentLookups(new Date(now.getTime() - WINDOW_MS).toISOString());
  if (used >= deps.perMinute) {
    return {
      status: 429,
      body: { error: 'rate_limited', limit: deps.perMinute, used, retryAfterSeconds: WINDOW_MS / 1000 },
    };
  }
  await deps.db.recordLookup();

  let tmdbId = request.tmdbId;
  if (tmdbId === null) {
    const query = request.query ?? '';
    const page = await tmdbGet<{ results?: TmdbSearchResult[] }>(deps.fetch, deps.token, searchPath(query));
    tmdbId = bestMatch(page?.results ?? [], query);
    if (tmdbId === null) return { status: 200, body: { mediaItemId: null, tmdbId: null } };
  }

  const detail = await tmdbGet<TmdbMovieDetail>(deps.fetch, deps.token, movieDetailPath(tmdbId));
  if (detail === null || !keepMovie(detail, now)) return { status: 200, body: { mediaItemId: null, tmdbId } };

  const mapped = mapMovie(detail, now, deps.regions ?? LOOKUP_REGIONS);
  if (mapped === null) return { status: 200, body: { mediaItemId: null, tmdbId } };

  const mediaItemId = await deps.db.storeMovie(mapped, now);
  return { status: 200, body: { mediaItemId, tmdbId: mapped.details.tmdb_id } };
}

/**
 * One film into the mirror, in one transaction, through the nightly run's own
 * statements.
 *
 * The advisory lock is the one thing the nightly path does not need: two
 * people can miss on the same film in the same second, and the mirror's
 * identity check (`movie_details.tmdb_id`) and its insert are two halves of
 * one statement that a concurrent transaction could interleave, leaving a
 * second `media_items` row for the same film. The lock is held to the end of
 * the transaction, keyed by the TMDB id, so the second lookup waits, then
 * finds the first one's row and updates it.
 */
export async function storeMovie(client: SqlClient, movie: MappedMovie, seenAt: Date): Promise<string> {
  await client.query('begin');
  try {
    await client.query('select pg_advisory_xact_lock(hashtext($1), $2::integer)', [
      LOOKUP_EVENT,
      movie.details.tmdb_id,
    ]);
    const placed = await writeMovieBatch(client, [movie], seenAt, emptyTmdbCounts());
    const id = placed[0]?.id;
    if (!id) throw new Error(`no media_items id for tmdb ${movie.details.tmdb_id}`);
    await client.query('commit');
    return id;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}

/** A whole number, 0 or more; anything else is the default. 0 turns lookups off. */
export function readPerMinute(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PER_MINUTE;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_PER_MINUTE;
}
