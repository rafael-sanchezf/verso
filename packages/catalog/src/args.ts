import { AVAILABILITY_SOURCES, DEFAULT_REGION, type AvailabilitySource } from './availability';
import { ITAD_POPULAR_LIMIT, ITAD_RUN_LIMIT } from './db';
import { OPENCRITIC_RUN_BUDGET } from './opencritic';
import {
  OPENCRITIC_DEFAULT_STALE_HOURS,
  OPENCRITIC_REQUESTS_PER_GAME,
} from './opencritic-scores';
import { STOREFRONT_RUN_BUDGET } from './steam';
import { DEFAULT_STALE_HOURS, REQUESTS_PER_GAME } from './steam-scores';
import { MOVIE_POPULARITY_THRESHOLD, TV_POPULARITY_THRESHOLD } from './tmdb-map';
import {
  TMDB_DEFAULT_REGION,
  TMDB_DEFAULT_SINCE_HOURS,
  TMDB_DEFAULT_STALE_DAYS,
  TMDB_MEDIA,
  TMDB_RUN_BUDGET,
} from './tmdb-sync';
import type { TmdbMedium } from './tmdb-types';
import { CROSS_LINK_PROPERTIES, WIKIDATA_CHUNK_SIZE } from './wikidata';
import { DEFAULT_ID_LIMIT, DEFAULT_RECHECK_DAYS } from './wikidata-ids';

/**
 * How far back a delta run reaches when `--since` is omitted.
 *
 * 26 hours, not 24: the nightly schedule can drift, a run can take an hour,
 * and a two-hour overlap costs nothing because the upsert is idempotent,
 * whereas a gap silently loses a day of IGDB edits.
 */
export const DEFAULT_DELTA_HOURS = 26;

/**
 * The six things the CLI can do.
 *
 * `sync` is the IGDB mirror and stays the default, so `pnpm catalog:sync` and
 * the workflow that calls it keep working with no subcommand at all.
 * `steam-scores` is the separate nightly pass over Steam's storefront;
 * `wikidata-ids` is the keyless Wikidata pass that fills `external_ids` and
 * `opencritic-scores` is the paid pass that spends the ids it stored; and
 * `availability` is the "where to play" pass over the three subscription
 * sources. Each has its own schedule, its own host, its own budget, and its
 * own credentials or none.
 *
 * `wikidata-ids` and `opencritic-scores` are two commands rather than one
 * because they have nothing in common at run time: one queries Wikidata with
 * no key and a query budget, the other queries RapidAPI with a key and a
 * request budget, and either can be run, capped or skipped without the other.
 * `availability` is one command over three sources for the opposite reason:
 * they share a table and a reconciliation, and a night that writes only some
 * of them is exactly what its per-source fail-soft exists to express.
 *
 * `tmdb-sync` is the film and TV mirror, the whole of
 * docs/design/film-tv-catalog.md. A separate command from `sync` rather than a
 * `--medium` flag on it because the two share nothing at run time: different
 * host, different credential, different shape of request (one per title rather
 * than one per page of 500), different schedule, and a different answer to
 * "what does a run stop on".
 *
 * Their flags are disjoint, so each command parses its own rather than sharing
 * one parser that would then have to police which flag belongs to which.
 */
export type Command =
  | 'sync'
  | 'steam-scores'
  | 'wikidata-ids'
  | 'opencritic-scores'
  | 'availability'
  | 'tmdb-sync';

export const COMMANDS: readonly Command[] = [
  'sync',
  'steam-scores',
  'wikidata-ids',
  'opencritic-scores',
  'availability',
  'tmdb-sync',
];

/**
 * Old names that still work, mapped to the command they now mean.
 *
 * `opencritic-ids` was PR #27's name for the pass when OpenCritic was the only
 * identifier it collected. It is kept because the merged
 * `.github/workflows/opencritic-scores.yml` calls it by name and a scheduled
 * workflow must not break between one merge and the next; the workflow in this
 * change moves to `wikidata-ids`, and this alias is what makes the two orders
 * of merging equivalent.
 *
 * A Map rather than an object literal, because what is looked up in it is
 * `process.argv`. A plain object answers `constructor`, `toString` and
 * `__proto__` out of `Object.prototype`, so `catalog constructor` would have
 * resolved to a "command" of `Object` instead of falling through to `sync`.
 */
export const COMMAND_ALIASES: ReadonlyMap<string, Command> = new Map([
  ['opencritic-ids', 'wikidata-ids' as Command],
]);

export interface Args {
  full: boolean;
  since?: Date;
  maxPages?: number;
  dryRun: boolean;
}

export interface AvailabilityArgs {
  /** Which sources to run. Undefined means all three. */
  sources?: AvailabilitySource[];
  /** The market to ask every source about. */
  region?: string;
  /** Games the IsThereAnyDeal pass may ask about. */
  itadLimit?: number;
  dryRun: boolean;
}

