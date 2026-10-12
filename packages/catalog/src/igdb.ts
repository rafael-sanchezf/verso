import { RateLimiter, systemClock, type Clock } from './rate-limit';
import { catalogTrim } from './trim';
import type { IgdbExternalGame, IgdbGame, IgdbTimeToBeat } from './types';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const GAMES_URL = 'https://api.igdb.com/v4/games';
const TIME_TO_BEAT_URL = 'https://api.igdb.com/v4/game_time_to_beats';
const EXTERNAL_GAMES_URL = 'https://api.igdb.com/v4/external_games';

/** IGDB's hard ceiling on `limit`. */
export const PAGE_SIZE = 500;

/**
 * Game ids per time-to-beat request. The endpoint returns at most one row per
 * game, so this is also the `limit` those requests carry, and matching it to
 * {@link PAGE_SIZE} makes one page of games exactly one time-to-beat request.
 */
export const TIME_TO_BEAT_BATCH_SIZE = 500;

/**
 * Game ids per `/v4/external_games` request.
 *
 * Half a page of games, not a whole one, because this endpoint returns *many*
 * rows per game rather than at most one: the same 500-row ceiling applies to
 * the response, and a game can have a dozen store entries. Steam rows alone
 * ran at about 0.75 per game across the 200 most-rated games on 2026-09-16, so
 * 250 ids is a comfortable single request, and the walk pages on `offset`
 * anyway if a batch ever does fill the page.
 */
export const EXTERNAL_GAME_BATCH_SIZE = 250;

/**
 * IGDB's `external_game_source` for Steam.
 *
 * The old `category` enum is deprecated and no longer comes back in responses
 * at all; `external_game_source` replaces it and, confirmed against
 * `/v4/external_game_sources` on 2026-09-16, keeps the same ids: 1 is Steam,
 * 5 GOG, 26 Epic Games Store, and so on.
 */
export const STEAM_EXTERNAL_GAME_SOURCE = 1;

/** IGDB's published limits: 4 requests a second, 8 open at a time. */
export const REQUESTS_PER_SECOND = 4;
export const MAX_IN_FLIGHT = 8;

/**
 * Every field the mirror reads. Dotted paths ask IGDB to expand a joined
 * resource, which is what keeps the pull to one request per page instead of
 * one per game.
 */
export const GAME_FIELDS = [
  'name',
  'first_release_date',
  'cover.image_id',
  'genres.name',
  'platforms.name',
  'involved_companies.company.name',
  'involved_companies.developer',
  // Other names for search ("GTA 5", "BotW", Japanese and working titles),
  // expanded here rather than read from /v4/alternative_names so they cost no
  // request of their own: they ride on the page of 500 the walk already makes.
  // Confirmed against https://api-docs.igdb.com/#alternative-name on
  // 2026-09-23 (fields checksum, comment, game, name; only name is read).
  'alternative_names.name',
  'summary',
  // The two scores the app shows by source, and their counts. `total_rating`
  // blends them and stays in metadata as a sort key rather than being shown.
  'aggregated_rating',
  'aggregated_rating_count',
  'rating',
  'rating_count',
  'total_rating',
  'total_rating_count',
  'game_type',
  // What a remake, port or edition hangs off, as plain ids (no expansion, so
  // no extra request and a few bytes a row). Stored in metadata for a later
  // "the original" link; nothing reads them yet.
  'parent_game',
  'version_parent',
  'updated_at',
].join(',');

/**
 * Every field the mirror reads from `/v4/external_games`.
 *
 * `uid` is the store's own id for the game (for Steam, the app id as a string
 * of digits) and `external_game_source` says which store. `category`, the enum
 * the docs still list, is deprecated and is no longer returned at all, so it
 * is not requested. `url` is carried for debugging a surprising `uid`; nothing
 * stores it.
 *
 * Confirmed against https://api-docs.igdb.com/#external-game and against the
 * live endpoint on 2026-09-16.
 */
export const EXTERNAL_GAME_FIELDS = ['game', 'uid', 'external_game_source', 'url'].join(',');

/**
 * Every field the mirror reads from `/v4/game_time_to_beats`.
 *
 * All three times are integers in seconds, keyed by `game_id`: the endpoint's
 * own `id` is the aggregate's id, not the game's. `count` is the number of
 * player submissions behind the averages; it is requested because it is the
 * only quality signal the endpoint offers, and is not stored yet.
 *
 * Confirmed against https://api-docs.igdb.com/#game-time-to-beat and against
 * the live endpoint on 2026-09-15.
 */
