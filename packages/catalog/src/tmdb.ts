import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { RateLimiter, requestTimeout, systemClock, type Clock } from './rate-limit';
import { retryAfterMs } from './wikidata';
import { movieDetailPath, TMDB_API_BASE, TMDB_LANGUAGE, tvDetailPath } from './tmdb-paths.ts';
import type {
  TmdbChangesPage,
  TmdbExportLine,
  TmdbMedium,
  TmdbMovieDetail,
  TmdbProviderDirectory,
  TmdbProviderDirectoryEntry,
  TmdbTvDetail,
} from './tmdb-types';

const API_BASE = TMDB_API_BASE;
const EXPORT_BASE = 'https://files.tmdb.org/p/exports';

// The request constants live in tmdb-paths.ts so the search-miss Edge Function
// asks for a film exactly as this client does; re-exported for the callers
// that have always imported them from here.
export { MOVIE_APPEND, TMDB_LANGUAGE, TMDB_TOKEN_ENV, TV_APPEND } from './tmdb-paths.ts';

/**
 * Starts a second, and requests in flight at once.
 *
 * Half of what TMDB says it allows. The documentation retired the old
 * 40-per-10-seconds cap in 2019 and now says the limits "sit somewhere in the
 * 40 requests per second range" and can change without notice
 * (docs/research/film-tv-data-sources.md 2.3). A published allowance is a
 * budget to spend, which is why this is the {@link RateLimiter} shape rather
 * than the `IntervalLimiter` one the undocumented endpoints get, but a figure
 * that is explicitly approximate and explicitly changeable is not a figure to
 * sit exactly on. Twenty a second still pulls a 55,000-title full run in about
 * three quarters of an hour.
 *
 * Eight in flight is the same concurrency the IGDB client uses, and is what
 * keeps a slow response from stalling the whole pull without opening so many
 * sockets that a runner starts queueing them itself.
 */
export const TMDB_REQUESTS_PER_SECOND = 20;
export const TMDB_MAX_IN_FLIGHT = 8;

/** Never slower than this, however many times the pace is halved. */
export const TMDB_MIN_REQUESTS_PER_SECOND = 1;

/**
 * Consecutive 429s that buy a permanent halving of the pace.
 *
 * One 429 is noise: a burst that happened to land together, or somebody else
 * on the same runner address. Two in a row is the endpoint telling us the
 * published figure is not what is being enforced today, and the right answer
 * to that is to go slower for the rest of the run rather than to keep
 * discovering it one refusal at a time.
 */
export const TMDB_HALVE_PACE_AFTER = 2;

/** Ids per page of `/3/movie/changes` and `/3/tv/changes`. TMDB's own figure. */
export const CHANGES_PAGE_SIZE = 100;

/** Attempts per request, including the first. */
export const TMDB_MAX_ATTEMPTS = 4;

/** First blind backoff when a 429 carries no `Retry-After`. Doubles: 2s, 4s, 8s. */
export const TMDB_BACKOFF_MS = 2000;

/** The longest a `Retry-After` header may make us wait, as `http.ts` caps it. */
export const TMDB_MAX_RETRY_AFTER_MS = 60_000;

/**
 * How long one request may take before it is abandoned.
 *
 * Thirty seconds, the deadline every other client in this package uses. A
 * title fetch that hangs would otherwise be bounded only by the workflow's own
 * two-hour kill, and an abort is a normal failure the retry already knows what
 * to do with.
 */
export const TMDB_TIMEOUT_MS = 30_000;

/**
 * How long the daily export download may take.
 *
 * Longer than an API call because it is a 28 MB file rather than a few
 * kilobytes of JSON, and it is streamed rather than buffered, so the deadline
 * has to cover the whole walk of a million lines.
 */
export const TMDB_EXPORT_TIMEOUT_MS = 300_000;

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

export interface TmdbClientOptions {
  /** The v4 read access token. Sent as a bearer on every v3 route. */
  readAccessToken: string;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

/** Two digits, for the `MM_DD_YYYY` in an export file name. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The `MM_DD_YYYY` an export file name carries, read in UTC.
 *
 * UTC because the file is published on TMDB's clock, not the runner's: a job
 * that starts at 14:00 UTC is already the next day in Auckland, and asking for
 * tomorrow's file would 404 every night.
 */
export function exportDateStamp(date: Date): string {
  return `${pad(date.getUTCMonth() + 1)}_${pad(date.getUTCDate())}_${date.getUTCFullYear()}`;
}

/** The file name for one medium's daily export. */
export function exportFileName(kind: TmdbMedium, date: Date): string {
  const prefix = kind === 'movie' ? 'movie_ids' : 'tv_series_ids';
  return `${prefix}_${exportDateStamp(date)}.json.gz`;
}

/** `YYYY-MM-DD` in UTC, which is the form the changes endpoint takes. */
export function changesDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * TMDB client: bearer auth, one rate limiter, and the four kinds of request a
 * mirror run makes.
 *
 * The v4 read access token works on every v3 route, so there is no token
 * exchange here and nothing to cache: unlike IGDB, the credential the run
 * starts with is the credential every request carries.
 *
 * One limiter for the whole client, because TMDB's allowance is per
 * application rather than per endpoint: the changes walk has to queue behind
 * the title fetches or the run starts collecting 429s it then has to sleep
 * off. The export downloads are the exception and deliberately bypass it --
 * they are files from a static host, not API calls, and TMDB's rate limiting
 * has nothing to say about them.
 */
export class TmdbClient {
  private readonly token: string;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly timeoutMs: number;
  private readonly limiter: RateLimiter;

