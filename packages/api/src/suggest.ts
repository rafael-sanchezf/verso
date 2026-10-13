/**
 * The ask: three picks with a reason each, from the `suggest` Edge Function,
 * and the plain picks the app shows when the model is not asked.
 *
 * docs/design/recommendation-engine.md ("PR B, the `suggest` Edge Function");
 * the sheet is docs/private/design/movies-build.md, PR 3. What a screen has to
 * know before it calls either:
 *
 * 1. **The daily limit is an answer, not an error.** Over the function's limit
 *    (20 in 24 hours by default) it answers 429 and does nothing else. `suggest`
 *    returns `{ status: 'limit' }` for it, as `steam.ts` returns
 *    `private_profile`, so a screen cannot mistake it for a crash. A throw from
 *    here is something actually broken.
 *
 * 2. **The model only writes the reason.** SQL picks the thirty candidates and
 *    the model chooses three of them; any failure on the model's side comes back
 *    as SQL's top three with a template reason and `fallback: true`. The picks
 *    are shown either way.
 *
 * 3. **The question and the list leave the device only through `suggest`.**
 *    Decision 24 puts a permission step before the first call (Apple 5.1.2(i)).
 *    `plainSuggestions` is the path that sends nothing anywhere: it reads
 *    `suggestion_candidates` and the caller's Loved and Liked tiers under Row
 *    Level Security and writes the same template reason the function writes on
 *    its fallback. It is what "Not now" shows, and what the daily limit shows.
 *
 * 4. **There is no exclusion list yet.** The function takes no "not these", so
 *    "Another three" is `plainSuggestions` with what was shown excluded:
 *    calling the model again would spend one of the daily slots on the same
 *    three.
 */

import type { Medium } from '@verso/core';

import type { Client } from './client';
import type { Json } from './database.types';

/** What the sheet asks with. Every list is optional; empty is no filter. */
export interface SuggestOptions {
  medium: Medium;
  /** The person's own words, at most 280 characters. Context for the model, never a filter. */
  note?: string | null;
  /** Runtime for a film, IGDB's "normally" time to beat for a game. A hard filter. */
  maxMinutes?: number | null;
  genres?: string[] | null;
  excludeGenres?: string[] | null;
  /** Games only: where it must be playable. */
  platforms?: string[] | null;
  /** Films only: `watch_providers.provider_id`s, the caller's services. */
  providerIds?: number[] | null;
  /** ISO 3166-1 alpha-2; the function's default is US. */
  region?: string | null;
  /** Let the caller's own backlog or watchlist into the pool (decision 18). */
  includeBacklog?: boolean;
}

/** One pick, with the reason the person reads. */
export interface SuggestPick {
  mediaItemId: string;
  title: string;
  year: number | null;
  /** IGDB's image id for a game, TMDB's poster path for a film. */
  coverImageId: string | null;
  reason: string;
  /** The person's own titles the reason cites. */
  because: string[];
}

export type SuggestResult =
  | {
      status: 'ok';
      picks: SuggestPick[];
      /** The model whose picks these are, or `sql-top3` when SQL's order is what is shown. */
      modelVersion: string;
      /** The model was asked and its answer was not used. */
      fallback: boolean;
      /** The `suggestion_requests` row, or null when there was nothing to suggest. */
      requestId: string | null;
    }
  /** Over the daily limit. Nothing ran and nothing was counted. */
  | { status: 'limit'; limit: number | null; used: number | null };

/** `model_version` for SQL's order with a template reason, as the function spells it. */
export const SUGGEST_SQL_MODEL = 'sql-top3';

/**
 * The function's 200 body, as far as the app reads it.
 *
 * Restated from `SuggestResponse` in supabase/functions/suggest/suggest.ts,
 * which this package cannot import (that is Deno, bundled from
 * supabase/functions alone). What the function logs as `LoggedPicks` is the
 * same picks with their labels; the app needs the title and the cover too,
 * which the response carries and the log does not.
 */
interface SuggestResponseBody {
  requestId: string | null;
  model: string;
  fallback: boolean;
  picks: {
    mediaItemId: string;
    title: string;
    year: number | null;
    coverImageId: string | null;
    reason: string;
    because: string[];
  }[];
}

/**
 * Ask the engine. Three picks at most, each with a reason; fewer when fewer
 * candidates pass the filters, none when nothing does.
 */
