/**
 * Where to play: which subscription services a game is on right now.
 *
 * The rows come from the nightly `availability` command in `packages/catalog`,
 * which reads the Game Pass catalog, NVIDIA's GeForce NOW list and
 * IsThereAnyDeal's subscriptions API
 * (docs/research/game-data-sources.md 9.1, 9.4, 9.5) and writes
 * `public.game_availability`. Nothing in the app calls any of those.
 *
 * Three things a screen has to know before it draws any of this.
 *
 * 1. **Empty is the normal case**, not an error. Most games are on no
 *    subscription, the catalog is far larger than the set the job asks
 *    IsThereAnyDeal about, and a source having a bad night simply leaves
 *    yesterday's rows in place. A game with nothing here draws nothing.
 * 2. **These rows are up to a day old**, and two of the three sources are
 *    undocumented endpoints that can change without notice. "Best-effort
 *    integrations, honest UI" (ROADMAP.md) means the game page says where it
 *    got this and does not promise it is live.
 * 3. **PS Plus and Nintendo Switch Online are absent on purpose.** Neither has
 *    a data source that is not scraping (9.2, 9.3), so the app says nothing
 *    about them rather than implying a game is not on them.
 *
 * Neither function takes a user id and neither reads one: `game_availability`
 * is catalog-shaped data, readable by every signed-in user, and it records what
 * a game is on, never who is subscribed.
 */

import type { Client } from './client';

/** One service a game is currently on. */
export interface Availability {
  /**
   * The service id as the job writes it: `game_pass_console`, `game_pass_pc`,
   * `ea_play`, `geforce_now`, or `itad:<slug>` for anything IsThereAnyDeal
   * reports. Pass it through {@link formatService} before drawing it.
   */
  service: string;
  /** The market this was observed in. `US` is the only one V1 fills. */
  region: string;
  /**
   * When we first saw the game on the service. ISO timestamp. Not the date the
   * game joined -- it is the date our job first noticed -- so a screen that
   * shows it should say "since we saw it" rather than claim the service's own
   * date.
   */
  since: string;
}

/**
 * The display names for the four services V1 writes itself.
 *
 * Game Pass is two rows and two names because Microsoft sells it as two tiers
 * with different catalogs, and "it is on Game Pass" is the wrong answer to
 * somebody holding the other one.
 */
const SERVICE_NAMES: Record<string, string> = {
  game_pass_console: 'Game Pass (console)',
  game_pass_pc: 'Game Pass (PC)',
  ea_play: 'EA Play',
  geforce_now: 'GeForce NOW',
};

/**
 * The order the four known services are drawn in. Anything else sorts after
 * them, alphabetically, so a subscription IsThereAnyDeal adds one night appears
 * in a predictable place rather than wherever the database happened to return
 * it.
 */
const SERVICE_ORDER = ['game_pass_console', 'game_pass_pc', 'ea_play', 'geforce_now'];

/**
 * A service id as a person would read it.
 *
 * The four ids this repository defines have written-out names. An `itad:<slug>`
 * id is title-cased from its slug, because those names come from
 * IsThereAnyDeal and a new one can appear on any night: mapping them by hand
 * would mean a game page drawing a raw id the first time that happened. Any
 * other id is returned unchanged, which is visible enough to be reported and
 * harmless enough not to break a screen.
 */
export function formatService(service: string): string {
  const known = SERVICE_NAMES[service];
  if (known) return known;

  if (service.startsWith('itad:')) {
    const slug = service.slice('itad:'.length);
    if (slug.length === 0) return service;
    return slug
      .split('-')
      .filter((word) => word.length > 0)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return service;
}

/** Fixed order first, then everything else alphabetically. */
function compare(a: Availability, b: Availability): number {
  const rankA = SERVICE_ORDER.indexOf(a.service);
  const rankB = SERVICE_ORDER.indexOf(b.service);
  if (rankA !== rankB) {
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  }
  return a.service.localeCompare(b.service) || a.region.localeCompare(b.region);
}

/**
 * Every service one game is on right now.
 *
 * `removed_at is null` is the whole filter, and it is what "right now" means:
 * a game that left Game Pass keeps its row, dated, and simply stops appearing
 * here. The partial index `game_availability_current` covers exactly this
 * predicate and carries the three columns selected, so the read never touches
 * the heap.
 *
 * An empty array is the ordinary answer, never an error.
 */
export async function availabilityFor(
  client: Client,
  mediaItemId: string,
): Promise<Availability[]> {
  const { data, error } = await client
    .from('game_availability')
    .select('service, region, first_seen_at')
    .eq('media_item_id', mediaItemId)
    .is('removed_at', null);
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({ service: row.service, region: row.region, since: row.first_seen_at }))
    .sort(compare);
}

/**
 * The same, for a list of games, as a record keyed by media item id.
 *
 * One query rather than one per row, because this is what a list screen needs:
 * a Ranking or Backlog page draws twenty rows and asking twenty times would be
 * twenty round trips for data that is one index scan.
 *
 * Every requested id gets a key, including the ones with nothing, so a caller
 * can read `byId[id]` without a null check and a missing game is an empty array
 * rather than `undefined`.
 */
export async function availabilityForMany(
  client: Client,
  mediaItemIds: readonly string[],
): Promise<Record<string, Availability[]>> {
  const byId: Record<string, Availability[]> = {};
  for (const id of mediaItemIds) byId[id] = [];
  if (mediaItemIds.length === 0) return byId;

  const { data, error } = await client
    .from('game_availability')
    .select('media_item_id, service, region, first_seen_at')
    .in('media_item_id', [...mediaItemIds])
    .is('removed_at', null);
  if (error) throw error;

  for (const row of data ?? []) {
    const bucket = byId[row.media_item_id];
    // A row for an id we did not ask about cannot happen through `in`, but the
    // guard costs nothing and keeps the record exactly the shape promised.
    if (!bucket) continue;
    bucket.push({ service: row.service, region: row.region, since: row.first_seen_at });
  }

  for (const id of mediaItemIds) byId[id]!.sort(compare);
  return byId;
}