export const TIME_TO_BEAT_FIELDS = ['game_id', 'hastily', 'normally', 'completely', 'count'].join(
  ',',
);

export interface IgdbClientOptions {
  clientId: string;
  clientSecret: string;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  /** Attempts per request before giving up, including the first. */
  maxAttempts?: number;
}

interface CachedToken {
  accessToken: string;
  /** Epoch milliseconds at which the token stops being usable. */
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

/** Refresh this far before the stated expiry, so a long run cannot straddle it. */
const TOKEN_MARGIN_MS = 60_000;

export class IgdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'IgdbError';
  }
}

/**
 * IGDB client: Twitch client-credentials token, then rate-limited paginated
 * reads of `/v4/games`.
 *
 * The token is cached in memory for the life of the process. Twitch app access
 * tokens last about 58 days, so a nightly run requests exactly one, and asking
 * for a new token on every call would be both slow and rude.
 */
export class IgdbClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly limiter: RateLimiter;

  private token: CachedToken | null = null;
  /** In-flight token request, so a burst of callers triggers only one. */
  private tokenRequest: Promise<CachedToken> | null = null;

  requestCount = 0;
  retryCount = 0;

  constructor(options: IgdbClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.clock = options.clock ?? systemClock;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.limiter = new RateLimiter({
      perSecond: REQUESTS_PER_SECOND,
      maxInFlight: MAX_IN_FLIGHT,
      clock: this.clock,
    });
  }

  async accessToken(): Promise<string> {
    const cached = this.token;
    if (cached && cached.expiresAt > this.clock.now()) return cached.accessToken;

    this.tokenRequest ??= this.requestToken().finally(() => {
      this.tokenRequest = null;
    });

    const token = await this.tokenRequest;
    return token.accessToken;
  }

  private async requestToken(): Promise<CachedToken> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
    });

    const response = await this.fetchImpl(TOKEN_URL, { method: 'POST', body });
    if (!response.ok) {
      // Never echo the body: a failed token exchange can quote the request.
      throw new IgdbError(
        `Twitch token request failed with ${response.status}`,
        response.status,
        '',
      );
    }

    const json = (await response.json()) as TokenResponse;
    if (!json.access_token) throw new IgdbError('Twitch token response had no access_token', 200, '');

    const lifetimeMs = (json.expires_in ?? 3600) * 1000;
    const token: CachedToken = {
      accessToken: json.access_token,
      expiresAt: this.clock.now() + Math.max(lifetimeMs - TOKEN_MARGIN_MS, 0),
    };
    this.token = token;
    return token;
  }

  /**
   * One rate-limited POST to an IGDB endpoint with an APIcalypse body, retried
   * with exponential backoff on 429 and on 5xx.
   *
   * IGDB's 429 carries no Retry-After, so the backoff is blind: 1s, 2s, 4s, 8s.
   *
   * Every endpoint shares one limiter and one token, because IGDB's 4-per-
   * second budget is per application, not per endpoint: the time-to-beat
   * requests have to queue behind the game pages or the pull starts collecting
   * 429s that the games walk then has to sleep off.
   */
  private async request<T>(url: string, body: string): Promise<T[]> {
    let attempt = 0;

    for (;;) {
      attempt += 1;
      const token = await this.accessToken();

      const response = await this.limiter.run(async () => {
        this.requestCount += 1;
        return this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Client-ID': this.clientId,
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          body,
        });
      });

      if (response.ok) return (await response.json()) as T[];

      // A 401 means the cached token was revoked or rotated under us. Drop it
      // and let the next attempt exchange credentials again.
      if (response.status === 401 && this.token !== null && attempt < this.maxAttempts) {
        this.token = null;
        this.retryCount += 1;
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= this.maxAttempts) {
        const text = await response.text().catch(() => '');
        throw new IgdbError(
          `IGDB request failed with ${response.status} after ${attempt} attempt(s)`,
          response.status,
          text.slice(0, 500),
        );
      }

      this.retryCount += 1;
      await this.clock.sleep(1000 * 2 ** (attempt - 1));
    }
  }

  /** One rate-limited query against `/v4/games`. */
  async query(body: string): Promise<IgdbGame[]> {
    return this.request<IgdbGame>(GAMES_URL, body);
  }

  /**
   * Time-to-beat aggregates for the given IGDB game ids.
   *
   * `game_id` is a plain integer column on this endpoint, so APIcalypse's
   * `where game_id = (a, b, c)` is an IN filter and one request can cover a
   * whole page of games. There is at most one row per game, so a batch of
   * {@link TIME_TO_BEAT_BATCH_SIZE} ids can never overflow the matching
   * `limit`, and a game IGDB has no figures for is simply absent from the
   * response rather than returned with nulls.
   *
   * Ids the caller did not ask about are impossible, so the result can be
   * applied blind: the store matches on `igdb_id` and ignores anything that is
   * not in the mirror.
   */
  async timeToBeat(gameIds: number[]): Promise<IgdbTimeToBeat[]> {
    const ids = [...new Set(gameIds)];
    const rows: IgdbTimeToBeat[] = [];

    for (let start = 0; start < ids.length; start += TIME_TO_BEAT_BATCH_SIZE) {
      const batch = ids.slice(start, start + TIME_TO_BEAT_BATCH_SIZE);
      const body =
        `fields ${TIME_TO_BEAT_FIELDS};` +
        ` where game_id = (${batch.join(',')});` +
        ` limit ${TIME_TO_BEAT_BATCH_SIZE};`;

      rows.push(...(await this.request<IgdbTimeToBeat>(TIME_TO_BEAT_URL, body)));
    }

    return rows;
  }

  /**
   * Steam entries from `/v4/external_games` for the given IGDB game ids.
   *
   * `external_game_source = 1` filters to Steam server-side, which is what
   * keeps this cheap: the alternative, expanding `external_games` inside the
   * games query, drags back every store IGDB knows about (42 entries for
   * Cyberpunk 2077, 51 for Elden Ring, mostly Amazon ASINs) on every page of
   * 500.
   *
   * Unlike time to beat, this endpoint can return several rows per game, so a
   * batch could in principle fill IGDB's 500-row page. `sort id asc` makes the
   * window stable and the walk pages on `offset` until a short page ends it,
   * so no game can silently lose its Steam row off the end of a full page.
   */
  async externalGamesSteam(gameIds: number[]): Promise<IgdbExternalGame[]> {
    const ids = [...new Set(gameIds)];
    const rows: IgdbExternalGame[] = [];

    for (let start = 0; start < ids.length; start += EXTERNAL_GAME_BATCH_SIZE) {
      const batch = ids.slice(start, start + EXTERNAL_GAME_BATCH_SIZE);

      for (let offset = 0; ; offset += PAGE_SIZE) {
        const body =
          `fields ${EXTERNAL_GAME_FIELDS};` +
          ` where game = (${batch.join(',')})` +
          ` & external_game_source = ${STEAM_EXTERNAL_GAME_SOURCE};` +
          ` sort id asc;` +
          ` limit ${PAGE_SIZE};` +
          ` offset ${offset};`;

        const page = await this.request<IgdbExternalGame>(EXTERNAL_GAMES_URL, body);
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
    }

    return rows;
  }

  /**
   * Page through every game matching the trim rule, yielding one page at a
   * time so the caller can upsert as it goes and never holds the whole catalog
   * in memory.
   *
   * Pagination is `limit`/`offset` at IGDB's maximum page size of 500, sorted
   * by `id` so the window is stable across pages. A short page ends the walk.
   *
   * @param now Reference instant for the trim rule.
   * @param since When set, only games whose `updated_at` is at or after this
   *   instant: the nightly delta.
   */
  async *pages(now: Date, since?: Date, maxPages?: number): AsyncGenerator<IgdbGame[]> {
    const trim = catalogTrim(now);
    const clauses = [trim.where];
    if (since) clauses.push(`updated_at >= ${Math.floor(since.getTime() / 1000)}`);
    const where = clauses.join(' & ');

    for (let page = 0; maxPages === undefined || page < maxPages; page += 1) {
      const offset = page * PAGE_SIZE;
      const body =
        `fields ${GAME_FIELDS};` +
        ` where ${where};` +
        ` sort id asc;` +
        ` limit ${PAGE_SIZE};` +
        ` offset ${offset};`;

      const games = await this.query(body);
      if (games.length > 0) yield games;
      if (games.length < PAGE_SIZE) return;
    }
  }
}
