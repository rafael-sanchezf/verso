import { IntervalLimiter, requestTimeout, systemClock, type Clock } from './rate-limit';
import type { SparqlResults } from './types';

/**
 * The Wikidata Query Service SPARQL endpoint.
 *
 * docs/research/game-data-sources.md 2.6. Free, CC0, no key, and the join
 * table between the IGDB id our catalog keys on and every other identifier a
 * game page links out to.
 */
export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';

/**
 * Wikidata's IGDB properties, read off wikidata.org on 2026-09-16 rather than
 * remembered:
 *
 *   * P5794 - "Internet Game Database game ID". An external identifier whose
 *     value is the IGDB **slug** (`^[a-z\d]+...`, formatter
 *     `https://www.igdb.com/games/$1`), not the number our catalog keys on.
 *     https://www.wikidata.org/wiki/Property:P5794
 *   * P9043 - "Internet Game Database numeric game ID", described there as
 *     "numeric identifier for a game on IGDB; use as qualifier for P5794".
 *     It is a *qualifier*, so it hangs off the P5794 statement rather than off
 *     the item, which is why the query below goes item -> statement -> qualifier
 *     (`p:P5794` then `pq:P9043`) instead of the plain `wdt:` shortcut.
 *     https://www.wikidata.org/wiki/Property:P9043
 *
 * The research doc (2.6) lists P5794; it does not mention that the IGDB id we
 * hold is behind the P9043 qualifier, which is the whole reason this query has
 * the shape it has.
 */
export const IGDB_GAME_ID_PROPERTY = 'P5794';
export const IGDB_NUMERIC_GAME_ID_PROPERTY = 'P9043';

/** The `media_items.external_ids` keys this pass can fill. */
export type CrossLinkKey = 'opencritic' | 'metacritic' | 'hltb' | 'steam' | 'gog' | 'epic';

/**
 * One identifier the pass collects: where it lives on Wikidata, what shape its
 * values take, and how a URL is built from one.
 */
export interface CrossLinkProperty {
  /** The SPARQL variable name, and the `external_ids` key it is written to. */
  readonly key: CrossLinkKey;
  /** The Wikidata property, without the `P`-less spellings anywhere. */
  readonly property: string;
  /** The property's English label on wikidata.org, for logs and the PR table. */
  readonly label: string;
  /**
   * `integer` values are parsed and stored as JSON numbers, `slug` values are
   * stored as JSON strings. It decides both the jsonb type and what "smallest"
   * means when Wikidata answers twice.
   */
  readonly kind: 'integer' | 'slug';
  /** The property's own value regex (P1793), used to reject bad values. */
  readonly pattern: RegExp;
  /** The property's formatter URL (P1630), `$1` where the value goes. */
  readonly formatter: string;
  /** The property page the three facts above were read off. */
  readonly source: string;
}

