/**
 * Valve's current-player endpoint and the pacing around it.
 *
 * `ISteamUserStats/GetNumberOfCurrentPlayers/v1` is an official, documented
 * Steam Web API method: one appid per call, no key, and the answer is a single
 * integer with no history behind it (docs/research/game-data-sources.md 4.2).
 * The Steam Web API Terms allow 100,000 calls a day. Player counts are not
 * affected by a user's privacy settings, and nothing here sends or receives
 * anything about a person: an app id goes out, a number comes back.
 *
 * This module is deliberately free of Supabase, Deno APIs and globals other
 * than `fetch`, so supabase/functions/steam-player-counts/steam.test.ts can run
 * the whole of it against a fixture with no network and no stack.
 */

export const CURRENT_PLAYERS_URL =
  'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/';

/**
 * Requests in flight at once.
 *
 * Four. Valve publishes a daily allowance and no rate, so "modest" is a
 * judgement rather than a limit read off a page: four is enough to poll the cap
 * below in well under the Edge Function's 150 s wall clock, and low enough that
 * we are never a burst anybody notices. packages/catalog/src/steam.ts is far
 * more careful still, but that one talks to the *storefront*, which is
 * undocumented and tolerated; this is the documented API with a published
 * allowance.
 */
export const CONCURRENCY = 4;

/** Attempts per app, the first included. */
export const MAX_ATTEMPTS = 3;

/** First backoff after a 429 or a 5xx. Doubles: 500 ms, then 1000 ms. */
export const BACKOFF_MS = 500;

/** How long one request may take before it is abandoned and retried. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Names us to Valve, the way the catalog's storefront client does. */
export const USER_AGENT = 'verso-player-counts/0.1 (+https://github.com/rafael-sanchezf/verso)';

/** The shape Valve answers with. `result` is 1 on success, anything else on failure. */
export interface CurrentPlayersResponse {
  response?: {
    player_count?: number;
    result?: number;
  };
}

/** One app's outcome. Exactly one of `players` and `error` says what happened. */
export interface PlayerCountResult {
  appId: number;
  /**
   * The figure, or null when Valve answered but had no number for this app
   * (`result` other than 1, which is what an unreleased, delisted, or
   * server-side app id gets). Null is "no figure", never "zero players": zero
   * is a real answer and comes back as 0.
   */
  players: number | null;
  /** Set when the call itself failed, after every retry. `players` is null then. */
  error?: string;
}

export interface FetchOptions {
  /** Swapped for a fixture in tests. */
  fetchImpl?: typeof fetch;
  /** Swapped for a no-op in tests, so retries cost no wall clock. */
  sleep?: (ms: number) => Promise<void>;
  concurrency?: number;
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Thrown inside this module only; the pool below turns it into a per-app `error`. */
export class SteamApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

/**
 * The current player count for one app.
 *
 * Retries a 429 or a 5xx with doubling backoff, and gives up on anything else:
 * a 400 or a 403 will say the same thing next time. Returns null rather than
 * throwing when Valve answers successfully but has no figure, because that is a
 * fact about the app and not a failure of ours.
 */
export async function currentPlayers(
  appId: number,
  options: FetchOptions = {},
): Promise<number | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const url = `${CURRENT_PLAYERS_URL}?appid=${appId}`;

  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      // A dropped connection or a timeout. Retryable in the same way a 5xx is.
      if (attempt >= maxAttempts) {
        throw new SteamApiError(
          `request failed after ${attempt} attempts: ${String(cause)}`,
          null,
        );
      }
      await sleep(backoffMs * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) {
      let body: CurrentPlayersResponse;
      try {
        body = (await response.json()) as CurrentPlayersResponse;
      } catch {
        throw new SteamApiError('unparseable JSON', response.status);
      }

      const result = body.response?.result;
      const count = body.response?.player_count;
      if (result !== 1 || typeof count !== 'number' || !Number.isFinite(count)) return null;
      // Valve has been seen to answer with a fractional or negative figure for
      // odd apps; the column is a non-negative integer, so clamp and round
      // rather than let one bad app fail the whole insert.
      return Math.max(0, Math.round(count));
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxAttempts) {
      throw new SteamApiError(`Steam returned ${response.status}`, response.status);
    }

    await sleep(backoffMs * 2 ** (attempt - 1));
  }
}

/**
 * Every app's count, at most `concurrency` calls in flight.
 *
 * One app's failure never stops the run: it comes back as an `error` on that
 * app's result and the rest are written. A poll that loses one game to a 403
 * and records the other forty is the right outcome for a job that runs again in
 * half an hour.
 *
 * Results come back in the order the app ids were given, whatever order they
 * finished in, so a caller can zip them against its own list.
 */
export async function fetchPlayerCounts(
  appIds: readonly number[],
  options: FetchOptions = {},
): Promise<PlayerCountResult[]> {
  const concurrency = Math.max(1, options.concurrency ?? CONCURRENCY);
  const results = new Array<PlayerCountResult>(appIds.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= appIds.length) return;

      const appId = appIds[index]!;
      try {
        results[index] = { appId, players: await currentPlayers(appId, options) };
      } catch (cause) {
        results[index] = {
          appId,
          players: null,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, appIds.length) }, () => worker()),
  );

  return results;
}
