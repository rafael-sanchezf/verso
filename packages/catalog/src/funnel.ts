/**
 * The onboarding funnel as a plain table: `pnpm funnel`.
 *
 * Reads `funnel_report` and `funnel_report_by_cohort`
 * (supabase/migrations/20261012120000_funnel_report.sql), which the service
 * role alone may call, so this connects with `DATABASE_URL` the way the
 * catalog scripts do and never with a key from a file. It lives in this
 * package because this is where the repository's Node scripts against Postgres
 * already are (`pg`, the TLS rule in db.ts); it writes nothing.
 *
 * The window picks people by sign-up, half-open, in UTC: `--since 2026-10-13`
 * is everyone who signed up from that midnight on, and each step counts those
 * of them who reached it before `--until` (or now). The migration's header
 * says why it is a cohort funnel and how day 7 is counted.
 */

import pg from 'pg';

import { isLocal } from './db';

export interface FunnelArgs {
  /** Sign-ups from this instant on; null is open. */
  since: Date | null;
  /** Sign-ups and steps before this instant; null is now. */
  until: Date | null;
}

export interface FunnelStep {
  step: string;
  users: number;
}

export interface FunnelCohort {
  /** The Monday that names the week, YYYY-MM-DD, UTC. */
  week: string;
  signedUp: number;
  firstSession: number;
  tenRanked: number;
  firstPick: number;
  day7Return: number;
}

export function funnelUsage(): string {
  return [
    'Usage: pnpm funnel [--since YYYY-MM-DD] [--until YYYY-MM-DD]',
    '',
    'Prints the onboarding funnel for the accounts that signed up in the window',
    '(dates are UTC midnights; --until is exclusive), then the same steps by week',
    'of sign-up. Both flags are optional; without them every account is counted.',
    '',
    'Environment: DATABASE_URL, the Postgres connection string. Nothing is',
    'written.',
  ].join('\n');
}

/** A YYYY-MM-DD date, or a full ISO instant, as a Date. */
function parseInstant(flag: string, value: string | undefined): Date {
  if (!value) throw new Error(`${flag} needs a date, for example ${flag} 2026-10-13`);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) throw new Error(`${flag}: not a date: ${value}`);
  return date;
}

export function parseFunnelArgs(argv: readonly string[]): FunnelArgs {
  const args: FunnelArgs = { since: null, until: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    const [flag, inline] = arg.includes('=') ? (arg.split('=', 2) as [string, string]) : [arg, undefined];
    if (flag === '--since' || flag === '--until') {
      const value = inline ?? argv[++i];
      args[flag === '--since' ? 'since' : 'until'] = parseInstant(flag, value);
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${funnelUsage()}`);
    }
  }
  if (args.since && args.until && args.since >= args.until) {
    throw new Error('--since must be before --until');
  }
  return args;
}

/** Right-align numbers, left-align the first column; two spaces between. */
function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]!.length)));
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, c) => (c === 0 ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!)))
      .join('  ')
      .trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '-' : `${Math.round((part / whole) * 100)}%`;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The heading line: which sign-ups the numbers are about. */
export function describeWindow({ since, until }: FunnelArgs): string {
  const from = since ? `from ${day(since)}` : 'from the start';
  const to = until ? `to ${day(until)} (exclusive)` : 'to now';
  return `Sign-ups ${from} ${to}, UTC`;
}

export function formatFunnel(args: FunnelArgs, steps: readonly FunnelStep[], cohorts: readonly FunnelCohort[]): string {
  const signedUp = steps.find((s) => s.step === 'signed_up')?.users ?? 0;
  const funnel = table(
    ['step', 'users', 'of signed up'],
    steps.map((s) => [s.step, String(s.users), percent(s.users, signedUp)]),
  );
  const weeks =
    cohorts.length === 0
      ? 'No sign-ups in the window.'
      : table(
          ['week of', 'signed_up', 'first_session', 'ten_ranked', 'first_pick', 'day_7_return'],
          cohorts.map((c) => [
            c.week,
            String(c.signedUp),
            String(c.firstSession),
            String(c.tenRanked),
            String(c.firstPick),
            String(c.day7Return),
          ]),
        );
  return [
    describeWindow(args),
    '',
    funnel,
    '',
    'By week of sign-up (weeks start Monday, UTC; day_7_return reads low until a week is seven days old)',
    '',
    weeks,
  ].join('\n');
}

/** Anything with pg's `query`: a Client or a Pool. */
interface Queryable {
  query<R extends pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

export async function readFunnel(
  db: Queryable,
  { since, until }: FunnelArgs,
): Promise<{ steps: FunnelStep[]; cohorts: FunnelCohort[] }> {
  const params = [since?.toISOString() ?? null, until?.toISOString() ?? null];
  const steps = await db.query<{ step: string; users: number }>(
    'select step, users::integer as users from public.funnel_report($1, $2) order by step_order',
    params,
  );
  const cohorts = await db.query<{
    week: string;
    signed_up: number;
    first_session: number;
    ten_ranked: number;
    first_pick: number;
    day_7_return: number;
  }>(
    `select cohort_week::text as week, signed_up::integer, first_session::integer, ten_ranked::integer,
            first_pick::integer, day_7_return::integer
     from public.funnel_report_by_cohort($1, $2)`,
    params,
  );
  return {
    steps: steps.rows,
    cohorts: cohorts.rows.map((r) => ({
      week: r.week,
      signedUp: r.signed_up,
      firstSession: r.first_session,
      tenRanked: r.ten_ranked,
      firstPick: r.first_pick,
      day7Return: r.day_7_return,
    })),
  };
}

/** Connect, read, close. TLS as db.ts sets it: required off the local stack, unverified. */
export async function runFunnel(connectionString: string, args: FunnelArgs): Promise<string> {
  const client = new pg.Client({
    connectionString,
    ssl: isLocal(connectionString) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { steps, cohorts } = await readFunnel(client, args);
    return formatFunnel(args, steps, cohorts);
  } finally {
    await client.end();
  }
}
