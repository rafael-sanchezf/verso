import { JsonClient, type JsonClientOptions } from './http';
import type { ItadGameSubscriptions } from './types';

/** The one host. The API is versioned in the path, not the hostname. */
export const ITAD_BASE_URL = 'https://api.isthereanydeal.com';

/**
 * IsThereAnyDeal's shop id for Steam.
 *
 * From the API's own documentation ("Steam (61) and GOG (35)"), which is how
 * the lookup addresses a storefront: `POST /lookup/id/shop/61/v1` with a body
 * of `["app/220", ...]`.
 */
export const ITAD_STEAM_SHOP_ID = 61;

/**
 * Ids per request.
 *
 * 200 is the documented maximum for `/games/subs/v1` (`maxItems: 200` on its
 * request body) and the lookup endpoint publishes no maximum at all, so the
 * same number is used for both rather than inventing a second one.
 */
export const ITAD_BATCH_SIZE = 200;

/**
 * Milliseconds between requests.
 *
 * The published allowance is 1,000 requests per five-minute window for an
 * account with a verified email, which a job making a few dozen calls a night
 * cannot come near. 250 ms is a pace, not a budget: it keeps us visibly far
 * under the limit the terms ask us not to sit against.
 */
export const ITAD_INTERVAL_MS = 250;

/**
 * The `service` id for a subscription ITAD names.
 *
 * Prefixed, because these come from a source that decides for itself what a
 * subscription is called and can add one any night: `itad:` says "whatever
 * IsThereAnyDeal called this" and keeps that namespace clear of the four ids
 * this repository defines (`game_pass_console`, `game_pass_pc`, `ea_play`,
 * `geforce_now`). The slug is derived from the name rather than from ITAD's
 * numeric id so the value stays readable in the database and in a log.
 */
export function itadServiceId(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `itad:${slug || 'unknown'}`;
}

/** `app/<appid>`, the shop-game-id form the Steam lookup takes. */
export function steamShopGameId(appId: number): string {
  return `app/${appId}`;
}

/** The Steam app id back out of an `app/<appid>` key, or null. */
export function steamAppIdFromShopGameId(key: string): number | null {
  const match = /^app\/(\d+)$/.exec(key);
  if (!match) return null;
  const appId = Number(match[1]);
  return Number.isSafeInteger(appId) && appId > 0 ? appId : null;
}

export type ItadClientOptions = Omit<JsonClientOptions, 'name'> & {
  apiKey: string;
  baseUrl?: string;
  batchSize?: number;
};

/**
 * Read-only client for the two IsThereAnyDeal endpoints this job needs.
 *
 * The only official API of the three sources. Its terms allow commercial use
 * "IF the resulting app is available to public", ask for a link back to
 * isthereanydeal.com, and forbid changing the data
 * (docs/research/game-data-sources.md 9.5) -- so the link belongs on the game
 * page beside anything this fills in, and nothing here derives or adjusts a
 * value. The key is passed in the `ITAD-API-Key` header rather than the `key`
 * query parameter, which the docs offer as the alternative, so it never lands
 * in a URL that could be logged.
 */
export class ItadClient {
  private readonly http: JsonClient;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly batchSize: number;

  constructor(options: ItadClientOptions) {
    this.http = new JsonClient({
      name: 'IsThereAnyDeal',
      intervalMs: options.intervalMs ?? ITAD_INTERVAL_MS,
      ...options,
    });
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? ITAD_BASE_URL;
    this.batchSize = options.batchSize ?? ITAD_BATCH_SIZE;
  }

  get requestCount(): number {
    return this.http.requestCount;
  }

  private get headers(): Record<string, string> {
    return { 'ITAD-API-Key': this.apiKey };
  }

  /**
   * Steam app ids to ITAD game ids, for the ones ITAD knows.
   *
   * `POST /lookup/id/shop/61/v1` with `["app/220", ...]` answers an object
   * keyed by the same strings, whose value is the ITAD uuid or `null`. A null
   * is an ordinary answer -- ITAD does not have every Steam app -- so it is
   * dropped rather than recorded as a failure.
   */
  async gameIdsBySteamAppId(appIds: readonly number[]): Promise<Map<number, string>> {
    const found = new Map<number, string>();

    for (let start = 0; start < appIds.length; start += this.batchSize) {
      const batch = appIds.slice(start, start + this.batchSize);
      const body = await this.http.postJson<Record<string, string | null>>(
        `${this.baseUrl}/lookup/id/shop/${ITAD_STEAM_SHOP_ID}/v1`,
        batch.map(steamShopGameId),
        this.headers,
      );

      for (const [key, gameId] of Object.entries(body ?? {})) {
        const appId = steamAppIdFromShopGameId(key);
        if (appId !== null && typeof gameId === 'string' && gameId.length > 0) {
          found.set(appId, gameId);
        }
      }
    }

    return found;
  }

  /**
   * The subscriptions each game is currently listed in, for one country.
   *
   * `POST /games/subs/v1?country=US` with up to 200 ITAD game ids answers
   * `[{ id, subs: [{ id, name, leaving }] }]`. A game in nothing comes back
   * with an empty `subs`, and `leaving` is a date or null -- announced
   * departures, which this job records by letting the row close on the night
   * the game actually goes, not by acting on the date.
   */
  async subscriptions(
    gameIds: readonly string[],
    country: string,
  ): Promise<ItadGameSubscriptions[]> {
    const results: ItadGameSubscriptions[] = [];

    for (let start = 0; start < gameIds.length; start += this.batchSize) {
      const batch = gameIds.slice(start, start + this.batchSize);
      const body = await this.http.postJson<unknown>(
        `${this.baseUrl}/games/subs/v1?country=${encodeURIComponent(country)}`,
        batch,
        this.headers,
      );
      if (Array.isArray(body)) results.push(...(body as ItadGameSubscriptions[]));
    }

    return results;
  }
}
