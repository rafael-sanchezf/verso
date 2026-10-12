/**
 * Shared setup for the data-hook suites, which run against a real local stack.
 *
 * Like the auth tests, they skip themselves unless the environment says where
 * the stack is. They need one variable more than the auth tests do: the catalog
 * is read-only to signed-in users by design, so seeding a game to track means
 * going in as the service role, which bypasses RLS the same way the IGDB mirror
 * does.
 *
 *   supabase start
 *   eval "$(supabase status -o env)"
 *   SUPABASE_URL="$API_URL" \
 *   SUPABASE_ANON_KEY="$ANON_KEY" \
 *   SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
 *     pnpm --filter @verso/api test
 *
 * Those are a local stack's throwaway credentials, not secrets.
 */

import type { Medium } from '@verso/core';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { createSupabaseClient, type Client } from '../src/client';
import type { Database } from '../src/database.types';

export const url = process.env.SUPABASE_URL;
export const anonKey = process.env.SUPABASE_ANON_KEY;
export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Whether there is a stack to talk to. Every live `describe` is `skipIf(!live)`. */
export const live = Boolean(url && anonKey && serviceRoleKey);

/** Storage that lives for one client, so no test inherits another's session. */
function memoryStorage(): SupportedStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

const clients: Client[] = [];

/** A signed-out client of its own. */
export function anonClient(): Client {
  const client = createSupabaseClient({ url: url!, anonKey: anonKey!, storage: memoryStorage() });
  clients.push(client);
  return client;
}

export interface TestUser {
  client: Client;
  userId: string;
  email: string;
}

/**
 * A brand new account, signed in. Local config has `enable_confirmations` off,
 * so the session comes back immediately.
 */
export async function signUpUser(prefix: string): Promise<TestUser> {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `verso-${prefix}-${stamp}@example.com`;
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email, password: 'verso-test-password-123' });
  if (error) throw error;
  if (!data.user) throw new Error('sign-up returned no user');
  return { client, userId: data.user.id, email };
}

/** Each client runs a refresh timer that would otherwise hold the process open. */
export async function stopClients(): Promise<void> {
  await Promise.all(clients.map((client) => client.auth.stopAutoRefresh()));
  clients.length = 0;
}

/** What a seeded catalog row looks like going in. Only `key` is required. */
export interface SeedGame {
  /** How the test refers to it afterwards. */
  key: string;
  /**
   * Which medium the catalog row is. Defaults to `'game'`, which is what
   * almost every fixture wants; `'movie'` and `'tv'` seed the film and the
   * series a suite needs to prove that a read scoped to games leaves them out.
   * A non-game row gets a `movie_details` or `tv_details` row instead of a
   * `game_details` one, the way the TMDB mirror writes it, so `genres` is
   * honoured for every medium while `platforms`, `developer`, `summary` and
   * `timeToBeat` are game fields and are ignored for a film or a series.
   */
  medium?: Medium;
  title?: string;
  year?: number | null;
  releaseDate?: string | null;
  platforms?: string[];
  genres?: string[];
  developer?: string | null;
  summary?: string | null;
  timeToBeat?: { hastily?: number; normally?: number; completely?: number };
  scores?: { source: string; score: number | null; scoreCount?: number | null }[];
  /** Goes into `external_ids.steam`, the way the mirror writes it. Omitted means not on Steam. */
  steamAppId?: number;
}

export interface SeededGame {
  mediaItemId: string;
  igdbId: number;
  title: string;
}

/**
 * A client that bypasses RLS, the way `packages/catalog` and the Edge Functions
 * do. Everything a signed-in user is not allowed to write -- the catalog, and
 * `player_counts` -- is seeded through one of these.
 *
 * No session and no refresh timer: it carries a key, not a user, so there is
 * nothing to persist and nothing for `stopClients` to stop.
 */
