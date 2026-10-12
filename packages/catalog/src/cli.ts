import {
  DEFAULT_DELTA_HOURS,
  parseArgs,
  parseAvailabilityArgs,
  parseOpenCriticScoresArgs,
  parseSteamScoresArgs,
  parseTmdbSyncArgs,
  parseWikidataIdsArgs,
  readCommand,
  usage,
  type AvailabilityArgs,
  type OpenCriticScoresArgs,
  type SteamScoresArgs,
  type TmdbSyncArgs,
  type WikidataIdsArgs,
} from './args';
import { runAvailability } from './availability';
import { CatalogStore } from './db';
import { GamePassClient } from './gamepass';
import { GeForceNowClient } from './gfn';
import { IgdbClient } from './igdb';
import { ItadClient } from './itad';
import { OpenCriticClient, OPENCRITIC_KEY_ENV } from './opencritic';
import { runOpenCriticScores } from './opencritic-scores';
import { SteamStorefrontClient } from './steam';
import { runSteamScores } from './steam-scores';
import { runSync } from './sync';
import { TmdbClient, TMDB_TOKEN_ENV } from './tmdb';
import { runTmdbSync } from './tmdb-sync';
import { WikidataClient } from './wikidata';
import { runWikidataIds } from './wikidata-ids';

/** Read a required secret from the environment, never logging its value. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Secrets come from the environment: locally from .env ` +
        `(set -a; source .env; set +a), in CI from GitHub Actions secrets.`,
    );
  }
  return value;
}

async function sync(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  const since = args.full
    ? undefined
    : (args.since ?? new Date(Date.now() - DEFAULT_DELTA_HOURS * 60 * 60 * 1000));

  console.log(
    since
      ? `catalog sync: delta since ${since.toISOString()}${args.dryRun ? ' (dry run)' : ''}`
      : `catalog sync: full pull${args.dryRun ? ' (dry run)' : ''}`,
  );

  const client = new IgdbClient({
    clientId: requireEnv('TWITCH_CLIENT_ID'),
    clientSecret: requireEnv('TWITCH_CLIENT_SECRET'),
  });

  const store = args.dryRun ? null : new CatalogStore(requireEnv('DATABASE_URL'));

  try {
    await runSync({ client, store }, { since, maxPages: args.maxPages, dryRun: args.dryRun });
  } finally {
    await store?.end();
  }
}

/**
 * The Steam storefront pass.
 *
 * Needs DATABASE_URL even on a dry run, unlike the sync: the games to fetch
 * come from the catalog itself (which of them have a Steam app id, which of
 * them anybody tracks, which were fetched recently), so there is nothing to do
 * without a connection. `--dry-run` suppresses the writes, not the reads.
 */
async function steamScores(argv: string[]): Promise<void> {
  const args: SteamScoresArgs = parseSteamScoresArgs(argv);

  const client = new SteamStorefrontClient({ budget: args.budget });
  const store = new CatalogStore(requireEnv('DATABASE_URL'));

  try {
    await runSteamScores(
      { client, store },
      { budget: args.budget, staleHours: args.staleHours, dryRun: args.dryRun },
    );
  } finally {
    await store.end();
  }
}

/**
 * The Wikidata pass that fills `external_ids`.
 *
 * No key of any kind: the Query Service is public and its data is CC0. Needs
 * DATABASE_URL even on a dry run, like the Steam pass, because the IGDB ids to
 * ask about come from the catalog itself.
 */
async function wikidataIds(argv: string[]): Promise<void> {
  const args: WikidataIdsArgs = parseWikidataIdsArgs(argv);

  const client = new WikidataClient();
  const store = new CatalogStore(requireEnv('DATABASE_URL'));

  try {
    await runWikidataIds(
      { client, store },
      {
        limit: args.limit,
        chunkSize: args.chunkSize,
        recheckDays: args.recheckDays,
        dryRun: args.dryRun,
      },
    );
  } finally {
    await store.end();
  }
}

/**
 * The OpenCritic pass.
 *
 * Skips rather than fails when the RapidAPI key is absent, and says so in one
 * line. A scheduled run on a repository where Rafa has not added the secret
 * yet is a run with nothing to do, not a red workflow: the alternative trains
 * everyone to ignore a failing job, and this job's whole point is that it is
 * unattended.
 */
