/**
 * The movie page's reads, and the film facts the log sheet draws with.
 *
 * `readMoviePage` is the catalog half from `moviePage` (the `movie_page` RPC,
 * movies-build.md PR 1: the film, its details, the certification, every score
 * by source with Rotten Tomatoes when the Wikidata pass has written it, the
 * awards line, the release state and the region's offers) beside the caller's
 * own half: the entry (`getEntry`) and whether the film is ranked. Three reads
 * in parallel under one key, so the page draws once. It replaced
 * `moviePageFallback`, the PostgREST selects the page read until the RPC
 * merged (PR 7 of the build).
 *
 * `movieFacts`: the few facts the log sheet and the log flow draw a film with
 * (title, year, poster, runtime, genres), since `gamePage` has no film half.
 */

import { getEntry, moviePage, type Client, type Entry, type Json, type MoviePage } from '@verso/api';
import type { Medium, Tier } from '@verso/core';

export interface MoviePageData {
  page: MoviePage;
  entry: Entry | null;
  ranking: { tier: Tier; position: number } | null;
}

/** The movie page, or null when the id is not a film. */
export async function readMoviePage(
  client: Client,
  id: string,
  options: { region: string; today: string },
): Promise<MoviePageData | null> {
  const [page, entry, ranking] = await Promise.all([
    moviePage(client, id, options),
    getEntry(client, id),
    client.from('ranking_entries').select('tier, position').eq('media_item_id', id).maybeSingle(),
  ]);
  if (ranking.error) throw ranking.error;
  if (!page) return null;
  return {
    // `top_cast` is jsonb: `moviePage` keeps only named members of an array,
    // and this keeps the page drawable whatever an older api build hands it.
    page: { ...page, topCast: Array.isArray(page.topCast) ? page.topCast : [] },
    entry,
    ranking: ranking.data ? { tier: ranking.data.tier as Tier, position: ranking.data.position } : null,
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