/**
 * Every identifier one Wikidata pass collects, keyed by IGDB numeric id.
 *
 * Each row's property number, value regex (P1793) and formatter URL (P1630)
 * were read off the property's own page on wikidata.org on 2026-09-16 through
 * `wbgetentities`, not remembered and not copied out of the research doc,
 * which predates two of them. Where a property publishes several formatter
 * URLs the one marked `preferred` rank is used, and where it publishes none
 * with a rank the only one is used.
 *
 *   key         property  label                    values           formatter
 *   opencritic  P2864     OpenCritic ID            ^[1-9]\d{0,4}$   https://opencritic.com/game/$1/-
 *   metacritic  P12054    Metacritic game ID       slug             https://www.metacritic.com/game/$1/
 *   hltb        P2816     HowLongToBeat ID         ^[1-9]\d{0,5}$   https://howlongtobeat.com/game/$1
 *   steam       P1733     Steam application ID     ^[1-9]\d{0,6}$   https://store.steampowered.com/app/$1/
 *   gog         P2725     GOG application ID       (game|movie)/..  https://www.gog.com/$1
 *   epic        P6278     Epic Games Store ID      slug             https://store.epicgames.com/p/$1
 *
 * Two identifiers were deliberately left out after measuring them against the
 * 147,617 Wikidata items that carry a P9043 IGDB number (2026-09-16):
 *
 *   * **PlayStation Store.** There is no single property. P5944 (North America
 *     PlayStation Store ID, 4,618 items, 3.1%) and P5971 (Europe, 1,388 items,
 *     0.9%) hold different strings for the same game, each with its own set of
 *     region-locked formatter URLs (26 and 50 of them), so there is no one id
 *     to store and no one URL to show. They are also the messiest of the set:
 *     3.5% and 9.2% of the games carrying them carry more than one value.
 *   * **Nintendo eShop.** P8084 has 5,551 items (3.8%) but is *not* a
 *     single-valued property: it carries no single-value constraint and does
 *     carry a required-qualifier constraint on P400 (platform), so one game is
 *     meant to have one value per platform (`...-switch`, `...-wii-u`,
 *     `...-3ds`). 217 of its games (3.9%) have several, and picking one of
 *     them would hand a Switch owner a 3DS store page.
 *
 * https://www.wikidata.org/wiki/Property:P2864
 * https://www.wikidata.org/wiki/Property:P12054
 * https://www.wikidata.org/wiki/Property:P2816
 * https://www.wikidata.org/wiki/Property:P1733
 * https://www.wikidata.org/wiki/Property:P2725
 * https://www.wikidata.org/wiki/Property:P6278
 */
