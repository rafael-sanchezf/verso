import { CatalogStore, ITAD_POPULAR_LIMIT, ITAD_RUN_LIMIT } from './db';
import { GAME_PASS_COLLECTIONS, GamePassClient } from './gamepass';
import { GeForceNowClient, mapGfnEntries } from './gfn';
import { ItadClient, itadServiceId } from './itad';
import { indexCatalogByKey, indexCatalogByTitle, matchUnique, normalizeTitle } from './match';
import type { AvailabilityRow, MatchCounts, SourceKey } from './types';

/**
 * The three sources behind "where to play".
 *
 * Named rather than numbered so `--only game-pass` reads as itself in a
 * workflow_dispatch input and in a log line.
 */
export type AvailabilitySource = 'geforce-now' | 'game-pass' | 'itad';

export const AVAILABILITY_SOURCES: readonly AvailabilitySource[] = [
  'geforce-now',
  'game-pass',
  'itad',
];

/**
 * The one market V1 asks any source about.
 *
 * Game Pass is queried per market, GeForce NOW publishes a list per locale, and
 * IsThereAnyDeal takes a country -- so availability is a per-region fact and
 * the table keys on it. Asking three sources about one market keeps tonight's
 * answer small and honest; a second market is a flag away and no migration.
 */
export const DEFAULT_REGION = 'US';

export interface AvailabilityOptions {
  /** The run's single instant, injected so tests and logs agree. */
  now?: Date;
  /** Which sources to run. Defaults to all three. */
  sources?: readonly AvailabilitySource[];
  region?: string;
  /** Games the IsThereAnyDeal pass may ask about. */
  itadLimit?: number;
  /** How many games are eligible for that pass on popularity alone. */
  itadPopularLimit?: number;
  /** Fetch, match and report, but write nothing. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface SourceOutcome {
  source: AvailabilitySource;
  /** The service ids this source wrote, for the log. */
  services: string[];
  /** Entries the source listed, before any matching. */
  listed: number;
  /** Entries that reached a catalog row. */
  matched: number;
  counts: MatchCounts;
  /** Rows written (0 on a dry run). */
  upserted: number;
  /** Rows closed because this run no longer saw them (0 on a dry run). */
  removed: number;
  /**
   * True when this source answered only partly -- a displaycatalog batch that
   * failed, a collection that could not be fetched -- so what it saw was
   * written but nothing was closed out. The rows it did not mention keep
   * yesterday's `last_seen_at` and are reconsidered on the next complete run.
   */
  closeoutSkipped: boolean;
  status: 'ok' | 'skipped' | 'failed';
  /** Why, when the status is not `ok`. */
  reason?: string;
  requests: number;
}

export interface AvailabilityResult {
  region: string;
  outcomes: SourceOutcome[];
  /**
   * False only when every source that was asked to run failed. One source
   * failing is a log line and an exit code of 0, because these endpoints are
   * undocumented and a night without Game Pass is not a night without
   * GeForce NOW.
   */
  ok: boolean;
  durationMs: number;
}

export interface AvailabilityDeps {
  store: CatalogStore;
  gfn: GeForceNowClient;
  gamePass: GamePassClient;
  /** Absent when `ITAD_API_KEY` is not set; the ITAD pass then skips cleanly. */
  itad?: ItadClient | null;
}

const emptyCounts = (): MatchCounts => ({
  ambiguousSource: 0,
  ambiguousCatalog: 0,
  unmatched: 0,
});

function outcome(source: AvailabilitySource, over: Partial<SourceOutcome> = {}): SourceOutcome {
  return {
    source,
    services: [],
    listed: 0,
    matched: 0,
    counts: emptyCounts(),
    upserted: 0,
    removed: 0,
    closeoutSkipped: false,
    status: 'ok',
    requests: 0,
    ...over,
  };
}