export interface SteamScoresArgs {
  /** Storefront requests this run may make. */
  budget?: number;
  /** Re-fetch a game whose `steam` row is older than this many hours. */
  staleHours?: number;
  dryRun: boolean;
}

export interface WikidataIdsArgs {
  /** Games this run may ask Wikidata about. */
  limit?: number;
  /** IGDB ids per SPARQL query. */
  chunkSize?: number;
  /** Re-ask about a game last asked about more than this many days ago. */
  recheckDays?: number;
  dryRun: boolean;
}

export interface OpenCriticScoresArgs {
  /** OpenCritic requests this run may make. */
  budget?: number;
  /** Re-fetch a game last asked about more than this many hours ago. */
  staleHours?: number;
  dryRun: boolean;
}

export interface TmdbSyncArgs {
  /** The whole discovery set rather than the four nightly passes. */
  full: boolean;
  /** One medium, or both when absent. */
  media?: TmdbMedium[];
  /** Which regions' availability, certifications and release dates to store. */
  regions?: string[];
  /** TMDB requests this run may spend across every pass. */
  budget?: number;
  /** Re-fetch a title whose `refreshed_at` is older than this many days. */
  staleDays?: number;
  /** How far back the changes pass reaches, in hours. */
  sinceHours?: number;
  /** Stop after this many titles. */
  maxIds?: number;
  dryRun: boolean;
}

export function usage(): string {
  return [
    'Usage: pnpm --filter @verso/catalog run sync -- [options]',
    '       pnpm --filter @verso/catalog run steam-scores -- [options]',
    '       pnpm --filter @verso/catalog run wikidata-ids -- [options]',
    '       pnpm --filter @verso/catalog run opencritic-scores -- [options]',
    '       pnpm --filter @verso/catalog run availability -- [options]',
    '       pnpm --filter @verso/catalog run tmdb-sync -- [options]',
    '',
    'Commands:',
    '  sync               mirror IGDB into media_items, game_details and',
    '                     external_scores (igdb_critics, igdb_users), and fill',
    '                     external_ids.steam. The default when none is given.',
    '  steam-scores       fetch Steam review percentages and the Metacritic',
    "                     scores Valve licenses, for games with a Steam app id",
    '  wikidata-ids       fill external_ids from Wikidata, keyed by IGDB id',
    '                     (P5794 with its P9043 qualifier) with one query for',
    `                     ${CROSS_LINK_PROPERTIES.map((p) => p.key).join(', ')}.`,
    '                     Also accepted as opencritic-ids, its former name.',
    '  opencritic-scores  fetch OpenCritic top critic averages and percent',
    '                     recommended for games with an external_ids.opencritic',
    '  availability       fill game_availability from the GeForce NOW list, the',
    '                     Game Pass catalog and IsThereAnyDeal subscriptions',
    '  tmdb-sync          mirror TMDB into media_items, movie_details,',
    '                     tv_details, tv_seasons, media_release_dates,',
    '                     media_certifications, watch_providers and',
    '                     watch_availability, plus the tmdb external_score',
    '',
    'sync options:',
    '  --full             pull the whole trimmed catalog (initial load)',
    '  --since <iso>      pull games updated at or after this ISO timestamp',
    '  --max-pages <n>    stop after n pages of 500 (smoke tests)',
    '',
    'steam-scores options:',
    `  --budget <n>       storefront requests this run may make (default`,
    `                     ${STOREFRONT_RUN_BUDGET}; ${REQUESTS_PER_GAME} per game)`,
    '  --stale-hours <n>  re-fetch a game last fetched over n hours ago',
    `                     (default ${DEFAULT_STALE_HOURS})`,
    '',
    'wikidata-ids options:',
    `  --limit <n>        games this run may ask about (default ${DEFAULT_ID_LIMIT})`,
    `  --chunk-size <n>   IGDB ids per SPARQL query (default ${WIKIDATA_CHUNK_SIZE})`,
    '  --recheck-days <n> re-ask about a game last asked about over n days ago',
    `                     (default ${DEFAULT_RECHECK_DAYS})`,
    '',
    'opencritic-scores options:',
    `  --budget <n>       OpenCritic requests this run may make (default`,
    `                     ${OPENCRITIC_RUN_BUDGET}; ${OPENCRITIC_REQUESTS_PER_GAME} per game,`,
    '                     against a free tier of 200 a day)',
    '  --stale-hours <n>  re-fetch a game last asked about over n hours ago',
    `                     (default ${OPENCRITIC_DEFAULT_STALE_HOURS})`,
    '',
    'availability options:',
    `  --only <sources>   comma-separated: ${AVAILABILITY_SOURCES.join(', ')}`,
    '                     (default: all three)',
    `  --region <cc>      two-letter market to ask every source about (default`,
    `                     ${DEFAULT_REGION}; the only one V1 stores)`,
    `  --itad-limit <n>   games the IsThereAnyDeal pass asks about (default`,
    `                     ${ITAD_RUN_LIMIT}, of which ${ITAD_POPULAR_LIMIT} on popularity alone)`,
    '',
    'tmdb-sync options:',
    '  --full             the whole discovery set rather than the four nightly',
    '                     passes, minus what this run already refreshed',
    `  --medium <m>       comma-separated: ${TMDB_MEDIA.join(', ')} (default: both)`,
    `  --regions <cc>     comma-separated ISO 3166-1 markets whose availability,`,
    `                     certifications and release dates are stored (default`,
    `                     ${TMDB_DEFAULT_REGION})`,
    `  --budget <n>       TMDB requests this run may spend across every pass`,
    `                     (default ${TMDB_RUN_BUDGET})`,
    `  --stale-days <n>   re-fetch a title refreshed over n days ago (default`,
    `                     ${TMDB_DEFAULT_STALE_DAYS}, inside TMDB's six-month cache ceiling)`,
    `  --since <hours>    how far back the changes pass reaches (default`,
    `                     ${TMDB_DEFAULT_SINCE_HOURS}; TMDB caps the window at 14 days)`,
    '  --max-ids <n>      stop after n titles (smoke tests)',
    '',
    'All:',
    '  --dry-run          fetch and map, write nothing',
    '',
    `With neither --full nor --since, sync pulls the last ${DEFAULT_DELTA_HOURS} hours.`,
    `tmdb-sync discovers a film at popularity ${MOVIE_POPULARITY_THRESHOLD} and a series at`,
    `${TV_POPULARITY_THRESHOLD}; see docs/design/tmdb-setup.md under "Sizing".`,
    '',
    'Environment: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, DATABASE_URL,',
    'OPENCRITIC_RAPIDAPI_KEY, ITAD_API_KEY, TMDB_API_READ_ACCESS_TOKEN.',
    'steam-scores needs DATABASE_URL only: the storefront takes no key.',
    'wikidata-ids needs DATABASE_URL only: Wikidata takes no key.',
    'opencritic-scores needs DATABASE_URL and OPENCRITIC_RAPIDAPI_KEY, and',
    'skips with a message rather than failing when the key is absent.',
    'availability needs DATABASE_URL, and ITAD_API_KEY for the IsThereAnyDeal',
    'source; without that key it runs the other two and says so in one line.',
    'tmdb-sync needs TMDB_API_READ_ACCESS_TOKEN and skips with a message rather',
    'than failing when it is absent. DATABASE_URL is optional on a dry run:',
    'without it the catalog is treated as empty and nothing is written.',
  ].join('\n');
}