export const CROSS_LINK_PROPERTIES: readonly CrossLinkProperty[] = [
  {
    key: 'opencritic',
    property: 'P2864',
    label: 'OpenCritic ID',
    kind: 'integer',
    // P1793 verbatim.
    pattern: /^[1-9]\d{0,4}$/,
    formatter: 'https://opencritic.com/game/$1/-',
    source: 'https://www.wikidata.org/wiki/Property:P2864',
  },
  {
    key: 'metacritic',
    property: 'P12054',
    label: 'Metacritic game ID',
    kind: 'slug',
    // P1793 verbatim. The lookahead rejects the numeric form, which is a
    // property of its own (P12078, "Metacritic numeric game ID", a qualifier
    // on this one) and is not what the formatter URL takes.
    //
    // P1712 ("Metacritic ID") is the older, cross-medium property and is the
    // one the research doc names in 2.6 and 3.1. It is not the one to use:
    // only 38 of the 147,617 IGDB-linked items carry it, against 16,778 for
    // P12054, and its own regex now demands the
    // `game/<slug>/critic-reviews/?platform=<platform>` form rather than a
    // bare slug. Measured 2026-09-16.
    pattern: /^(?!1300\d{6})-?[a-z\d]+(-[a-z\d]+){0,19}-?$/,
    formatter: 'https://www.metacritic.com/game/$1/',
    source: 'https://www.wikidata.org/wiki/Property:P12054',
  },
  {
    key: 'hltb',
    property: 'P2816',
    label: 'HowLongToBeat ID',
    kind: 'integer',
    // P1793 verbatim.
    pattern: /^[1-9]\d{0,5}$/,
    // The preferred-rank formatter of the two P2816 publishes; the other is
    // the legacy `game.php?id=$1` form.
    formatter: 'https://howlongtobeat.com/game/$1',
    source: 'https://www.wikidata.org/wiki/Property:P2816',
  },
  {
    key: 'steam',
    property: 'P1733',
    label: 'Steam application ID',
    kind: 'integer',
    // P1793 is published unanchored (`[1-9]\d{0,6}`), which would accept a
    // value with anything around it; anchored here, because a Steam app id
    // with a suffix is not a Steam app id.
    pattern: /^[1-9]\d{0,6}$/,
    // The preferred-rank formatter; the other two are CDN image paths.
    formatter: 'https://store.steampowered.com/app/$1/',
    source: 'https://www.wikidata.org/wiki/Property:P1733',
  },
  {
    key: 'gog',
    property: 'P2725',
    label: 'GOG application ID',
    kind: 'slug',
    // P1793 verbatim. The value carries its own `game/` or `movie/` prefix,
    // because GOG's URL space is shared with the films it sells and the
    // formatter is the bare `https://www.gog.com/$1`; both branches are kept
    // so a value is judged by the property's own rule and not by ours.
    pattern: /^(movie|game)\/[a-z\d]+([_]{1,2}[a-z\d]+){0,10}$/,
    formatter: 'https://www.gog.com/$1',
    source: 'https://www.wikidata.org/wiki/Property:P2725',
  },
  {
    key: 'epic',
    property: 'P6278',
    label: 'Epic Games Store ID',
    kind: 'slug',
    // The one regex in this table that is NOT P1793 verbatim, because P1793 as
    // published is a denial of service.
    //
    // Wikidata's own constraint is `^[a-z\d]+([\-]{0,3}[\_]?[^\sA-Z\W\_]+)*$`.
    // `[^\sA-Z\W_]` reads as "a word character that is neither an upper-case
    // letter nor an underscore", which in JavaScript's default (non-unicode)
    // mode is exactly `[a-z\d]`, so the group is
    // `(-{0,3}_?[a-z\d]+)*` - and both quantifiers before the `[a-z\d]+` can
    // match empty, which degenerates it to `([a-z\d]+)*`. On any value it
    // rejects, the engine then has to try every way of cutting the run of
    // letters into pieces: measured here, 6.9 ms at 20 characters and roughly
    // doubling per character after that, so 21 s for
    // `the-witcher-3-wild-hunt-complete-edition-GOTY` - an ordinary bad value,
    // a real slug with a capitalised suffix.
    //
    // That matters because this pass is unattended and its input is a wiki
    // anybody can edit. One such value hangs the mapper, the workflow's
    // 30-minute timeout kills the job, the chunk is never stamped, and the
    // selection order (`checked_at asc nulls first`) hands the same rows back
    // as chunk one every following night: zero progress, red every night.
    //
    // The form below accepts exactly the same language - a mandatory separator
    // before each group instead of an optional one, which is what removes the
    // ambiguity rather than narrowing it. Verified by exhaustive comparison
    // against the published regex over every string up to six characters from
    // `a b 1 - _ A ! <space>` (299,592 cases, no disagreement), at lengths the
    // published one can still answer in finite time.
    pattern: /^[a-z\d]+(?:-{1,3}_?[a-z\d]+|_[a-z\d]+)*$/,
    // The preferred-rank formatter of the two; the other is the older
    // `www.epicgames.com/p/$1` host.
    formatter: 'https://store.epicgames.com/p/$1',
    source: 'https://www.wikidata.org/wiki/Property:P6278',
  },
];

/**
 * The longest value any identifier regex is ever run against.
 *
 * A belt to the braces of the unambiguous Epic pattern above. Every regex in
 * the table has been checked to be linear, but they are copies of rules a wiki
 * publishes and can be changed, and the values they judge come from that same
 * wiki: an unattended nightly job should not be one upstream edit away from
 * spending its whole timeout inside `RegExp.test`. Length is checked first, so
 * the cost of a hostile value is bounded whatever the pattern turns out to do.
 *
 * 200 characters, which is an order of magnitude above anything the properties
 * allow: the most generous is Metacritic's twenty hyphen-separated segments,
 * and the longest value in the live capture
 * (`the-legend-of-zelda-breath-of-the-wild`) is 38.
 */
export const MAX_IDENTIFIER_LENGTH = 200;

