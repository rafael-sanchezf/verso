/**
 * The engine's report as plain tables: `pnpm engine:report`.
 *
 * Prints the two instruments of docs/design/recommendation-engine.md for each
 * user and medium with a ranked list:
 *
 *   - `recommendation_loo_summary`, the leave-one-out harness
 *     (supabase/migrations/20260924120000_recommendation_foundations.sql):
 *     every ranked item predicted from the rest of the list, hindsight
 *     included, beside the user's mean and the item's prior.
 *   - `prediction_calibration`, the insertion guesses
 *     (supabase/migrations/20261015120000_insertion_predictions.sql): the guess
 *     written at each placement, from the list as it stood then, against where
 *     the item sits now.
 *
 * The harness is service role only and the view runs as the caller over
 * owner-only tables, so this connects with `DATABASE_URL` as the database
 * owner, the way `pnpm funnel` does (funnel.ts), and reads inside one
 * read-only transaction: it writes nothing. That includes the priors. The
 * harness's comment says to refresh them first for an exact leave-one-out
 * prior; this does not, so the header says when they were last computed.
 *
 * Users appear as the first eight characters of their id and nothing else;
 * no email or handle is read. Lists print one at a time, because the harness
 * scores every item of a list and a long list takes seconds.
 */

import pg from 'pg';

import { isLocal } from './db';

export const MEDIA = ['game', 'movie', 'tv'] as const;
export type Medium = (typeof MEDIA)[number];

export interface EngineReportArgs {
  /** A user id or its first characters, lowercase; null is everyone. */
  user: string | null;
  /** One medium; null is every medium with a ranked list. */
  medium: Medium | null;
}

/** One user's ranked list in one medium. */
export interface RankedList {
  userId: string;
  medium: Medium;
  ranked: number;
}

/**
 * recommendation_loo_summary's row. The numerics stay the strings Postgres
 * prints, three decimals, so the report shows the SQL editor's digits.
 */
export interface LooSummary {
  n: number;
  maePredicted: string | null;
  maeContent: string | null;
  maeUserMean: string | null;
  maePrior: string | null;
  tierAccuracy: string | null;
  spearman: string | null;
}

/** prediction_calibration's row, numerics as Postgres prints them. */
export interface CalibrationRow {
  userId: string;
  medium: Medium;
  modelVersion: string;
  listSizeBand: string;
  confidence: string;
  source: string | null;
  n: number;
  tierHitRate: string | null;
  maePredicted: string | null;
  maeContent: string | null;
  maeUserMean: string | null;
  maePrior: string | null;
}

/** When `refresh_item_priors` last ran for a medium; null when it never has. */
export interface PriorRefresh {
  medium: Medium;
  computedAt: Date | null;
}

export function engineReportUsage(): string {
  return [
    'Usage: pnpm engine:report [--user <id>] [--medium game|movie|tv]',
    '',
    "Prints the engine's two instruments for each user and medium with a ranked",
    'list: the leave-one-out harness (recommendation_loo_summary) and the insertion',
    'guesses (prediction_calibration). --user takes an id or its first characters,',
    'as the report prints them; --medium keeps one medium. Both are optional.',
    '',
    'Environment: DATABASE_URL, the Postgres connection string. Nothing is',
    'written.',
  ].join('\n');
}