/** `a, b and c`, or `nothing`, for a log line. */
function describeExamples(titles: readonly string[]): string {
  if (titles.length === 0) return '';
  return ` (${titles.join('; ')})`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Write one service's matched rows and close what it no longer lists.
 *
 * The order matters and the guards matter more. Rows are written first, so
 * every game the source still lists carries tonight's `last_seen_at`; only then
 * is the close-out run, and it can therefore be the single statement
 * "everything for this service whose `last_seen_at` is older than tonight".
 *
 * Two things stop that second statement, and both exist because it is the only
 * destructive thing this job does.
 *
 * `matched.length === 0` is the obvious one: an empty match is either a source
 * that answered with nothing or a matching rule that has broken, and in both
 * cases the honest action is to leave the table alone rather than quietly
 * announce that every game has left Game Pass.
 *
 * `complete` is the subtle one, and it is the case that matters in practice.
 * The close-out's premise is "we saw the whole service tonight, so anything not
 * in tonight's rows is gone". A partial answer -- one displaycatalog batch of
 * 200 that 500s while the rest succeed -- breaks exactly that premise while
 * leaving `matched` comfortably non-empty, so the first guard never fires and
 * two hundred games get marked removed for a transient server error. When the
 * caller cannot say it saw everything, we still write what we did see (those
 * rows are true) and skip the close-out entirely (that inference is not).
 */
async function writeService(
  store: CatalogStore,
  service: string,
  region: string,
  matched: ReadonlyArray<{ media_item_id: string; source_ref: string | null }>,
  seenAt: Date,
  dryRun: boolean,
  complete: boolean,
): Promise<{ upserted: number; removed: number; closeoutSkipped: boolean }> {
  if (dryRun || matched.length === 0) {
    return { upserted: 0, removed: 0, closeoutSkipped: false };
  }

  const rows: AvailabilityRow[] = matched.map((entry) => ({
    media_item_id: entry.media_item_id,
    service,
    region,
    source_ref: entry.source_ref,
  }));

  const upserted = await store.upsertAvailability(rows, seenAt);
  if (!complete) return { upserted, removed: 0, closeoutSkipped: true };

  const removed = await store.closeMissingAvailability(service, region, seenAt);
  return { upserted, removed, closeoutSkipped: false };
}

/**
 * GeForce NOW: one static file, joined on the Steam app id.
 *
 * The only source of the three that needs no title matching, because NVIDIA
 * publishes the store URL and our mirror stores the Steam app id
 * (`external_ids.steam`, work queue item 8). Entries from the other storefronts
 * are counted and dropped rather than matched by title: the same game is
 * usually in the list once per store, so a title match would be ambiguous on
 * the source side anyway.
 */
async function runGeForceNow(
  deps: AvailabilityDeps,
  region: string,
  seenAt: Date,
  dryRun: boolean,
  log: (message: string) => void,
): Promise<SourceOutcome> {
  const service = 'geforce_now';

  try {
    const { entries, url } = await deps.gfn.list();
    const mapping = mapGfnEntries(entries);
    log(
      `geforce now: ${mapping.total} entries from ${url}, ` +
        `${mapping.keys.length} with a Steam app id, ${mapping.withoutSteamId} without ` +
        `(Epic, Ubisoft Connect, GOG and Origin entries, which we cannot join on)`,
    );

    if (mapping.keys.length === 0) {
      log('geforce now: nothing to match, leaving the table alone');
      return outcome('geforce-now', {
        services: [service],
        listed: mapping.total,
        status: 'failed',
        reason: 'the list carried no Steam app ids at all',
        requests: deps.gfn.requestCount,
      });
    }

    const appIds = mapping.keys.map((entry) => Number(entry.key));
    const catalog = indexCatalogByKey(await deps.store.gamesBySteamAppId(appIds));
    const result = matchUnique(mapping.keys, catalog);

    // One request for the whole service: if it did not throw, we have the
    // entire list, so the close-out's premise holds.
    const written = await writeService(
      deps.store,
      service,
      region,
      result.matched,
      seenAt,
      dryRun,
      true,
    );

    log(
      `geforce now: ${result.matched.length} matched, ` +
        `${result.counts.unmatched} not in the catalog, ` +
        `${result.counts.ambiguousCatalog} ambiguous in the catalog, ` +
        `${result.counts.ambiguousSource} ambiguous in the list; ` +
        `${written.upserted} rows written, ${written.removed} closed`,
    );

    return outcome('geforce-now', {
      services: [service],
      listed: mapping.total,
      matched: result.matched.length,
      counts: result.counts,
      ...written,
      requests: deps.gfn.requestCount,
    });
  } catch (error) {
    log(`geforce now: skipped - ${message(error)}`);
    return outcome('geforce-now', {
      services: [service],
      status: 'failed',
      reason: message(error),
      requests: deps.gfn.requestCount,
    });
  }
}

/**
 * Game Pass: three collections, matched by normalized title.
 *
 * Microsoft gives us a product id and a title and nothing else our catalog
 * knows, so the join is the title -- case-folded, stripped of punctuation,
 * whitespace and the trademark furniture (`normalizeTitle`) -- and accepted
 * only when it is unique on both sides. Everything ambiguous or missing is
 * counted and named in the log, never guessed: a wrong row here tells somebody
 * a game is included in a subscription they pay for when it is not.
 *
 * The catalog's title index is built once and shared by all three collections.
 *
 * Each collection is its own service and its own close-out, so EA Play failing
 * does not touch the two Game Pass tiers.
 */
async function runGamePass(
  deps: AvailabilityDeps,
  region: string,
  seenAt: Date,
  dryRun: boolean,
  log: (message: string) => void,
): Promise<SourceOutcome> {
  const services = GAME_PASS_COLLECTIONS.map((collection) => collection.service);

  let catalog: ReadonlyMap<string, string[]>;
  try {
    catalog = indexCatalogByTitle(await deps.store.gameTitles());
  } catch (error) {
    log(`game pass: skipped - ${message(error)}`);
    return outcome('game-pass', {
      services,
      status: 'failed',
      reason: message(error),
      requests: deps.gamePass.requestCount,
    });
  }

  const totals = outcome('game-pass', { services });
  let succeeded = 0;

  for (const collection of GAME_PASS_COLLECTIONS) {
    try {
      const productIds = await deps.gamePass.collection(collection.siglId, region);
      if (productIds.length === 0) {
        log(`${collection.service}: the collection came back empty, leaving the table alone`);
        continue;
      }

      const { titles, failedBatches } = await deps.gamePass.titles(productIds, region);
      const withoutTitle = productIds.length - titles.size;

      // A failed batch is 200 products we never learned the titles of. They are
      // indistinguishable from products that simply did not match, so the
      // collection is not a complete picture of the service tonight and the
      // close-out must not run over it. Whatever the other batches told us is
      // still true and is still written.
      const complete = failedBatches === 0;

      const keys: SourceKey[] = [...titles].map(([productId, title]) => ({
        key: normalizeTitle(title),
        sourceRef: productId,
        title,
      }));

      const result = matchUnique(keys, catalog);
      const written = await writeService(
        deps.store,
        collection.service,
        region,
        result.matched,
        seenAt,
        dryRun,
        complete,
      );

      log(
        `${collection.service}: ${productIds.length} products, ${titles.size} with a title` +
          (failedBatches > 0 ? ` (${failedBatches} batch(es) failed)` : '') +
          `, ${result.matched.length} matched, ` +
          `${result.counts.unmatched} not in the catalog` +
          describeExamples(result.examples.unmatched) +
          `, ${result.counts.ambiguousSource} ambiguous in the collection` +
          describeExamples(result.examples.ambiguousSource) +
          `, ${result.counts.ambiguousCatalog} ambiguous in the catalog` +
          describeExamples(result.examples.ambiguousCatalog) +
          `; ${written.upserted} rows written, ` +
          (written.closeoutSkipped
            ? 'no rows closed: the answer was incomplete, so nothing is inferred to have left'
            : `${written.removed} closed`),
      );

      totals.listed += productIds.length;
      totals.matched += result.matched.length;
      totals.counts.unmatched += result.counts.unmatched + withoutTitle;
      totals.counts.ambiguousSource += result.counts.ambiguousSource;
      totals.counts.ambiguousCatalog += result.counts.ambiguousCatalog;
      totals.upserted += written.upserted;
      totals.removed += written.removed;
      totals.closeoutSkipped = totals.closeoutSkipped || written.closeoutSkipped;
      succeeded += 1;
    } catch (error) {
      log(`${collection.service}: skipped - ${message(error)}`);
    }
  }

  totals.requests = deps.gamePass.requestCount;
  if (succeeded === 0) {
    totals.status = 'failed';
    totals.reason = 'every Game Pass collection failed or came back empty';
  }
  return totals;
}

/**
 * IsThereAnyDeal: the official one, and the only one that needs a key.
 *
 * Two calls per 200 games: Steam app id to ITAD game id
 * (`/lookup/id/shop/61/v1`), then ITAD game id to subscriptions
 * (`/games/subs/v1`). The subscriptions come back named rather than
 * enumerated, so each becomes `itad:<slug>` -- a namespace that says "whatever
 * IsThereAnyDeal called this" and cannot collide with the four service ids this
 * repository defines.
 *
 * The close-out is scoped to the games this run asked about, which is the whole
 * reason it is a different statement from the other two sources': ITAD answers
 * only for the ids it is sent, so "not in the answer" means "not in a
 * subscription" only for the games in tonight's selection.
 */
async function runItad(
  deps: AvailabilityDeps,
  region: string,
  seenAt: Date,
  dryRun: boolean,
  options: AvailabilityOptions,
  log: (message: string) => void,
): Promise<SourceOutcome> {
  if (!deps.itad) {
    log('itad: skipped, ITAD_API_KEY is not set');
    return outcome('itad', { status: 'skipped', reason: 'ITAD_API_KEY is not set' });
  }

  try {
    const targets = await deps.store.itadTargets({
      limit: options.itadLimit ?? ITAD_RUN_LIMIT,
      popularLimit: options.itadPopularLimit ?? ITAD_POPULAR_LIMIT,
    });
    const tracked = targets.filter((target) => target.tracked).length;
    log(
      `itad: asking about ${targets.length} games (${tracked} tracked by a user, ` +
        `${targets.length - tracked} popular), country ${region}`,
    );

    if (targets.length === 0) {
      return outcome('itad', { status: 'ok', requests: deps.itad.requestCount });
    }

    const itemByAppId = new Map<number, string>();
    for (const target of targets) itemByAppId.set(target.steam_app_id, target.media_item_id);

    const gameIds = await deps.itad.gameIdsBySteamAppId([...itemByAppId.keys()]);
    const itemByGameId = new Map<string, string>();
    for (const [appId, gameId] of gameIds) {
      const mediaItemId = itemByAppId.get(appId);
      // A game ITAD maps two Steam apps onto is one we cannot place: same rule
      // as everywhere else, skip rather than pick.
      if (mediaItemId && !itemByGameId.has(gameId)) itemByGameId.set(gameId, mediaItemId);
    }

    const answers = await deps.itad.subscriptions([...itemByGameId.keys()], region);

    const byService = new Map<string, Array<{ media_item_id: string; source_ref: string | null }>>();
    let listed = 0;
    for (const answer of answers) {
      const mediaItemId = answer.id ? itemByGameId.get(answer.id) : undefined;
      if (!mediaItemId) continue;
      for (const sub of answer.subs ?? []) {
        if (!sub?.name) continue;
        listed += 1;
        const service = itadServiceId(sub.name);
        const rows = byService.get(service) ?? [];
        rows.push({ media_item_id: mediaItemId, source_ref: answer.id ?? null });
        byService.set(service, rows);
      }
    }

    let upserted = 0;
    const rows: AvailabilityRow[] = [];
    for (const [service, matched] of byService) {
      for (const entry of matched) {
        rows.push({ media_item_id: entry.media_item_id, service, region, source_ref: entry.source_ref });
      }
    }

    let removed = 0;
    if (!dryRun) {
      // Only if there is something to write. An empty `rows` is a real answer
      // here, not a missing one.
      if (rows.length > 0) upserted = await deps.store.upsertAvailability(rows, seenAt);

      // And the close-out runs either way, which is the difference between this
      // source and the other two. For Game Pass and GeForce NOW the proof that
      // the source worked is that it listed games; for IsThereAnyDeal it is
      // that `/games/subs/v1` answered at all for the ids we sent, because
      // "none of these five games is in any subscription" is a perfectly
      // ordinary answer and gating on `rows.length` would mean stale `itad:`
      // rows for those five games could never be closed. The scope is exactly
      // the ids we asked about, so an empty answer closes only those.
      removed = await deps.store.closeMissingAvailabilityForItems(
        'itad:%',
        region,
        seenAt,
        targets.map((target) => target.media_item_id),
      );
    }

    const services = [...byService.keys()].sort();
    log(
      `itad: ${gameIds.size}/${targets.length} games known to ITAD, ` +
        `${listed} subscription listings across ${services.length} subscription(s)` +
        (services.length > 0 ? ` (${services.join(', ')})` : '') +
        `; ${upserted} rows written, ${removed} closed`,
    );

    return outcome('itad', {
      services,
      listed: targets.length,
      matched: gameIds.size,
      counts: { ...emptyCounts(), unmatched: targets.length - gameIds.size },
      upserted,
      removed,
      requests: deps.itad.requestCount,
    });
  } catch (error) {
    log(`itad: skipped - ${message(error)}`);
    return outcome('itad', {
      status: 'failed',
      reason: message(error),
      requests: deps.itad?.requestCount ?? 0,
    });
  }
}

/**
 * Fill `game_availability` from the three subscription sources.
 *
 * The shape of the run is "each source is independent". Two of the three are
 * undocumented endpoints that can change or refuse without notice
 * (docs/research/game-data-sources.md 9.1, 9.4), so a source that errors takes
 * only itself down: it is logged, its table rows are left exactly as they were,
 * and the run still exits 0. Only a night on which *every* requested source
 * failed is a failed run.
 *
 * Nothing about a user is read or written. The ITAD selection asks whether
 * anybody tracks a game, never who, and the rows it stores are facts about the
 * game.
 */
export async function runAvailability(
  deps: AvailabilityDeps,
  options: AvailabilityOptions = {},
): Promise<AvailabilityResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.log(message));
  const started = Date.now();
  const region = options.region ?? DEFAULT_REGION;
  const sources = options.sources ?? AVAILABILITY_SOURCES;

  log(
    `availability: ${sources.join(', ')} for region ${region} at ${now.toISOString()}` +
      `${options.dryRun ? ' (dry run: nothing is written)' : ''}`,
  );

  const outcomes: SourceOutcome[] = [];
  for (const source of sources) {
    if (source === 'geforce-now') {
      outcomes.push(await runGeForceNow(deps, region, now, options.dryRun ?? false, log));
    } else if (source === 'game-pass') {
      outcomes.push(await runGamePass(deps, region, now, options.dryRun ?? false, log));
    } else {
      outcomes.push(await runItad(deps, region, now, options.dryRun ?? false, options, log));
    }
  }

  // "Skipped" is a decision, not a failure: ITAD without a key is the expected
  // state of this job until Rafa adds the secret, and it must not fail the run.
  const attempted = outcomes.filter((entry) => entry.status !== 'skipped');
  const ok = attempted.length === 0 || attempted.some((entry) => entry.status === 'ok');

  const result: AvailabilityResult = { region, outcomes, ok, durationMs: Date.now() - started };

  const upserted = outcomes.reduce((sum, entry) => sum + entry.upserted, 0);
  const removed = outcomes.reduce((sum, entry) => sum + entry.removed, 0);
  const matched = outcomes.reduce((sum, entry) => sum + entry.matched, 0);
  log(
    `done: ${matched} games matched, ${upserted} rows written, ${removed} closed, ` +
      `${outcomes.filter((entry) => entry.status === 'ok').length}/${outcomes.length} sources ok, ` +
      `${(result.durationMs / 1000).toFixed(1)}s`,
  );
  for (const entry of outcomes) {
    if (entry.status !== 'ok') log(`  ${entry.source}: ${entry.status} - ${entry.reason ?? ''}`);
    else if (entry.closeoutSkipped) {
      log(
        `  ${entry.source}: wrote what it saw but closed nothing, because the ` +
          `answer was incomplete; the rest is reconsidered on the next whole run`,
      );
    }
  }
  if (!ok) log('every source failed, so nothing was learned tonight');

  return result;
}