/** The property table by `external_ids` key. */
export const CROSS_LINK_PROPERTY_BY_KEY: ReadonlyMap<CrossLinkKey, CrossLinkProperty> = new Map(
  CROSS_LINK_PROPERTIES.map((property) => [property.key, property]),
);

/**
 * `external_ids.steam` is filled by this pass but never overwritten by it.
 *
 * IGDB is the catalog spine and its Steam app id arrives with the nightly
 * mirror (`selectSteamAppId` in map.ts), so where the mirror has an answer
 * that answer is authoritative and Wikidata's is only a second opinion. Where
 * the mirror has none - an older or regionally odd game IGDB never linked to a
 * store - Wikidata's is better than nothing, and P1733 is the best-covered
 * property in the table by a distance (117,141 of 147,617 IGDB-linked items,
 * 79%, measured 2026-09-16).
 *
 * The merge in `upsertCrossLinks` gives this for free, because it lets the
 * existing key win for every key rather than for this one specially; what is
 * special about `steam` is only that a disagreement is worth counting, which
 * `countSteamDisagreements` does before the write.
 */
export const STEAM_FILL_ONLY_KEY: CrossLinkKey = 'steam';

/**
 * IGDB ids per SPARQL query.
 *
 * 500, the same figure as {@link BATCH_SIZE} in db.ts, sent as a `VALUES`
 * block in a POST body so no URL length limit is anywhere near. Measured
 * against the live endpoint on 2026-09-16: a 500-id query carrying every
 * column in {@link CROSS_LINK_PROPERTIES} is a 4.3 KB body and came back in
 * 2.2 to 14.4 seconds depending on how warm the service was, comfortably
 * inside the Query Service's 60-second deadline
 * (docs/research/game-data-sources.md 2.6) with room for a cold run.
 */
export const WIKIDATA_CHUNK_SIZE = 500;

/**
 * Milliseconds between the start of one query and the next.
 *
 * The Query Service allows 5 parallel queries per IP and 60 seconds of
 * processing per 60-second window per client; exceeding either gets a 429 and
 * repeat offenders get banned (docs/research/game-data-sources.md 2.6). This
 * job runs one query at a time with a five-second floor between starts, which
 * is a tenth of the allowed concurrency and leaves the processing window as
 * the only limit that can bite - and that one announces itself with a 429 and
 * a Retry-After, which {@link WikidataClient} obeys.
 */
export const WIKIDATA_INTERVAL_MS = 5000;

/**
 * Queries one run may make before it stops: 40, or 20,000 ids at
 * {@link WIKIDATA_CHUNK_SIZE}.
 *
 * A ceiling on the client, not the shape of a normal run. The id pass asks
 * about far fewer games than this a night (see `DEFAULT_ID_LIMIT`, which is
 * limited by what Postgres can be asked to rewrite rather than by what
 * Wikidata will answer), so the budget only bites on a deliberate catch-up run
 * with `--limit`.
 */
export const WIKIDATA_RUN_BUDGET = 40;

/** First backoff when the service refuses and sends no Retry-After. */
export const WIKIDATA_BACKOFF_MS = 10_000;

/** Attempts per query, including the first. */
export const WIKIDATA_MAX_ATTEMPTS = 4;

/**
 * How long one query may take before it is abandoned.
 *
 * 30 seconds, which is a client-side deadline and a different thing from the
 * Query Service's own 60-second server-side one: the server's protects the
 * service from our query, this protects the run from a connection that never
 * answers at all. Half the server's limit on purpose - a query this job sends
 * measured 0.2 to 14.4 seconds against the live endpoint on 2026-09-16, so
 * thirty seconds is already generous and a chunk lost to the deadline is
 * retried, then simply comes round again on the next run.
 */
export const WIKIDATA_TIMEOUT_MS = 30_000;

/**
 * The User-Agent Wikimedia's policy requires: a name, a version, and a way to
 * reach whoever is running it. A client without a meaningful one risks being
 * blocked with no notice (docs/research/game-data-sources.md 2.6).
 */
