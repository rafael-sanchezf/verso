import { describe, expect, it } from 'vitest';
import {
  type CalibrationRow,
  type LooSummary,
  type RankedList,
  describeFilter,
  formatHeader,
  formatSection,
  parseEngineReportArgs,
  readLists,
  writeEngineReport,
} from '../src/engine-report';

const USER_A = '3f2a9c1b-7d4e-4a10-9c2b-5e8f0a1d2400';
const USER_B = 'b71e0d55-2c9a-4f3b-8e61-0a4d9c7f2400';
const NOW = new Date('2026-10-28T15:04:30Z');

describe('parseEngineReportArgs', () => {
  it('defaults to every user and medium', () => {
    expect(parseEngineReportArgs([])).toEqual({ user: null, medium: null });
  });

  it('reads a user prefix and a medium, with or without =, past the -- pnpm forwards', () => {
    expect(parseEngineReportArgs(['--', '--user', '3F2A9C1B', '--medium=movie'])).toEqual({
      user: '3f2a9c1b',
      medium: 'movie',
    });
  });

  it('refuses a missing value, a medium it does not know and an unknown flag', () => {
    expect(() => parseEngineReportArgs(['--user'])).toThrow(/needs an id/);
    expect(() => parseEngineReportArgs(['--medium', 'book'])).toThrow(/one of game, movie, tv/);
    expect(() => parseEngineReportArgs(['--since', '2026-10-13'])).toThrow(/unknown argument/);
  });

  it('refuses anything but hex and dashes for --user, without echoing it', () => {
    expect(() => parseEngineReportArgs(['--user', 'rafa@example.com'])).toThrow(/user id or its first characters/);
    expect(() => parseEngineReportArgs(['--user', 'rafa@example.com'])).not.toThrow(/example\.com/);
    expect(() => parseEngineReportArgs(['--user', '3f%'])).toThrow(/user id/);
  });
});

describe('formatHeader', () => {
  const lists: RankedList[] = [
    { userId: USER_A, medium: 'game', ranked: 16 },
    { userId: USER_B, medium: 'movie', ranked: 6 },
  ];

  it('names the time, the lists and when each medium the lists cover last had its priors computed', () => {
    const out = formatHeader({ user: null, medium: null }, NOW, lists, [
      { medium: 'game', computedAt: new Date('2026-10-28T03:30:12Z') },
      { medium: 'tv', computedAt: new Date('2026-10-28T03:30:12Z') },
    ]);
    expect(out).toContain("The engine's report, 2026-10-28 15:04 UTC");
    expect(out).toContain('Lists: every user and medium.');
    expect(out).toContain('last computed: game 2026-10-28 03:30 UTC, movie never (this report');
    expect(out).not.toContain('tv 2026');
  });

  it('says so when no list matches the flags, and when there are none at all', () => {
    expect(formatHeader({ user: null, medium: 'tv' }, NOW, [], [])).toContain('No ranked list matches.');
    expect(formatHeader({ user: null, medium: null }, NOW, [], [])).toContain('No ranked lists yet.');
  });

  it('describes a prefix with a star and a full id without one', () => {
    expect(describeFilter({ user: '3f2a', medium: null })).toBe('user 3f2a*, every medium');
    expect(describeFilter({ user: USER_A, medium: 'game' })).toBe('user 3f2a9c1b, game only');
    expect(describeFilter({ user: null, medium: 'movie' })).toBe('every user, movie only');
  });
});

describe('formatSection', () => {
  const list: RankedList = { userId: USER_A, medium: 'game', ranked: 16 };
  const loo: LooSummary = {
    n: 16,
    maePredicted: '2.274',
    maeContent: '1.468',
    maeUserMean: '2.591',
    maePrior: '2.846',
    tierAccuracy: '0.313',
    spearman: '-0.143',
  };
  const row = (over: Partial<CalibrationRow>): CalibrationRow => ({
    userId: USER_A,
    medium: 'game',
    modelVersion: 'content-v1',
    listSizeBand: 'under 5',
    confidence: 'needs_more_data',
    source: 'user',
    n: 5,
    tierHitRate: '0.400',
    maePredicted: '1.966',
    maeContent: null,
    maeUserMean: null,
    maePrior: '2.100',
    ...over,
  });

  it('heads the section with the medium, the short id and the list size, never the full id', () => {
    const out = formatSection(list, loo, []);
    expect(out).toContain('game, user 3f2a9c1b: 16 ranked');
    expect(out).not.toContain(USER_A);
  });

  it("prints the harness's row with Postgres's digits, right-aligned under its column names", () => {
    const out = formatSection(list, loo, []);
    expect(out).toContain('   n  mae_predicted  mae_content  mae_user_mean  mae_prior  tier_accuracy  spearman');
    expect(out).toContain('  16          2.274        1.468          2.591      2.846          0.313    -0.143');
  });

  it('prints one calibration row per band, text columns left, numbers right, a dash for null', () => {
    const out = formatSection(list, loo, [
      row({}),
      row({ listSizeBand: '10 to 24', confidence: 'high', n: 12, maeContent: '0.110', maeUserMean: '0.630' }),
    ]);
    expect(out).toContain(
      '  model_version  list_size_band  confidence       source   n  tier_hit_rate  mae_predicted  mae_content  mae_user_mean  mae_prior',
    );
    expect(out).toContain(
      '  content-v1     under 5         needs_more_data  user     5          0.400          1.966            -              -      2.100',
    );
    expect(out).toContain(
      '  content-v1     10 to 24        high             user    12          0.400          1.966        0.110          0.630      2.100',
    );
  });

  it('says why a list has no insertion guesses rather than printing an empty table', () => {
    expect(formatSection(list, loo, [])).toContain('None yet: a guess is logged at each placement since VER-233');
  });

  it('prints an empty harness value, such as Spearman on one item, as a dash', () => {
    const out = formatSection({ ...list, ranked: 1 }, { ...loo, n: 1, spearman: null }, []);
    expect(out).toMatch(/^ {2}1 .*0\.313 {9}-$/m);
  });
});