export class UsageError extends Error {}

/**
 * Peel the subcommand off the front of the argument list.
 *
 * `sync` when there is none, so every existing invocation keeps meaning what
 * it meant. Leading `--` separators are skipped first, because pnpm forwards
 * them: `pnpm catalog:steam-scores -- --dry-run` arrives as
 * `['steam-scores', '--', '--dry-run']` from the package script, and a
 * hand-typed `-- steam-scores` should work too.
 *
 * {@link COMMAND_ALIASES} is consulted after the real names, so an old name
 * resolves to the command it now means and the caller never sees the
 * difference.
 */
export function readCommand(argv: string[]): { command: Command; rest: string[] } {
  let index = 0;
  while (argv[index] === '--') index += 1;

  const candidate = argv[index];
  if (candidate !== undefined && (COMMANDS as readonly string[]).includes(candidate)) {
    return { command: candidate as Command, rest: argv.slice(index + 1) };
  }

  const aliased = candidate === undefined ? undefined : COMMAND_ALIASES.get(candidate);
  if (aliased !== undefined) return { command: aliased, rest: argv.slice(index + 1) };

  return { command: 'sync', rest: argv };
}

/** A positive integer flag value, or a UsageError naming the flag. */
function positiveInteger(flag: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UsageError(`${flag} needs a positive integer`);
  }
  return parsed;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { full: false, dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      // pnpm forwards the `--` separator through to the script, so
      // `pnpm catalog:sync -- --full` arrives here as ['--', '--full'].
      case '--':
        break;
      case '--full':
        args.full = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--since': {
        const value = argv[++i];
        if (!value) throw new UsageError('--since needs an ISO timestamp');
        const since = new Date(value);
        if (Number.isNaN(since.getTime())) throw new UsageError(`--since is not a date: ${value}`);
        args.since = since;
        break;
      }
      case '--max-pages': {
        const value = argv[++i];
        const pages = Number(value);
        if (!Number.isInteger(pages) || pages < 1) {
          throw new UsageError('--max-pages needs a positive integer');
        }
        args.maxPages = pages;
        break;
      }
      default:
        throw new UsageError(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  if (args.full && args.since) {
    throw new UsageError('--full and --since are mutually exclusive');
  }
  return args;
}