export function parseEngineReportArgs(argv: readonly string[]): EngineReportArgs {
  const args: EngineReportArgs = { user: null, medium: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    const [flag, inline] = arg.includes('=') ? (arg.split('=', 2) as [string, string]) : [arg, undefined];
    if (flag === '--user') {
      const value = (inline ?? argv[++i])?.toLowerCase();
      if (!value) throw new Error('--user needs an id, for example --user 3f2a9c1b');
      // Hex and dashes only, so the value never carries a LIKE wildcard; the
      // value itself is not echoed, in case it was an email.
      if (!/^[0-9a-f-]{1,36}$/.test(value)) {
        throw new Error('--user takes a user id or its first characters, as the report prints them');
      }
      args.user = value;
    } else if (flag === '--medium') {
      const value = inline ?? argv[++i];
      if (!value) throw new Error('--medium needs a medium, for example --medium game');
      if (!(MEDIA as readonly string[]).includes(value)) {
        throw new Error(`--medium: one of ${MEDIA.join(', ')}, not ${value}`);
      }
      args.medium = value as Medium;
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${engineReportUsage()}`);
    }
  }
  return args;
}

/** How the report names a user: the first eight characters of the id. */
export function shortId(userId: string): string {
  return userId.slice(0, 8);
}

/** Left-align the first `left` columns, right-align the rest; two spaces between. */
function table(header: readonly string[], rows: readonly (readonly string[])[], left: number): string {
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]!.length)));
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, c) => (c < left ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!)))
      .join('  ')
      .trimEnd();
  return [line(header), ...rows.map(line)].map((l) => `  ${l}`).join('\n');
}

function num(value: string | number | null): string {
  return value === null ? '-' : String(value);
}

function minute(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** Which lists the report covers, from the flags. */
export function describeFilter({ user, medium }: EngineReportArgs): string {
  if (!user && !medium) return 'every user and medium';
  const who = user ? `user ${shortId(user)}${user.length < 36 ? '*' : ''}` : 'every user';
  return `${who}, ${medium ? `${medium} only` : 'every medium'}`;
}

export function formatHeader(
  args: EngineReportArgs,
  now: Date,
  lists: readonly RankedList[],
  priors: readonly PriorRefresh[],
): string {
  const lines = [
    `The engine's report, ${minute(now)}`,
    `Lists: ${describeFilter(args)}. Users appear as the first eight characters of their id.`,
  ];
  if (lists.length === 0) {
    lines.push('', args.user || args.medium ? 'No ranked list matches.' : 'No ranked lists yet.');
    return lines.join('\n');
  }
  const media = [...new Set(lists.map((l) => l.medium))];
  const refreshed = media.map((m) => {
    const at = priors.find((p) => p.medium === m)?.computedAt ?? null;
    return `${m} ${at ? minute(at) : 'never'}`;
  });
  lines.push(
    '',
    'Leave-one-out: recommendation_loo_summary, each ranked item predicted from the rest of its list.',
    `  Its priors were last computed: ${refreshed.join(', ')} (this report never refreshes them).`,
    'Insertion guesses: prediction_calibration, the latest guess per item against where the item sits now,',
    '  for the items the user placed.',
    'Errors are mean absolute errors on the 0 to 10 score; lower is better. The guess beats a baseline',
    'where mae_predicted is below mae_user_mean (the list mean) or mae_prior (the community prior).',
  );
  return lines.join('\n');
}

export function formatSection(list: RankedList, loo: LooSummary, calibration: readonly CalibrationRow[]): string {
  const looTable = table(
    ['n', 'mae_predicted', 'mae_content', 'mae_user_mean', 'mae_prior', 'tier_accuracy', 'spearman'],
    [
      [
        String(loo.n),
        num(loo.maePredicted),
        num(loo.maeContent),
        num(loo.maeUserMean),
        num(loo.maePrior),
        num(loo.tierAccuracy),
        num(loo.spearman),
      ],
    ],
    0,
  );
  const guesses =
    calibration.length === 0
      ? '  None yet: a guess is logged at each placement since VER-233 (20261015120000), and a place\n  the engine chose counts once the user settles it.'
      : table(
          [
            'model_version',
            'list_size_band',
            'confidence',
            'source',
            'n',
            'tier_hit_rate',
            'mae_predicted',
            'mae_content',
            'mae_user_mean',
            'mae_prior',
          ],
          calibration.map((c) => [
            c.modelVersion,
            c.listSizeBand,
            c.confidence,
            num(c.source),
            String(c.n),
            num(c.tierHitRate),
            num(c.maePredicted),
            num(c.maeContent),
            num(c.maeUserMean),
            num(c.maePrior),
          ]),
          4,
        );
  return [
    '',
    `${list.medium}, user ${shortId(list.userId)}: ${list.ranked} ranked`,
    '',
    '  Leave-one-out',
    looTable,
    '',
    '  Insertion guesses',
    guesses,
  ].join('\n');
}

/** Anything with pg's `query`: a Client or a Pool. */
interface Queryable {
  query<R extends pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

/** The --user and --medium filter on a table aliased `t`, as $1 and $2. */
const FILTER = `($1::text is null or t.user_id::text like $1::text || '%')
     and ($2::public.medium is null or t.medium = $2::public.medium)`;

function filterParams({ user, medium }: EngineReportArgs): unknown[] {
  return [user, medium];
}

/** Every ranked list the flags select: by medium, then longest first. */
export async function readLists(db: Queryable, args: EngineReportArgs): Promise<RankedList[]> {
  const result = await db.query<{ user_id: string; medium: Medium; ranked: number }>(
    `select t.user_id::text as user_id, t.medium::text as medium, count(*)::integer as ranked
     from public.ranking_entries t
     where ${FILTER}
     group by t.user_id, t.medium
     order by t.medium, count(*) desc, t.user_id`,
    filterParams(args),
  );
  return result.rows.map((r) => ({ userId: r.user_id, medium: r.medium, ranked: r.ranked }));
}

/** The view's rows for the same lists: by model, then source, band and confidence. */
export async function readCalibration(db: Queryable, args: EngineReportArgs): Promise<CalibrationRow[]> {
  const result = await db.query<{
    user_id: string;
    medium: Medium;
    model_version: string;
    list_size_band: string;
    confidence: string;
    source: string | null;
    n: number;
    tier_hit_rate: string | null;
    mae_predicted: string | null;
    mae_content: string | null;
    mae_user_mean: string | null;
    mae_prior: string | null;
  }>(
    `select t.user_id::text as user_id, t.medium::text as medium, t.model_version, t.list_size_band,
            t.confidence, t.source, t.n, t.tier_hit_rate, t.mae_predicted, t.mae_content,
            t.mae_user_mean, t.mae_prior
     from public.prediction_calibration t
     where ${FILTER}
     order by t.user_id, t.medium, t.model_version,
              array_position(array['user', 'batch', 'import'], t.source), t.list_size_min, t.confidence`,
    filterParams(args),
  );
  return result.rows.map((r) => ({
    userId: r.user_id,
    medium: r.medium,
    modelVersion: r.model_version,
    listSizeBand: r.list_size_band,
    confidence: r.confidence,
    source: r.source,
    n: r.n,
    tierHitRate: r.tier_hit_rate,
    maePredicted: r.mae_predicted,
    maeContent: r.mae_content,
    maeUserMean: r.mae_user_mean,
    maePrior: r.mae_prior,
  }));
}

export async function readPriorRefresh(db: Queryable): Promise<PriorRefresh[]> {
  const result = await db.query<{ medium: Medium; computed_at: Date | null }>(
    'select medium::text as medium, max(computed_at) as computed_at from public.item_prior group by medium',
  );
  return result.rows.map((r) => ({ medium: r.medium, computedAt: r.computed_at }));
}

/** The harness on one list. It scores every item, so this is the slow call. */
export async function readLooSummary(db: Queryable, list: RankedList): Promise<LooSummary> {
  const result = await db.query<{
    n: number;
    mae_predicted: string | null;
    mae_content: string | null;
    mae_user_mean: string | null;
    mae_prior: string | null;
    tier_accuracy: string | null;
    spearman: string | null;
  }>(
    `select n, mae_predicted, mae_content, mae_user_mean, mae_prior, tier_accuracy, spearman
     from public.recommendation_loo_summary($1::uuid, $2::public.medium)`,
    [list.userId, list.medium],
  );
  const r = result.rows[0]!;
  return {
    n: r.n,
    maePredicted: r.mae_predicted,
    maeContent: r.mae_content,
    maeUserMean: r.mae_user_mean,
    maePrior: r.mae_prior,
    tierAccuracy: r.tier_accuracy,
    spearman: r.spearman,
  };
}

/** Read and write the report: the header, then one section per list as its harness finishes. */
export async function writeEngineReport(
  db: Queryable,
  args: EngineReportArgs,
  now: Date,
  write: (text: string) => void,
): Promise<void> {
  const lists = await readLists(db, args);
  if (lists.length === 0) {
    write(formatHeader(args, now, lists, []));
    return;
  }
  const calibration = await readCalibration(db, args);
  const priors = await readPriorRefresh(db);
  write(formatHeader(args, now, lists, priors));
  for (const list of lists) {
    const loo = await readLooSummary(db, list);
    const rows = calibration.filter((c) => c.userId === list.userId && c.medium === list.medium);
    write(formatSection(list, loo, rows));
  }
}

/**
 * Connect, read in one read-only transaction, close. TLS as db.ts sets it:
 * required off the local stack, unverified.
 */
export async function runEngineReport(
  connectionString: string,
  args: EngineReportArgs,
  write: (text: string) => void,
): Promise<void> {
  const client = new pg.Client({
    connectionString,
    ssl: isLocal(connectionString) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('begin read only');
    await writeEngineReport(client, args, new Date(), write);
    await client.query('rollback');
  } finally {
    await client.end();
  }
}
