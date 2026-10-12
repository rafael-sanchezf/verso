/**
 * `IPlayerService`, and the shape of what it answers with.
 *
 * Two documented Steam Web API methods, both keyed (research 4.2):
 *
 *   GetOwnedGames         every app the account owns, with `playtime_forever`,
 *                         `playtime_2weeks`, `rtime_last_played`, and -- with
 *                         `include_appinfo=1` -- the name.
 *   GetRecentlyPlayedGames  the last two weeks, which is the same data for a
 *                         handful of games and is asked for anyway: see below.
 *
 * **A private profile is an empty object, not an error.** Valve's own wording
 * is that GetOwnedGames "Returns a list of games owned by the player if their
 * owned games/game details are visible to you"; when they are not, the answer
 * is HTTP 200 with `{"response":{}}` (research 4.3). That is indistinguishable
 * from a failure only if you squint: an account that genuinely owns nothing
 * comes back with `game_count: 0` and an empty `games` array. So the test is
 * "did Valve tell us anything at all about the library", and a private profile
 * becomes a typed result the app can turn into the privacy checklist screen
 * rather than an error toast.
 *
 * **Zero playtime is ambiguous on purpose, and we do not resolve it.** A user
 * who ticks "Always keep my total playtime private" gets their games back with
 * every `playtime_forever` at 0 (research 4.3), which looks exactly like a game
 * they have never started. `apply_steam_playtime` in the migration therefore
 * writes nothing for a zero, and `looksLikePlaytimeHidden` below is a heuristic
 * for the UI to mention it, never for the import to act on.
 *
 * This module is deliberately free of Supabase, Deno APIs and globals other
 * than `fetch`, so steam.test.ts can run the whole of it against fixtures with
 * no network, no stack, and no key.
 */

export const OWNED_GAMES_URL =
  'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';
export const RECENTLY_PLAYED_URL =
  'https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/';

/** Attempts per call, the first included. */
export const MAX_ATTEMPTS = 3;

/** First backoff after a 429 or a 5xx. Doubles: 500 ms, then 1000 ms. */
export const BACKOFF_MS = 500;

/** How long one request may take before it is abandoned and retried. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Names us to Valve, the way the player-count poll does. */
export const USER_AGENT = 'verso-steam-import/0.1 (+https://github.com/rafael-sanchezf/verso)';

/** One game as Valve reports it. Every field but `appid` may be absent. */
export interface OwnedGame {
  appid: number;
  name?: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
}

export interface OwnedGamesResponse {
  response?: {
    game_count?: number;
    games?: OwnedGame[];
  };
}

/** One library row, normalised, ready to upsert into `steam_library`. */
export interface LibraryEntry {
  steamAppId: number;
  name: string | null;
  playtimeForeverMinutes: number;
  /** Null rather than zero when the game was not played in the last two weeks. */
  playtime2weeksMinutes: number | null;
  /** Null when Valve sends no `rtime_last_played`, or sends 0 for "never". */
  lastPlayedAt: string | null;
}