/** A fake pg client that answers by which relation the query reads. */
function fakeDb(calibration: Record<string, unknown>[] = []) {
  const calls: { text: string; values?: unknown[] }[] = [];
  const db = {
    query: async (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      let rows: unknown[] = [];
      if (text.includes('from public.ranking_entries')) {
        rows = [
          { user_id: USER_A, medium: 'game', ranked: 16 },
          { user_id: USER_B, medium: 'movie', ranked: 6 },
        ];
      } else if (text.includes('from public.prediction_calibration')) {
        rows = calibration;
      } else if (text.includes('from public.item_prior')) {
        rows = [{ medium: 'game', computed_at: new Date('2026-10-28T03:30:00Z') }];
      } else if (text.includes('recommendation_loo_summary')) {
        rows = [
          {
            n: values?.[0] === USER_A ? 16 : 6,
            mae_predicted: '1.000',
            mae_content: null,
            mae_user_mean: '2.000',
            mae_prior: '3.000',
            tier_accuracy: '0.500',
            spearman: null,
          },
        ];
      }
      return { rows } as never;
    },
  };
  return { db, calls };
}

describe('readLists', () => {
  it('passes the flags as two parameters, nulls when absent, and reads every ranked list', async () => {
    const { db, calls } = fakeDb();
    const lists = await readLists(db, { user: '3f2a', medium: null });
    expect(calls[0]!.values).toEqual(['3f2a', null]);
    expect(calls[0]!.text).toContain("like $1::text || '%'");
    expect(lists).toEqual([
      { userId: USER_A, medium: 'game', ranked: 16 },
      { userId: USER_B, medium: 'movie', ranked: 6 },
    ]);
  });
});

describe('writeEngineReport', () => {
  it('writes the header, then one section per list, the harness called once per list with its own user and medium', async () => {
    const { db, calls } = fakeDb([
      {
        user_id: USER_B,
        medium: 'movie',
        model_version: 'content-v1',
        list_size_band: '5 to 9',
        confidence: 'medium',
        source: 'import',
        n: 3,
        tier_hit_rate: '0.667',
        mae_predicted: '0.920',
        mae_content: '1.870',
        mae_user_mean: '1.580',
        mae_prior: '0.600',
      },
    ]);
    const out: string[] = [];
    await writeEngineReport(db, { user: null, medium: null }, NOW, (text) => out.push(text));

    expect(out).toHaveLength(3);
    expect(out[0]).toContain("The engine's report");
    expect(out[1]).toContain('game, user 3f2a9c1b: 16 ranked');
    expect(out[1]).toContain('None yet');
    expect(out[2]).toContain('movie, user b71e0d55: 6 ranked');
    expect(out[2]).toMatch(/content-v1 +5 to 9 +medium +import +3 +0\.667/);

    const harness = calls.filter((c) => c.text.includes('recommendation_loo_summary'));
    expect(harness.map((c) => c.values)).toEqual([
      [USER_A, 'game'],
      [USER_B, 'movie'],
    ]);
    for (const call of calls) expect(call.text).not.toMatch(/\b(insert|update|delete|refresh_item_priors)\b/i);
  });

  it('stops after the header when no list matches, without calling the harness', async () => {
    const calls: string[] = [];
    const db = {
      query: async (text: string) => {
        calls.push(text);
        return { rows: [] } as never;
      },
    };
    const out: string[] = [];
    await writeEngineReport(db, { user: 'ffff', medium: 'game' }, NOW, (text) => out.push(text));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('No ranked list matches.');
    expect(calls).toHaveLength(1);
  });
});