  /** 429s seen with no other answer between them. Reset by any other status. */
  private consecutiveRefusals = 0;

  /** API requests actually sent, retries included. */
  requestCount = 0;
  retryCount = 0;
  /** Export files downloaded. Not API calls, so counted apart. */
  fileRequestCount = 0;
  /** How many times a pair of refusals halved the pace. */
  paceHalvings = 0;

  constructor(options: TmdbClientOptions) {
    this.token = options.readAccessToken;
    this.clock = options.clock ?? systemClock;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxAttempts = options.maxAttempts ?? TMDB_MAX_ATTEMPTS;
    this.backoffMs = options.backoffMs ?? TMDB_BACKOFF_MS;
    this.timeoutMs = options.timeoutMs ?? TMDB_TIMEOUT_MS;
    this.limiter = new RateLimiter({
      perSecond: TMDB_REQUESTS_PER_SECOND,
      maxInFlight: TMDB_MAX_IN_FLIGHT,
      clock: this.clock,
    });
  }

  /** The pace in force right now, for the run's log line. */
  get requestsPerSecond(): number {
    return this.limiter.requestsPerSecond;
  }

  /** How many requests may be open at once. The sync's fetch pool matches it. */
  get maxInFlight(): number {
    return TMDB_MAX_IN_FLIGHT;
  }

  /**
   * One rate-limited GET, retried on 429 and on 5xx.
   *
   * `notFoundIsNull` is what separates a title TMDB has deleted or merged from
   * an outage. A 404 on `/3/movie/{id}` is an answer -- the id in our catalog
   * or in today's export is no longer a title -- and the caller stamps
   * `metadata.tmdb_missing_at` and moves on. A 404 on anything else is a bug
   * in a URL this file built and is thrown like any other refusal.
   */
  private async request<T>(path: string, notFoundIsNull = false): Promise<T | null> {
    const url = `${API_BASE}${path}`;
    let attempt = 0;

    for (;;) {
      attempt += 1;

      const response = await this.limiter.run(async () => {
        this.requestCount += 1;
        return this.fetchImpl(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
          },
          ...requestTimeout(this.timeoutMs),
        });
      });

      if (response.ok) {
        this.consecutiveRefusals = 0;
        return (await response.json()) as T;
      }

      if (response.status === 404 && notFoundIsNull) {
        this.consecutiveRefusals = 0;
        return null;
      }

      const refused = response.status === 429;
      if (refused) this.noteRefusal();
      else this.consecutiveRefusals = 0;

      const retryable = refused || response.status >= 500;
      if (!retryable || attempt >= this.maxAttempts) {
        // Never echo more than the first few hundred characters: a TMDB error
        // body can quote the request, and the request carries the token.
        const text = await response.text().catch(() => '');
        throw new TmdbError(
          `TMDB request failed with ${response.status} after ${attempt} attempt(s)`,
          response.status,
          text.slice(0, 500),
        );
      }