export async function suggest(client: Client, options: SuggestOptions): Promise<SuggestResult> {
  const { data, error } = await client.functions.invoke<SuggestResponseBody>('suggest', {
    body: suggestRequestBody(options),
  });

  if (error) {
    const limit = await limitReached(error);
    if (limit) return limit;
    throw error;
  }
  if (!data || !Array.isArray(data.picks)) throw new Error('suggest returned no picks');

  return {
    status: 'ok',
    picks: data.picks.map((pick) => ({
      mediaItemId: pick.mediaItemId,
      title: pick.title,
      year: pick.year ?? null,
      coverImageId: pick.coverImageId ?? null,
      reason: pick.reason,
      because: pick.because ?? [],
    })),
    modelVersion: data.model,
    fallback: data.fallback === true,
    requestId: data.requestId ?? null,
  };
}

/**
 * The body the function's parser accepts: it refuses unknown fields, and an
 * empty list or a blank note is sent as nothing at all.
 */
export function suggestRequestBody(options: SuggestOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { medium: options.medium };
  const note = options.note?.trim();
  if (note) body.note = note;
  if (options.maxMinutes) body.maxMinutes = options.maxMinutes;
  if (options.genres?.length) body.genres = options.genres;
  if (options.excludeGenres?.length) body.excludeGenres = options.excludeGenres;
  if (options.platforms?.length) body.platforms = options.platforms;
  if (options.providerIds?.length) body.providerIds = options.providerIds;
  if (options.region) body.region = options.region;
  if (options.includeBacklog !== undefined) body.includeBacklog = options.includeBacklog;
  return body;
}

/**
 * A 429 from the function, read off the `FunctionsHttpError` supabase-js
 * returns for any non-2xx: its `context` is the fetch Response. The body says
 * the limit and the count; if it cannot be read, the status alone is enough.
 */
async function limitReached(error: unknown): Promise<SuggestResult | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof context !== 'object' || (context as { status?: unknown }).status !== 429) {
    return null;
  }
  let limit: number | null = null;
  let used: number | null = null;
  try {
    const body = (await (context as Response).json()) as { limit?: unknown; used?: unknown };
    limit = typeof body.limit === 'number' ? body.limit : null;
    used = typeof body.used === 'number' ? body.used : null;
  } catch {
    // An unreadable body is still a 429.
  }
  return { status: 'limit', limit, used };
}

// -- The plain path ------------------------------------------------------------

/** A row of `suggestion_candidates`, as far as the plain path reads it. */
export interface SuggestCandidateRow {
  media_item_id: string;
  title: string;
  year: number | null;
  cover_image_id: string | null;
  genres: string[] | null;
  why: Json;
}

/** One of the caller's Loved or Liked items, for the template reason. */
export interface SuggestTasteItem {
  title: string;
  year: number | null;
  tier: 'loved' | 'liked';
  genres: string[];
  platforms: string[];
}

/**
 * SQL's best three that are not in `exclude`, each with the reason the
 * function writes on its fallback. Nothing leaves the device: three reads
 * under the caller's own Row Level Security.
 */
export async function plainSuggestions(
  client: Client,
  options: SuggestOptions,
  exclude: readonly string[] = [],
): Promise<SuggestPick[]> {
  const [candidates, loved, liked] = await Promise.all([
    client.rpc('suggestion_candidates', {
      p_medium: options.medium,
      ...(options.genres?.length ? { p_genres: options.genres } : {}),
      ...(options.excludeGenres?.length ? { p_exclude_genres: options.excludeGenres } : {}),
      ...(options.maxMinutes ? { p_max_minutes: options.maxMinutes } : {}),
      ...(options.platforms?.length ? { p_platforms: options.platforms } : {}),
      ...(options.providerIds?.length ? { p_provider_ids: options.providerIds } : {}),
      ...(options.region ? { p_region: options.region } : {}),
      p_include_backlog: options.includeBacklog ?? false,
      p_limit: 30,
    }),
    client.rpc('tier_list', { p_medium: options.medium, p_tier: 'loved' }),
    client.rpc('tier_list', { p_medium: options.medium, p_tier: 'liked' }),
  ]);
  if (candidates.error) throw candidates.error;
  if (loved.error) throw loved.error;
  if (liked.error) throw liked.error;

  // Loved sits wholly above Liked, and each comes back in the person's order.
  const taste: SuggestTasteItem[] = [
    ...(loved.data ?? []).map((row) => tasteItem(row, 'loved')),
    ...(liked.data ?? []).map((row) => tasteItem(row, 'liked')),
  ].slice(0, 10);

  const skip = new Set(exclude);
  return ((candidates.data ?? []) as SuggestCandidateRow[])
    .filter((row) => !skip.has(row.media_item_id))
    .slice(0, 3)
    .map((row) => ({
      mediaItemId: row.media_item_id,
      title: row.title,
      year: (row.year as number | null) ?? null,
      coverImageId: (row.cover_image_id as string | null) ?? null,
      ...templateReason(row, taste, options.medium),
    }));
}