async function openCriticScores(argv: string[]): Promise<void> {
  const args: OpenCriticScoresArgs = parseOpenCriticScoresArgs(argv);

  const apiKey = process.env[OPENCRITIC_KEY_ENV];
  if (!apiKey) {
    console.log(
      `opencritic scores: skipped, ${OPENCRITIC_KEY_ENV} is not set. ` +
        `Subscribe to the OpenCritic API's free Basic plan on RapidAPI and add ` +
        `the key as a repository secret to turn this job on.`,
    );
    return;
  }

  const client = new OpenCriticClient({ apiKey, budget: args.budget });
  const store = new CatalogStore(requireEnv('DATABASE_URL'));

  try {
    await runOpenCriticScores(
      { client, store },
      { budget: args.budget, staleHours: args.staleHours, dryRun: args.dryRun },
    );
  } finally {
    await store.end();
  }
}

/**
 * The "where to play" pass.
 *
 * Needs DATABASE_URL even on a dry run, for the same reason steam-scores does:
 * the match is against our own catalog, so there is nothing to compute without
 * a connection. `--dry-run` suppresses the writes, not the reads.
 *
 * ITAD_API_KEY is optional. Absent, the IsThereAnyDeal source is skipped with a
 * single log line and the other two run normally, which is the expected state
 * of this job until the secret exists -- the same choice `opencritic-scores`
 * makes about its own key, and for the same reason: a scheduled run on a
 * repository without the secret is a run with less to do, not a red workflow.
 */
async function availability(argv: string[]): Promise<void> {
  const args: AvailabilityArgs = parseAvailabilityArgs(argv);

  const store = new CatalogStore(requireEnv('DATABASE_URL'));
  const itadApiKey = process.env.ITAD_API_KEY;

  try {
    const result = await runAvailability(
      {
        store,
        gfn: new GeForceNowClient(),
        gamePass: new GamePassClient(),
        itad: itadApiKey ? new ItadClient({ apiKey: itadApiKey }) : null,
      },
      {
        sources: args.sources,
        region: args.region,
        itadLimit: args.itadLimit,
        dryRun: args.dryRun,
      },
    );

    // Exit non-zero only when nothing at all worked. One undocumented endpoint
    // having a bad night is a log line, not a red workflow.
    if (!result.ok) process.exitCode = 1;
  } finally {
    await store.end();
  }
}

/**
 * The film and TV mirror.
 *
 * Skips rather than fails when the read access token is absent, and says so in
 * one line. The same choice `opencritic-scores` makes about its own key, and
 * for the same reason: a scheduled run on a repository where Rafa has not
 * added the secret yet is a run with nothing to do, not a red workflow. The
 * alternative trains everyone to ignore a failing job, and this job's whole
 * point is that it is unattended.
 *
 * DATABASE_URL is optional on a dry run, unlike every other command here.
 * Without it the catalog is treated as empty, every discovered id counts as an
 * entrant, and `--dry-run --max-ids 5` is a smoke test of the token and the
 * mapping against the real endpoint with no database at all. With it, a dry
 * run reads the catalog to select and still writes nothing.
 */
async function tmdbSync(argv: string[]): Promise<void> {
  const args: TmdbSyncArgs = parseTmdbSyncArgs(argv);

  const readAccessToken = process.env[TMDB_TOKEN_ENV];
  if (!readAccessToken) {
    console.log(
      `tmdb sync: skipped, ${TMDB_TOKEN_ENV} is not set. ` +
        `Request a free API key of type "Developer" at ` +
        `https://www.themoviedb.org/settings/api and add the API Read Access ` +
        `Token as a repository secret to turn this job on.`,
    );
    return;
  }

  const client = new TmdbClient({ readAccessToken });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !args.dryRun) requireEnv('DATABASE_URL');
  const store = connectionString ? new CatalogStore(connectionString) : null;

  try {
    await runTmdbSync(
      { client, store },
      {
        full: args.full,
        media: args.media,
        regions: args.regions,
        budget: args.budget,
        staleDays: args.staleDays,
        sinceHours: args.sinceHours,
        maxIds: args.maxIds,
        dryRun: args.dryRun,
      },
    );
  } finally {
    await store?.end();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }

  const { command, rest } = readCommand(process.argv.slice(2));
  if (command === 'steam-scores') await steamScores(rest);
  else if (command === 'wikidata-ids') await wikidataIds(rest);
  else if (command === 'opencritic-scores') await openCriticScores(rest);
  else if (command === 'availability') await availability(rest);
  else if (command === 'tmdb-sync') await tmdbSync(rest);
  else await sync(rest);
}

main().catch((error: unknown) => {
  // Message only: a stack trace from `pg` can carry the connection string.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
