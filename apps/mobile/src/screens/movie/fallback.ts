/**
 * The movie page's read, as PostgREST selects, until `moviePage` lands.
 *
 * movies-build.md, PR 2, item 4: the page reads `moviePage(client, id,
 * { region, today })` from PR 1 (the `movie_page` RPC), which is being built
 * in parallel and is not on main. Until it merges, this builds the same page
 * from the tables that already exist: `media_items` with `movie_details`, the
 * region's certification from `media_certifications`, the scores from
 * `external_scores`, the current offers from `watch_availability` joined to
 * `watch_providers`, and the caller's entry and ranking. One round trip.
 * `MoviePageData` is shaped like the RPC's row so the swap is the read and
 * nothing on the screen; this file is deleted when it happens.
 *
 * What the RPC adds that this cannot: the Rotten Tomatoes value from
 * Wikidata and the awards line, which the catalog does not carry in a table
 * yet, so the page shows TMDB alone and no awards line until then (rule 25:
 * hidden when there is none). The release state is its own read today
 * (`movieReleaseState`), which the RPC folds in.
 *
 * Also here: `movieFacts`, the few facts the log sheet and the log flow draw
 * a film with (title, year, poster, runtime, genres), since `gamePage` has
 * no film half.
 */

import { toEntry, type Client, type Entry, type Json } from '@verso/api';
import type { Medium, Tier } from '@verso/core';

import type { Offer } from './where-to-watch';

export interface CastMember {
  name: string;
  /** TMDB's `profile_path`, leading slash included; null when TMDB has no photo. */
  profilePath: string | null;
}

export interface MoviePageData {
  mediaItemId: string;
  medium: Medium;
  title: string;
  year: number | null;
  releaseDate: string | null;
  coverImageId: string | null;
  externalIds: Json;
  tmdbId: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  directors: string[];
  topCast: CastMember[];
  collectionName: string | null;
  overview: string | null;
  /** The region's certification ("PG-13"), or null. */
  certification: string | null;
  /** TMDB's average times ten, and its vote count. */
  tmdbScore: number | null;
  tmdbVoteCount: number | null;
  /** Rotten Tomatoes as Wikidata's CC0 value; null until PR 1's read carries it. */
  rottenTomatoes: number | null;
  /** "Won 6 Oscars · 2022"; null until the catalog carries awards. */
  awards: string | null;
  /** Current offers in the region. */
  offers: Offer[];
  entry: Entry | null;
  ranking: { tier: Tier; position: number } | null;
}

type Row = {
  id: string;
  medium: Medium;
  title: string;
  year: number | null;
  release_date: string | null;
  cover_image_id: string | null;
  external_ids: Json;
  movie_details: {
    tmdb_id: number;
    runtime_minutes: number | null;
    genres: string[];
    directors: string[];
    top_cast: Json;
    collection_name: string | null;
    overview: string | null;
  } | null;
  media_certifications: { certification: string; region: string }[];
  external_scores: { source: string; score: number | null; score_count: number | null }[];
  watch_availability: {
    provider_id: number;
    offer_type: string;
    watch_providers: { name: string; display_priorities: Json } | null;
  }[];
  user_entries: Parameters<typeof toEntry>[0][];
  ranking_entries: { tier: Tier; position: number }[];
};

function castOf(value: Json): CastMember[] {
  if (!Array.isArray(value)) return [];
  const out: CastMember[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const name = typeof item['name'] === 'string' ? item['name'].trim() : '';
    if (name === '') continue;
    const path = item['profile_path'];
    out.push({ name, profilePath: typeof path === 'string' && path.startsWith('/') ? path : null });
  }
  return out;
}

function priorityIn(priorities: Json, region: string): number | null {
  if (typeof priorities !== 'object' || priorities === null || Array.isArray(priorities)) return null;
  const value = priorities[region];
  return typeof value === 'number' ? value : null;
}

/** The movie page, or null when there is no such media item. */
export async function moviePageFallback(client: Client, id: string, region: string): Promise<MoviePageData | null> {
  const { data, error } = await client
    .from('media_items')
    .select(
      `
      id, medium, title, year, release_date, cover_image_id, external_ids,
      movie_details ( tmdb_id, runtime_minutes, genres, directors, top_cast, collection_name, overview ),
      media_certifications ( certification, region ),
      external_scores ( source, score, score_count ),
      watch_availability ( provider_id, offer_type, region, removed_at, watch_providers ( name, display_priorities ) ),
      user_entries ( * ),
      ranking_entries ( tier, position )
    `,
    )
    .eq('id', id)
    .eq('media_certifications.region', region)
    .eq('watch_availability.region', region)
    .is('watch_availability.removed_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as Row;
  const details = row.movie_details;
  const tmdb = row.external_scores.find((score) => score.source === 'tmdb') ?? null;
  const entryRow = row.user_entries[0];

  return {
    mediaItemId: row.id,
    medium: row.medium,
    title: row.title,
    year: row.year,
    releaseDate: row.release_date,
    coverImageId: row.cover_image_id,
    externalIds: row.external_ids,
    tmdbId: details?.tmdb_id ?? null,
    runtimeMinutes: details?.runtime_minutes ?? null,
    genres: details?.genres ?? [],
    directors: details?.directors ?? [],
    topCast: castOf(details?.top_cast ?? null),
    collectionName: details?.collection_name ?? null,
    overview: details?.overview ?? null,
    certification: row.media_certifications[0]?.certification?.trim() || null,
    tmdbScore: tmdb?.score === null || tmdb?.score === undefined ? null : Number(tmdb.score),
    tmdbVoteCount: tmdb?.score_count ?? null,
    rottenTomatoes: null,
    awards: null,
    offers: row.watch_availability.map((offer) => ({
      providerId: offer.provider_id,
      name: offer.watch_providers?.name ?? 'Unknown service',
      offerType: offer.offer_type,
      priority: offer.watch_providers ? priorityIn(offer.watch_providers.display_priorities, region) : null,
    })),
    entry: entryRow ? toEntry(entryRow) : null,
    ranking: row.ranking_entries[0] ?? null,
  };
}

export interface MovieFacts {
  mediaItemId: string;
  medium: Medium;
  title: string;
  year: number | null;
  coverImageId: string | null;
  externalIds: Json;
  runtimeMinutes: number | null;
  genres: string[];
}

/** The facts the log sheet and the log flow draw a film with. Null for no such item. */
export async function movieFacts(client: Client, id: string): Promise<MovieFacts | null> {
  const { data, error } = await client
    .from('media_items')
    .select('id, medium, title, year, cover_image_id, external_ids, movie_details ( runtime_minutes, genres )')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    medium: Medium;
    title: string;
    year: number | null;
    cover_image_id: string | null;
    external_ids: Json;
    movie_details: { runtime_minutes: number | null; genres: string[] } | null;
  };
  return {
    mediaItemId: row.id,
    medium: row.medium,
    title: row.title,
    year: row.year,
    coverImageId: row.cover_image_id,
    externalIds: row.external_ids,
    runtimeMinutes: row.movie_details?.runtime_minutes ?? null,
    genres: row.movie_details?.genres ?? [],
  };
}