export function parseSteamScoresArgs(argv: string[]): SteamScoresArgs {
  const args: SteamScoresArgs = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case '--':
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--budget':
        args.budget = positiveInteger('--budget', argv[++i]);
        break;
      case '--stale-hours':
        args.staleHours = positiveInteger('--stale-hours', argv[++i]);
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}

export function parseWikidataIdsArgs(argv: string[]): WikidataIdsArgs {
  const args: WikidataIdsArgs = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case '--':
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--limit':
        args.limit = positiveInteger('--limit', argv[++i]);
        break;
      case '--chunk-size':
        args.chunkSize = positiveInteger('--chunk-size', argv[++i]);
        break;
      case '--recheck-days':
        args.recheckDays = positiveInteger('--recheck-days', argv[++i]);
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}

export function parseOpenCriticScoresArgs(argv: string[]): OpenCriticScoresArgs {
  const args: OpenCriticScoresArgs = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case '--':
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--budget':
        args.budget = positiveInteger('--budget', argv[++i]);
        break;
      case '--stale-hours':
        args.staleHours = positiveInteger('--stale-hours', argv[++i]);
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}

/**
 * A comma-separated list flag, trimmed and with the empties dropped.
 *
 * `--medium movie,tv` and `--regions US,GB` are the same shape as
 * `--only geforce-now,itad`, so they read the same way.
 */
function commaSeparated(flag: string, value: string | undefined): string[] {
  const names = (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) throw new UsageError(`${flag} needs at least one value`);
  return names;
}

export function parseTmdbSyncArgs(argv: string[]): TmdbSyncArgs {
  const args: TmdbSyncArgs = { full: false, dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case '--':
        break;
      case '--full':
        args.full = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--medium': {
        const names = commaSeparated('--medium', argv[++i]);
        for (const name of names) {
          if (!(TMDB_MEDIA as readonly string[]).includes(name)) {
            throw new UsageError(
              `--medium does not know ${name}; it is one or more of ${TMDB_MEDIA.join(', ')}`,
            );
          }
        }
        // De-duplicated and put back in the canonical order, so a log from
        // `--medium tv,movie` is comparable with a log from a plain run.
        args.media = TMDB_MEDIA.filter((medium) => names.includes(medium));
        break;
      }
      case '--regions': {
        const codes = commaSeparated('--regions', argv[++i]);
        for (const code of codes) {
          if (!/^[A-Za-z]{2}$/.test(code)) {
            throw new UsageError(
              `--regions takes two-letter country codes, such as US; got ${code}`,
            );
          }
        }
        args.regions = [...new Set(codes.map((code) => code.toUpperCase()))];
        break;
      }
      case '--budget':
        args.budget = positiveInteger('--budget', argv[++i]);
        break;
      case '--stale-days':
        args.staleDays = positiveInteger('--stale-days', argv[++i]);
        break;
      case '--since':
        // Hours, not an instant, unlike `sync --since`. The window this flag
        // sets is passed to TMDB as two dates, so an ISO timestamp would
        // promise a precision the endpoint does not have.
        args.sinceHours = positiveInteger('--since', argv[++i]);
        break;
      case '--max-ids':
        args.maxIds = positiveInteger('--max-ids', argv[++i]);
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}

export function parseAvailabilityArgs(argv: string[]): AvailabilityArgs {
  const args: AvailabilityArgs = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case '--':
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--only': {
        const value = argv[++i];
        if (!value) throw new UsageError(`--only needs one of ${AVAILABILITY_SOURCES.join(', ')}`);
        const names = value
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name.length > 0);
        if (names.length === 0) {
          throw new UsageError(`--only needs one of ${AVAILABILITY_SOURCES.join(', ')}`);
        }
        for (const name of names) {
          if (!(AVAILABILITY_SOURCES as readonly string[]).includes(name)) {
            throw new UsageError(
              `--only does not know the source ${name}; it is one or more of ` +
                `${AVAILABILITY_SOURCES.join(', ')}`,
            );
          }
        }
        // De-duplicated and put back in the canonical order, so `--only
        // itad,game-pass` runs in the same order as a plain run and a log from
        // one is comparable with a log from the other.
        args.sources = AVAILABILITY_SOURCES.filter((source) => names.includes(source));
        break;
      }
      case '--region': {
        const value = argv[++i];
        if (!value || !/^[A-Za-z]{2}$/.test(value)) {
          throw new UsageError('--region needs a two-letter country code, such as US');
        }
        args.region = value.toUpperCase();
        break;
      }
      case '--itad-limit':
        args.itadLimit = positiveInteger('--itad-limit', argv[++i]);
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}
