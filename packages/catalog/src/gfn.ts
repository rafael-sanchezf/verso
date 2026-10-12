import { JsonClient, type JsonClientOptions } from './http';
import type { GfnEntry, GfnMatchKey } from './types';

/**
 * The list NVIDIA publishes, as docs/research/game-data-sources.md 9.4 names it.
 *
 * It powers NVIDIA's own site and community tools have read it for years, but
 * it is not a documented API and the fields change without notice.
 */
export const GFN_GAME_LIST_URL =
  'https://static.nvidiagrid.net/supported-public-game-list/gfnpc.json';

/**
 * The locale variant of the same list, and the reason this client takes two
 * URLs rather than one.
 *
 * On 2026-09-16 the plain `gfnpc.json` above answers `200` with the four bytes
 * `null` while `locales/gfnpc-en-US.json` answers with the full 1,550-entry
 * array. Which of the two is "the" list has evidently moved, so the client asks
 * for the documented one first and falls back to the locale file when the
 * answer is not a usable array. Both are named in 9.4.
 */
export const GFN_GAME_LIST_LOCALE_URL =
  'https://static.nvidiagrid.net/supported-public-game-list/locales/gfnpc-en-US.json';

/** Milliseconds between requests. One static file; the pace barely matters. */
export const GFN_INTERVAL_MS = 500;

/**
 * The Steam app id in a store URL, or null for anything else.
 *
 * `steamUrl` is an empty string for the Epic, Ubisoft Connect, GOG and Origin
 * entries, and the field is present on every entry either way, so "no Steam id"
 * is the ordinary case rather than a malformed record. A query string or a
 * trailing slash is tolerated; anything that is not a `/app/<digits>` path is
 * not.
 */
export function steamAppIdFromStoreUrl(url: string | undefined | null): number | null {
  if (!url) return null;

  const match = /^https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:[/?#]|$)/.exec(url.trim());
  if (!match) return null;

  const appId = Number(match[1]);
  return Number.isSafeInteger(appId) && appId > 0 ? appId : null;
}

export interface GfnMapping {
  /** One entry per game that carries a Steam app id we can join on. */
  keys: GfnMatchKey[];
  /** Entries the list carried at all. */
  total: number;
  /** Entries with no Steam app id: the Epic, Ubisoft, GOG and Origin ones. */
  withoutSteamId: number;
}

/**
 * Turn the published list into join keys.
 *
 * The join is the Steam app id, because that is the one identifier the list and
 * our catalog share: the mirror stores it in `media_items.external_ids.steam`
 * (work queue item 8) and NVIDIA puts it in `steamUrl`. Entries from the other
 * storefronts are dropped rather than matched by title -- the same game is
 * usually in the list twice, once per store, and a title match would then be
 * ambiguous on the source side anyway.
 *
 * `status` is carried but not filtered on: `MAINTENANCE` and `PATCHING` mean a
 * game is briefly unplayable, not that it has left the service, and "it is on
 * GeForce NOW" stays true through both.
 */
export function mapGfnEntries(entries: GfnEntry[]): GfnMapping {
  const keys: GfnMatchKey[] = [];
  let withoutSteamId = 0;

  for (const entry of entries) {
    const steamAppId = steamAppIdFromStoreUrl(entry.steamUrl);
    if (steamAppId === null) {
      withoutSteamId += 1;
      continue;
    }
    keys.push({
      key: String(steamAppId),
      sourceRef: entry.id === undefined ? null : String(entry.id),
      title: entry.title ?? '',
    });
  }

  return { keys, total: entries.length, withoutSteamId };
}

export type GeForceNowClientOptions = Omit<JsonClientOptions, 'name'> & {
  /** Overridden in tests; in production these are the two URLs above. */
  urls?: readonly string[];
};

/** Read-only client for NVIDIA's supported-game list. No key, one request. */
export class GeForceNowClient {
  private readonly http: JsonClient;
  private readonly urls: readonly string[];

  constructor(options: GeForceNowClientOptions = {}) {
    this.http = new JsonClient({
      name: 'GeForce NOW',
      intervalMs: options.intervalMs ?? GFN_INTERVAL_MS,
      ...options,
    });
    this.urls = options.urls ?? [GFN_GAME_LIST_URL, GFN_GAME_LIST_LOCALE_URL];
  }

  get requestCount(): number {
    return this.http.requestCount;
  }

  /**
   * The supported games, and which URL answered.
   *
   * A URL that answers `null`, `[]`, or something that is not an array is
   * treated as "this one has moved" and the next is tried. An error from the
   * first URL is *not* swallowed: a 500 or a refusal is about the host, and
   * asking it a second question immediately would only make that worse.
   */
  async list(): Promise<{ entries: GfnEntry[]; url: string }> {
    let lastUrl = this.urls[0] ?? GFN_GAME_LIST_URL;

    for (const url of this.urls) {
      lastUrl = url;
      const body = await this.http.getJson<unknown>(url);
      if (Array.isArray(body) && body.length > 0) {
        return { entries: body as GfnEntry[], url };
      }
    }

    return { entries: [], url: lastUrl };
  }
}
