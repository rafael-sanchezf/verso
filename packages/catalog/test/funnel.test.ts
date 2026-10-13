import { describe, expect, it } from 'vitest';
import { describeWindow, formatFunnel, parseFunnelArgs, readFunnel } from '../src/funnel';

describe('parseFunnelArgs', () => {
  it('defaults to an open window', () => {
    expect(parseFunnelArgs([])).toEqual({ since: null, until: null });
  });

  it('reads dates as UTC midnights, with or without =, past the -- pnpm forwards', () => {
    const args = parseFunnelArgs(['--', '--since', '2026-10-13', '--until=2026-12-01']);
    expect(args.since?.toISOString()).toBe('2026-10-13T00:00:00.000Z');
    expect(args.until?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('refuses a backwards window, a bad date and an unknown flag', () => {
    expect(() => parseFunnelArgs(['--since', '2026-12-01', '--until', '2026-10-13'])).toThrow(/before/);
    expect(() => parseFunnelArgs(['--since', 'October'])).toThrow(/not a date/);
    expect(() => parseFunnelArgs(['--since'])).toThrow(/needs a date/);
    expect(() => parseFunnelArgs(['--platform', 'web'])).toThrow(/unknown argument/);
  });
});

describe('formatFunnel', () => {
  const steps = [
    { step: 'signed_up', users: 3 },
    { step: 'first_session', users: 3 },
    { step: 'ten_ranked', users: 2 },
    { step: 'first_pick', users: 0 },
    { step: 'day_7_return', users: 1 },
  ];

  it('prints the steps with their share of sign-ups, then the weeks', () => {
    const out = formatFunnel(
      { since: new Date('2026-10-13T00:00:00Z'), until: null },
      steps,
      [{ week: '2026-10-13', signedUp: 3, firstSession: 3, tenRanked: 2, firstPick: 0, day7Return: 1 }],
    );
    expect(out).toContain('Sign-ups from 2026-10-13 to now, UTC');
    expect(out).toContain('signed_up          3          100%');
    expect(out).toContain('ten_ranked         2           67%');
    expect(out).toContain('first_pick         0            0%');
    expect(out).toMatch(/2026-10-13\s+3\s+3\s+2\s+0\s+1$/m);
  });

  it('says so when nobody signed up, rather than dividing by zero', () => {
    const empty = steps.map((s) => ({ ...s, users: 0 }));
    const out = formatFunnel({ since: null, until: null }, empty, []);
    expect(out).toContain('signed_up          0             -');
    expect(out).toContain('No sign-ups in the window.');
  });

  it('names an open start and an exclusive end', () => {
    expect(describeWindow({ since: null, until: new Date('2026-12-01T00:00:00Z') })).toBe(
      'Sign-ups from the start to 2026-12-01 (exclusive), UTC',
    );
  });
});

describe('readFunnel', () => {
  it('passes the window as two ISO parameters, nulls when open, to both functions', async () => {
    const calls: { text: string; values?: unknown[] }[] = [];
    const db = {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        const rows = text.includes('by_cohort')
          ? [{ week: '2026-10-13', signed_up: 2, first_session: 2, ten_ranked: 1, first_pick: 0, day_7_return: 0 }]
          : [{ step: 'signed_up', users: 2 }];
        return { rows } as never;
      },
    };
    const result = await readFunnel(db, { since: new Date('2026-10-13T00:00:00Z'), until: null });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.text).toContain('public.funnel_report($1, $2)');
    expect(calls[1]!.text).toContain('public.funnel_report_by_cohort($1, $2)');
    for (const call of calls) expect(call.values).toEqual(['2026-10-13T00:00:00.000Z', null]);
    expect(result.cohorts[0]).toEqual({
      week: '2026-10-13',
      signedUp: 2,
      firstSession: 2,
      tenRanked: 1,
      firstPick: 0,
      day7Return: 0,
    });
  });
});