      this.retryCount += 1;
      const asked = retryAfterMs(response.headers.get('retry-after'), this.clock.now());
      const backoff =
        asked === null
          ? this.backoffMs * 2 ** (attempt - 1)
          : Math.min(asked, TMDB_MAX_RETRY_AFTER_MS);
      await this.clock.sleep(backoff);
    }
  }

  /**
   * Count a refusal and, on the second in a row, halve the pace for good.
   *
   * The counter resets rather than keeps climbing, so a run that is being
   * refused steadily halves once per pair rather than once per refusal, and a
   * single 429 followed by a hundred good answers costs nothing at all.
   */
  private noteRefusal(): void {
    this.consecutiveRefusals += 1;
    if (this.consecutiveRefusals < TMDB_HALVE_PACE_AFTER) return;

    this.consecutiveRefusals = 0;
    const halved = Math.max(
      TMDB_MIN_REQUESTS_PER_SECOND,
      Math.floor(this.limiter.requestsPerSecond / 2),
    );
    if (halved < this.limiter.requestsPerSecond) {
      this.limiter.setPerSecond(halved);
      this.paceHalvings += 1;
    }
  }

  /** One film, with every sub-resource the mirror reads. Null when TMDB 404s. */
  async movie(id: number): Promise<TmdbMovieDetail | null> {
    return this.request<TmdbMovieDetail>(movieDetailPath(id), true);
  }

  /** One series, likewise. */
  async tv(id: number): Promise<TmdbTvDetail | null> {
    return this.request<TmdbTvDetail>(tvDetailPath(id), true);
  }

  /**
   * Every provider in one medium's directory, all regions in one response.
   *
   * Two of these run at the start of every night, before any availability row
   * is written, so the foreign key from `watch_availability` always has
   * something to point at.
   */
  async providers(kind: TmdbMedium): Promise<TmdbProviderDirectoryEntry[]> {
    const path = kind === 'movie' ? '/3/watch/providers/movie' : '/3/watch/providers/tv';
    const body = await this.request<TmdbProviderDirectory>(`${path}?language=${TMDB_LANGUAGE}`);
    return body?.results ?? [];
  }

  /**
   * Every id changed in a window, yielded one at a time.
   *
   * Paginated, and the walk reads `total_pages` from the first page rather
   * than stopping on a short one: the changes feed does return a full last
   * page from time to time, and a short-page rule would then miss everything
   * after it. TMDB caps the window at 14 days; the caller's default is 26
   * hours, the same overlap the IGDB delta takes.
   *
   * Ids only. What changed is not said, and a title the mirror never chose to
   * carry is simply not in the catalog when the caller intersects.
   */
  async *changes(kind: TmdbMedium, start: Date, end: Date): AsyncGenerator<number> {
    const path = kind === 'movie' ? '/3/movie/changes' : '/3/tv/changes';
    const window = `start_date=${changesDate(start)}&end_date=${changesDate(end)}`;

    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const body = await this.request<TmdbChangesPage>(`${path}?${window}&page=${page}`);
      if (!body) return;

      totalPages = Math.max(1, body.total_pages ?? 1);
      const results = body.results ?? [];
      for (const entry of results) {
        if (typeof entry.id === 'number') yield entry.id;
      }

      // A page that came back empty ends the walk whatever total_pages claims,
      // so a feed that reports more pages than it has cannot spin forever.
      if (results.length === 0) return;
      page += 1;
    }
  }

  /**
   * Every line of one medium's daily id export, streamed.
   *
   * The file is 28 MB compressed and about a million newline-delimited JSON
   * objects, so it is gunzipped and read a line at a time rather than held in
   * memory: `response.json()` on this would cost hundreds of megabytes on a
   * runner for a walk that needs one object at a time.
   *
   * The job that publishes these "runs every day starting at around 7:00 AM
   * UTC" with everything available by 08:00 and files kept three months
   * (research 2.3). The schedule puts this run at 14:00 UTC, comfortably
   * after, but a publication that slips is a missed night of entrants rather
   * than something to fail over, so a 404 on today's file falls back to
   * yesterday's and the caller is told which date it actually read.
   */
  async *exportIds(
    kind: TmdbMedium,
    date: Date,
    log?: (message: string) => void,
  ): AsyncGenerator<TmdbExportLine> {
    const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);

    let used = date;
    let response = await this.fetchExport(kind, date);
    if (!response) {
      used = yesterday;
      response = await this.fetchExport(kind, yesterday);
      if (!response) {
        throw new TmdbError(
          `TMDB has no ${kind} export for ${exportDateStamp(date)} or ` +
            `${exportDateStamp(yesterday)}`,
          404,
          '',
        );
      }
    }

    log?.(`tmdb export: reading ${exportFileName(kind, used)}`);

    if (!response.body) {
      throw new TmdbError(`TMDB export ${exportFileName(kind, used)} had no body`, 200, '');
    }

    // `Readable.fromWeb` takes the web stream `fetch` returns and hands back a
    // Node stream, which is what `zlib` and `readline` understand. The cast is
    // because Node's own types for the two stream families do not line up.
    const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    const lines = createInterface({ input: source.pipe(createGunzip()), crlfDelay: Infinity });

    for await (const line of lines) {
      const text = line.trim();
      if (text.length === 0) continue;

      let parsed: TmdbExportLine;
      try {
        parsed = JSON.parse(text) as TmdbExportLine;
      } catch {
        // One malformed line is one title, not a reason to abandon a file of a
        // million of them.
        continue;
      }

      if (typeof parsed.id === 'number') yield parsed;
    }
  }

  /** One attempt at an export file. Null on 404, which is the only soft status. */
  private async fetchExport(kind: TmdbMedium, date: Date): Promise<Response | null> {
    const url = `${EXPORT_BASE}/${exportFileName(kind, date)}`;
    this.fileRequestCount += 1;

    // No bearer and no limiter: files.tmdb.org is a static host that takes no
    // credential, and sending one would put the token somewhere it is not
    // needed.
    const response = await this.fetchImpl(url, {
      method: 'GET',
      ...requestTimeout(TMDB_EXPORT_TIMEOUT_MS),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new TmdbError(
        `TMDB export ${exportFileName(kind, date)} failed with ${response.status}`,
        response.status,
        '',
      );
    }
    return response;
  }
}