export interface FetchOptions {
  /** Swapped for a fixture in tests. */
  fetchImpl?: typeof fetch;
  /** Swapped for a no-op in tests, so retries cost no wall clock. */
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A Steam Web API call that failed.
 *
 * `status` is carried so the caller can tell "your key is wrong" (401/403, a
 * deployment problem Rafa has to fix) from "Steam is unhappy" (429, 5xx, a
 * problem that fixes itself).
 *
 * **The message never contains the URL, and never quotes a cause.** The URL
 * carries `key=`, and `index.ts` logs `cause.message`, so one interpolated
 * `fetch` rejection would be enough to write the Steam Web API key into the
 * function logs -- which the Steam Web API Terms require to be kept
 * confidential (research 4.1). Every construction site for this error is
 * either a fixed string or a status code.
 */
export class SteamApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

/** True when Valve answered but said nothing about the library: a private profile. */
export function isPrivateProfile(body: OwnedGamesResponse): boolean {
  const response = body.response;
  if (!response) return true;
  // An account that owns nothing still gets a game_count. Both fields missing
  // is the private case and the only one.
  return response.games === undefined && response.game_count === undefined;
}

/**
 * Every game the account owns.
 *
 * `include_appinfo=1` for the name, `include_played_free_games=1` because an
 * hour of a free-to-play game is still an hour and a user who tracks Warframe
 * would be puzzled to find it missing (research 10.4 asks for both).
 */
export async function fetchOwnedGames(
  apiKey: string,
  steamId: string,
  options: FetchOptions = {},
): Promise<{ private: boolean; games: OwnedGame[] }> {
  const url = `${OWNED_GAMES_URL}?${new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    include_appinfo: '1',
    include_played_free_games: '1',
    format: 'json',
  })}`;

  const body = await getJson<OwnedGamesResponse>(url, options);
  if (isPrivateProfile(body)) return { private: true, games: [] };
  return { private: false, games: body.response?.games ?? [] };
}

/**
 * The last two weeks.
 *
 * Asked for separately even though `GetOwnedGames` already carries
 * `playtime_2weeks`, because the two are not the same answer: the recent
 * endpoint is the one Valve keeps current for the "recently played" strip, and
 * a library large enough to be paged or trimmed can come back without the
 * two-week field on games that do have one. It is one extra call per import
 * against an allowance of 100,000 a day.
 *
 * A failure here is not a failed import: recent playtime is a nice-to-have on
 * top of a total, so the caller catches this and carries on with what
 * GetOwnedGames gave it.
 */
export async function fetchRecentlyPlayed(
  apiKey: string,
  steamId: string,
  options: FetchOptions = {},
): Promise<OwnedGame[]> {
  const url = `${RECENTLY_PLAYED_URL}?${new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    count: '0',
    format: 'json',
  })}`;

  const body = await getJson<OwnedGamesResponse>(url, options);
  return body.response?.games ?? [];
}

/**
 * Valve's two answers as one list of library rows.
 *
 * The owned list is the spine: a game in "recently played" that is not in the
 * library cannot be stored, because `steam_library` is what the user owns and
 * because a family-shared or refunded app has no business appearing there. What
 * the recent list contributes is its `playtime_2weeks` and its fresher
 * `playtime_forever`, both taken as the larger of the two figures -- the two
 * endpoints are not read at the same instant and the newer number is the one
 * that is not stale.
 *
 * Duplicates collapse on the app id, which Valve has been seen to produce for
 * apps that changed identity.
 */
export function mergeLibrary(owned: OwnedGame[], recent: OwnedGame[]): LibraryEntry[] {
  const byAppId = new Map<number, LibraryEntry>();

  for (const game of owned) {
    if (!Number.isInteger(game.appid) || game.appid <= 0) continue;
    const existing = byAppId.get(game.appid);
    const entry = toLibraryEntry(game);
    byAppId.set(game.appid, existing ? maxOf(existing, entry) : entry);
  }

  for (const game of recent) {
    const existing = byAppId.get(game.appid);
    if (!existing) continue;
    byAppId.set(game.appid, maxOf(existing, toLibraryEntry(game)));
  }

  return [...byAppId.values()];
}

function toLibraryEntry(game: OwnedGame): LibraryEntry {
  return {
    steamAppId: game.appid,
    name: typeof game.name === 'string' && game.name.length > 0 ? game.name : null,
    playtimeForeverMinutes: nonNegative(game.playtime_forever) ?? 0,
    playtime2weeksMinutes: nonNegative(game.playtime_2weeks) ?? null,
    lastPlayedAt: lastPlayed(game.rtime_last_played),
  };
}

/** The better of two readings of the same app: whichever knows more. */
function maxOf(a: LibraryEntry, b: LibraryEntry): LibraryEntry {
  return {
    steamAppId: a.steamAppId,
    name: a.name ?? b.name,
    playtimeForeverMinutes: Math.max(a.playtimeForeverMinutes, b.playtimeForeverMinutes),
    playtime2weeksMinutes:
      a.playtime2weeksMinutes === null && b.playtime2weeksMinutes === null
        ? null
        : Math.max(a.playtime2weeksMinutes ?? 0, b.playtime2weeksMinutes ?? 0),
    lastPlayedAt:
      a.lastPlayedAt === null || b.lastPlayedAt === null
        ? (a.lastPlayedAt ?? b.lastPlayedAt)
        : a.lastPlayedAt > b.lastPlayedAt
          ? a.lastPlayedAt
          : b.lastPlayedAt,
  };
}

function nonNegative(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** `rtime_last_played` as an ISO timestamp. Zero and absent both mean "never". */
function lastPlayed(rtime: unknown): string | null {
  const seconds = Number(rtime);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * "Every game you own reads as zero minutes", which is what
 * "Always keep my total playtime private" looks like from out here.
 *
 * A heuristic for the UI only: a brand new account really could own six games
 * and have played none of them, so the import never acts on this. It exists so
 * the privacy checklist can say "we can see your games but not your hours"
 * instead of showing a library of zeroes with no explanation, which is what
 * "Best-effort integrations, honest UI" asks for (ROADMAP.md).
 */
export function looksLikePlaytimeHidden(entries: readonly LibraryEntry[]): boolean {
  return entries.length > 0 && entries.every((entry) => entry.playtimeForeverMinutes === 0);
}

/**
 * One GET with retries.
 *
 * Retries a 429 or a 5xx with doubling backoff and gives up on anything else: a
 * 401 or a 403 means the key is wrong or revoked and will say the same thing
 * next time. The thrown message carries the status and never the URL, because
 * the URL has `key=` in it and this message reaches the function logs.
 */
async function getJson<T>(url: string, options: FetchOptions): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      if (attempt >= maxAttempts) {
        // The cause is never interpolated. A `fetch` rejection's message
        // routinely quotes the URL it failed on, and this URL has `key=` in it,
        // so `String(cause)` here would put the Steam Web API key into the
        // function logs the first time Valve's DNS hiccuped. The class name
        // says as much as is safe and as much as is useful.
        const kind = cause instanceof Error ? cause.name : 'network error';
        throw new SteamApiError(`request failed after ${attempt} attempts (${kind})`, null);
      }
      await sleep(backoffMs * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) {
      try {
        return (await response.json()) as T;
      } catch {
        throw new SteamApiError('unparseable JSON', response.status);
      }
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxAttempts) {
      throw new SteamApiError(`Steam returned ${response.status}`, response.status);
    }

    await sleep(backoffMs * 2 ** (attempt - 1));
  }
}