export function serviceClient(): Client {
  return createClient<Database>(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Write catalog rows as the service role, the way `packages/catalog` does.
 *
 * IGDB ids start above eight million so a run can never collide with a real
 * mirrored catalog sitting in the same local database, and with each other:
 * `media_items_igdb_uniq` is a unique index on (medium, external_ids->>'igdb').
 */
export async function seedGames(games: SeedGame[]): Promise<Record<string, SeededGame>> {
  const service = serviceClient();

  const base = 8_000_000 + Math.floor(Math.random() * 1_000_000);
  const seeded: Record<string, SeededGame> = {};

  const items = games.map((game, index) => {
    const igdbId = base + index;
    const title = game.title ?? `Test ${game.key} ${igdbId}`;
    seeded[game.key] = { mediaItemId: '', igdbId, title };
    return {
      medium: game.medium ?? 'game',
      title,
      year: game.year === undefined ? 2020 : game.year,
      cover_image_id: `cover_${igdbId}`,
      release_date: game.releaseDate === undefined ? '2020-01-01' : game.releaseDate,
      external_ids:
        game.steamAppId === undefined ? { igdb: igdbId } : { igdb: igdbId, steam: game.steamAppId },
    };
  });

  const { data: inserted, error } = await service.from('media_items').insert(items).select('id, external_ids');
  if (error) throw error;

  const idByIgdbId = new Map<number, string>();
  for (const row of inserted) {
    const external = row.external_ids as { igdb: number };
    idByIgdbId.set(external.igdb, row.id);
  }
  for (const game of games) {
    const entry = seeded[game.key]!;
    entry.mediaItemId = idByIgdbId.get(entry.igdbId)!;
  }

  const details = games
    .filter((game) => (game.medium ?? 'game') === 'game')
    .map((game) => {
      const entry = seeded[game.key]!;
      return {
        media_item_id: entry.mediaItemId,
        igdb_id: entry.igdbId,
        platforms: game.platforms ?? ['PC (Microsoft Windows)', 'Nintendo Switch'],
        genres: game.genres ?? ['Role-playing (RPG)'],
        developer: game.developer ?? 'Test Studio',
        summary: game.summary ?? null,
        time_to_beat_hastily_seconds: game.timeToBeat?.hastily ?? null,
        time_to_beat_normally_seconds: game.timeToBeat?.normally ?? null,
        time_to_beat_completely_seconds: game.timeToBeat?.completely ?? null,
      };
    });
  if (details.length > 0) {
    const { error: detailsError } = await service.from('game_details').insert(details);
    if (detailsError) throw detailsError;
  }

  // The film and series extensions, added by PR #50. A catalog row of either
  // medium always has one in the real mirror, and `search_games` reads `genres`
  // from whichever of the three tables holds the row, so a fixture without one
  // would come back with no genres and prove nothing. The TMDB id reuses the
  // same above-eight-million number as the IGDB id: both columns are unique per
  // table, and the point is only that a run cannot collide with a real mirrored
  // row or with another run.
  const detailsFor = (medium: Medium) =>
    games
      .filter((game) => game.medium === medium)
      .map((game) => ({
        media_item_id: seeded[game.key]!.mediaItemId,
        tmdb_id: seeded[game.key]!.igdbId,
        genres: game.genres ?? [],
      }));

  const movies = detailsFor('movie');
  if (movies.length > 0) {
    const { error: movieError } = await service.from('movie_details').insert(movies);
    if (movieError) throw movieError;
  }

  const series = detailsFor('tv');
  if (series.length > 0) {
    const { error: tvError } = await service.from('tv_details').insert(series);
    if (tvError) throw tvError;
  }

  const scores = games.flatMap((game) =>
    (game.scores ?? []).map((score) => ({
      media_item_id: seeded[game.key]!.mediaItemId,
      source: score.source,
      score: score.score,
      score_count: score.scoreCount ?? null,
    })),
  );
  if (scores.length > 0) {
    const { error: scoresError } = await service.from('external_scores').insert(scores);
    if (scoresError) throw scoresError;
  }

  return seeded;
}

/** `YYYY-MM-DD`, `days` away from today in the local timezone. */
export function localDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