function tasteItem(
  row: { title: string; year: number | null; genres: string[] | null; platforms: string[] | null; position: number },
  tier: 'loved' | 'liked',
): SuggestTasteItem {
  return {
    title: row.title,
    year: (row.year as number | null) ?? null,
    tier,
    genres: (row.genres as string[] | null) ?? [],
    platforms: (row.platforms as string[] | null) ?? [],
  };
}

/**
 * The function's `templateReason` (supabase/functions/suggest/suggest.ts),
 * restated word for word so a plain pick reads the same as a fallback one: the
 * strongest feature in `why` that one of the person's Loved or Liked items
 * shares, named with that item; else the strongest feature alone; else the
 * rating that put it there.
 */
export function templateReason(
  row: Pick<SuggestCandidateRow, 'why'>,
  taste: readonly SuggestTasteItem[],
  medium: Medium,
): { reason: string; because: string[] } {
  const why = Array.isArray(row.why) ? row.why : [];
  const features = why
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const { feature, weight } = entry as { feature?: unknown; weight?: unknown };
      return typeof feature === 'string' && Number(weight) > 0 ? [{ feature, weight: Number(weight) }] : [];
    })
    .sort((a, b) => b.weight - a.weight);

  for (const { feature } of features) {
    const colon = feature.indexOf(':');
    if (colon < 0) continue;
    const trait = sharedTrait(feature.slice(0, colon).trim(), feature.slice(colon + 1).trim());
    if (!trait) continue;
    const item = taste.find(trait.matches);
    if (item) {
      return {
        reason: `Because you put ${item.title} in ${item.tier === 'loved' ? 'Loved' : 'Liked'} and ${trait.phrase}.`,
        because: [item.title],
      };
    }
  }

  if (features.length > 0) return { reason: `Fits your taste for ${plainFeature(features[0]!.feature)}.`, because: [] };
  return { reason: `Among the best-rated ${mediumNoun(medium)} that fit your filters.`, because: [] };
}

function sharedTrait(
  kind: string,
  value: string,
): { phrase: string; matches: (item: SuggestTasteItem) => boolean } | null {
  const same = (a: string) => a.trim().toLowerCase() === value.toLowerCase();
  switch (kind) {
    case 'genre':
      return { phrase: `this shares the ${value} genre`, matches: (item) => item.genres.some(same) };
    case 'platform':
      return { phrase: `this is also on ${value}`, matches: (item) => item.platforms.some(same) };
    case 'decade': {
      const start = Number(decadeLabel(value).slice(0, 4));
      if (!Number.isInteger(start)) return null;
      return {
        phrase: `this is also from the ${start}s`,
        matches: (item) => item.year !== null && Math.floor(item.year / 10) * 10 === start,
      };
    }
    default:
      return null;
  }
}

function plainFeature(feature: string): string {
  const colon = feature.indexOf(':');
  if (colon < 0) return feature.replaceAll('_', ' ');
  const kind = feature.slice(0, colon).trim();
  const value = feature.slice(colon + 1).trim();
  if (kind === 'decade') return `the ${decadeLabel(value)}`;
  return `${kind.replaceAll('_', ' ')} ${value}`;
}

function decadeLabel(value: string): string {
  const match = value.match(/(\d{4})/);
  return match ? `${match[1]}s` : value;
}

function mediumNoun(medium: Medium): string {
  return medium === 'game' ? 'games' : medium === 'movie' ? 'movies' : 'TV shows';
}
