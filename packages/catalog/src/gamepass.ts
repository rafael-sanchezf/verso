import { JsonClient, type JsonClientOptions } from './http';
import type { DisplayCatalogResponse, GamePassCollection, SiglEntry } from './types';

/** Microsoft's collection endpoint, undocumented (game-data-sources.md 9.1). */
export const GAME_PASS_SIGL_URL = 'https://catalog.gamepass.com/sigls/v2';

/** Microsoft's product endpoint, equally undocumented, and the only source of titles. */
export const DISPLAY_CATALOG_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products';

/**
 * The three collections V1 reads, and the service id each becomes.
 *
 * The UUIDs are the ones the NikkelM/Game-Pass-API tool uses, verified against
 * its source on 2026-09-16 (js/gamePass.js, the `APIIds` map: console
 * `f6f1f99f-…`, pc `fdd9e2a7-…`, eaPlay `b8900d09-…`), which is what
 * docs/research/game-data-sources.md 9.1 cites them from. They are opaque ids
 * on an endpoint Microsoft documents nowhere, so they can stop working without
 * warning; the run is built to survive that (a source that errors is skipped,
 * see availability.ts).
 *
 * EA Play is its own collection and its own service rather than a third Game
 * Pass tier, because that is what it is: a separate subscription that Game Pass
 * Ultimate happens to include.
 */
export const GAME_PASS_COLLECTIONS: readonly GamePassCollection[] = [
  { service: 'game_pass_console', siglId: 'f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e' },
  { service: 'game_pass_pc', siglId: 'fdd9e2a7-0fee-49f6-ad69-4354098401ff' },
  { service: 'ea_play', siglId: 'b8900d09-a491-44cc-916e-32b5acae621b' },
];

/**
 * Product ids per displaycatalog request.
 *
 * 200, the batch size NikkelM/Game-Pass-API uses (`PRODUCTS_BATCH_SIZE`). At
 * roughly 1,200 products across the three collections that is a handful of
 * requests a night.
 */
export const DISPLAY_CATALOG_BATCH_SIZE = 200;

/** Milliseconds between requests to either Microsoft host. */
export const GAME_PASS_INTERVAL_MS = 600;

/** The language every request asks for, which fixes what a title looks like. */
export const GAME_PASS_LANGUAGE = 'en-us';

/**
 * The product ids in a `sigls/v2` answer.
 *
 * The array's first element is the collection's own header -- `siglId`,
 * `title`, `description`, an image -- and every element after it is `{"id":
 * "9NPDN9R45JX4"}`. Reading "every element that has an `id`" rather than
 * "everything after the first" means a day when Microsoft drops the header, or
 * adds a second one, costs nothing.
 */
export function productIdsFromSigl(entries: SiglEntry[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const id = entry?.id;
    if (typeof id !== 'string' || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

/**
 * Product id to title, from a displaycatalog answer.
 *
 * `LocalizedProperties` is an array with one entry per requested language and
 * we ask for one, so the title is the first entry's `ProductTitle`. A product
 * with no title is dropped rather than matched on an empty string, which would
 * collide with every other titleless product.
 */
export function titlesFromDisplayCatalog(response: DisplayCatalogResponse): Map<string, string> {
  const titles = new Map<string, string>();

  for (const product of response?.Products ?? []) {
    const id = product?.ProductId;
    const title = product?.LocalizedProperties?.[0]?.ProductTitle;
    if (typeof id !== 'string' || typeof title !== 'string' || title.trim().length === 0) continue;
    titles.set(id, title);
  }

  return titles;
}

export type GamePassClientOptions = Omit<JsonClientOptions, 'name'> & {
  siglUrl?: string;
  productsUrl?: string;
  batchSize?: number;
};

/**
 * Read-only client for the two Microsoft endpoints behind Game Pass.
 *
 * No key and no login: both are the public store's own JSON, which is why
 * 9.1 calls the catalog "undocumented but stable". Nothing here reads or writes
 * anything about a person.
 */
export class GamePassClient {
  private readonly http: JsonClient;
  private readonly siglUrl: string;
  private readonly productsUrl: string;
  private readonly batchSize: number;

  constructor(options: GamePassClientOptions = {}) {
    this.http = new JsonClient({
      name: 'Game Pass catalog',
      intervalMs: options.intervalMs ?? GAME_PASS_INTERVAL_MS,
      ...options,
    });
    this.siglUrl = options.siglUrl ?? GAME_PASS_SIGL_URL;
    this.productsUrl = options.productsUrl ?? DISPLAY_CATALOG_URL;
    this.batchSize = options.batchSize ?? DISPLAY_CATALOG_BATCH_SIZE;
  }

  get requestCount(): number {
    return this.http.requestCount;
  }

  /** The product ids in one collection, for one market. */
  async collection(siglId: string, market: string): Promise<string[]> {
    const url =
      `${this.siglUrl}?id=${encodeURIComponent(siglId)}` +
      `&language=${GAME_PASS_LANGUAGE}&market=${encodeURIComponent(market)}`;
    const body = await this.http.getJson<unknown>(url);

    if (!Array.isArray(body)) return [];
    return productIdsFromSigl(body as SiglEntry[]);
  }

  /**
   * Titles for product ids, in batches.
   *
   * A batch that fails takes only its own products with it: the rest of the
   * collection still has titles, and a product with no title simply does not
   * match anything, which is the same outcome as a title we cannot place. The
   * alternative -- one bad batch failing the whole service -- would turn a
   * transient 500 into "Game Pass has no games tonight", and the reconciliation
   * would then mark the entire catalog removed. That is the failure this method
   * exists to not have.
   */
  async titles(
    productIds: readonly string[],
    market: string,
  ): Promise<{ titles: Map<string, string>; failedBatches: number }> {
    const titles = new Map<string, string>();
    let failedBatches = 0;

    for (let start = 0; start < productIds.length; start += this.batchSize) {
      const batch = productIds.slice(start, start + this.batchSize);
      const url =
        `${this.productsUrl}?bigIds=${batch.map(encodeURIComponent).join(',')}` +
        `&market=${encodeURIComponent(market)}&languages=${GAME_PASS_LANGUAGE}`;

      try {
        const body = await this.http.getJson<DisplayCatalogResponse>(url);
        for (const [id, title] of titlesFromDisplayCatalog(body)) titles.set(id, title);
      } catch {
        failedBatches += 1;
      }
    }

    return { titles, failedBatches };
  }
}