export const WIKIDATA_USER_AGENT = 'Verso/0.0 (https://github.com/rafael-sanchezf/verso)';

export class WikidataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'WikidataError';
  }
}

/**
 * Thrown when the Query Service has refused us repeatedly. The caller stops
 * the run instead of spending the rest of the budget on queries that will be
 * refused too, which is also what keeps us off the repeat-offender list.
 */
export class WikidataRateLimitedError extends WikidataError {
  constructor(status: number, attempts: number) {
    super(`Wikidata Query Service returned ${status} on ${attempts} consecutive attempts`, status);
    this.name = 'WikidataRateLimitedError';
  }
}

/** Thrown when the run's hard cap is reached. Not a failure: a stopping point. */
export class WikidataBudgetExhaustedError extends Error {
  constructor(readonly budget: number) {
    super(`Wikidata query budget of ${budget} queries is spent`);
    this.name = 'WikidataBudgetExhaustedError';
  }
}

export interface WikidataClientOptions {
  clock?: Clock;
  fetchImpl?: typeof fetch;
  /** Queries this client may make before it refuses. */
  budget?: number;
  intervalMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
  endpoint?: string;
  timeoutMs?: number;
}

/**
 * `Retry-After` as milliseconds: the header is either delta-seconds or an
 * HTTP date (RFC 9110). Anything unreadable yields null and the caller falls
 * back to its own backoff.
 */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;

  return Math.max(at - now, 0);
}

/**
 * The one query that maps a chunk of our IGDB ids onto every identifier in
 * {@link CROSS_LINK_PROPERTIES}.
 *
 * One query rather than one per identifier, which is what makes adding the
 * next one free: the join to the IGDB number is the expensive half and it is
 * done once, each identifier riding along as an OPTIONAL column. A 500-id
 * query measured 4.3 KB of body, 567 rows and 2.2 seconds against the live
 * endpoint on 2026-09-16, against 3.6 KB and 500-odd rows for the single-column
 * version it replaces.
 *
 * `VALUES` binds the chunk as string literals because P9043 is an external
 * identifier, whose values are strings in Wikidata however numeric they look.
 * The two required triples then read: this item has a P5794 statement, and
 * that statement carries this P9043 qualifier. Everything after them is
 * OPTIONAL, so a game Wikidata knows only a Steam id for still comes back.
 *
 * `wdt:` on every identifier is deliberate - it skips deprecated-rank
 * statements, so an id Wikidata has marked wrong never reaches us.
 *
 * OPTIONAL columns multiply: a game with two Metacritic slugs and two Epic
 * slugs comes back as four rows carrying the same Steam id. That is expected
 * and is why the mapper is a list of per-row answers and `dedupeCrossLinks`
 * is what decides. Measured on the same 500-id chunk, the multiplication costs
 * 13% more rows (567 for 500 ids, worst case 8 rows for one game), which is
 * nothing next to a second round trip.
 */
export function crossLinkQuery(igdbIds: readonly number[]): string {
  const values = igdbIds.map((id) => `"${id}"`).join(' ');
  const columns = CROSS_LINK_PROPERTIES.map((property) => `?${property.key}`).join(' ');

  return [
    `SELECT ?igdb ${columns} WHERE {`,
    `  VALUES ?igdb { ${values} }`,
    `  ?item p:${IGDB_GAME_ID_PROPERTY} ?statement .`,
    `  ?statement pq:${IGDB_NUMERIC_GAME_ID_PROPERTY} ?igdb .`,
    ...CROSS_LINK_PROPERTIES.map(
      (property) => `  OPTIONAL { ?item wdt:${property.property} ?${property.key} . }`,
    ),
    '}',
  ].join('\n');
}

/**
 * Read-only client for the Wikidata Query Service.
 *
 * Serial by construction, like {@link SteamStorefrontClient}: one query at a
 * time, a floor on the gap between starts, and a budget that caps the whole
 * run. Wikidata publishes its limits (unlike Steam's storefront), and this
 * stays an order of magnitude inside them, because the cost of being wrong
 * here is a block rather than a slow night.
 *
 * No key and no login: the endpoint is public and its data is CC0. Nothing
 * about a user is sent; the request body is a list of IGDB ids.
 */
export class WikidataClient {
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: IntervalLimiter;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  readonly budget: number;

  /** Queries actually sent, retries included. Counts against the budget. */
  requestCount = 0;
  retryCount = 0;

  constructor(options: WikidataClientOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.budget = options.budget ?? WIKIDATA_RUN_BUDGET;
    this.maxAttempts = options.maxAttempts ?? WIKIDATA_MAX_ATTEMPTS;
    this.backoffMs = options.backoffMs ?? WIKIDATA_BACKOFF_MS;
    this.endpoint = options.endpoint ?? WIKIDATA_SPARQL_URL;
    this.timeoutMs = options.timeoutMs ?? WIKIDATA_TIMEOUT_MS;
    this.limiter = new IntervalLimiter({
      intervalMs: options.intervalMs ?? WIKIDATA_INTERVAL_MS,
      clock: this.clock,
    });
  }

  get remaining(): number {
    return Math.max(this.budget - this.requestCount, 0);
  }

  get exhausted(): boolean {
    return this.remaining <= 0;
  }

  /**
   * One paced POST, retried with backoff on 429 and 5xx.
   *
   * POST rather than GET so the `VALUES` block has no URL length to fit
   * inside; the endpoint accepts a form-encoded `query` parameter either way.
   *
   * 5xx is retried because the service really does answer 502 transiently -
   * observed on 2026-09-16, the same query failing with a gateway error and
   * succeeding seconds later - and a chunk lost to that would otherwise wait a
   * whole day.
   *
   * A 429's `Retry-After` wins over our own backoff when it asks for longer,
   * and it slows the limiter itself through `pause`, so the wait is the run's
   * and not just this query's.
   */
  private async post<T>(query: string): Promise<T> {
    let attempt = 0;

    for (;;) {
      attempt += 1;
      if (this.exhausted) throw new WikidataBudgetExhaustedError(this.budget);

      const response = await this.limiter.run(async () => {
        this.requestCount += 1;
        return this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/sparql-results+json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': WIKIDATA_USER_AGENT,
          },
          body: new URLSearchParams({ query }).toString(),
          ...requestTimeout(this.timeoutMs),
        });
      });

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new WikidataError('Wikidata Query Service returned unparseable JSON', 200);
        }
      }

      const refused = response.status === 429;
      const retryable = refused || response.status >= 500;

      if (!retryable) {
        throw new WikidataError(
          `Wikidata Query Service returned ${response.status}`,
          response.status,
        );
      }

      if (attempt >= this.maxAttempts) {
        if (refused) throw new WikidataRateLimitedError(response.status, attempt);
        throw new WikidataError(
          `Wikidata Query Service returned ${response.status} after ${attempt} attempts`,
          response.status,
        );
      }

      this.retryCount += 1;
      const ours = this.backoffMs * 2 ** (attempt - 1);
      const asked = retryAfterMs(response.headers.get('retry-after'), this.clock.now());
      const backoff = Math.max(ours, asked ?? 0);

      if (refused) this.limiter.pause(backoff);
      await this.clock.sleep(backoff);
    }
  }

  /** Run one SPARQL query and hand back the raw results document. */
  async select(query: string): Promise<SparqlResults> {
    return this.post<SparqlResults>(query);
  }

  /** Every cross-link Wikidata knows for one chunk of IGDB ids. */
  async crossLinks(igdbIds: readonly number[]): Promise<SparqlResults> {
    return this.select(crossLinkQuery(igdbIds));
  }
}
