import { describe, expect, it } from 'vitest';
import {
  COMMAND_ALIASES,
  COMMANDS,
  parseArgs,
  parseAvailabilityArgs,
  parseOpenCriticScoresArgs,
  parseSteamScoresArgs,
  parseTmdbSyncArgs,
  parseWikidataIdsArgs,
  readCommand,
  usage,
} from '../src/args';
import { MOVIE_POPULARITY_THRESHOLD, TV_POPULARITY_THRESHOLD } from '../src/tmdb-map';
import { TMDB_DEFAULT_SINCE_HOURS, TMDB_DEFAULT_STALE_DAYS, TMDB_RUN_BUDGET } from '../src/tmdb-sync';
import { CROSS_LINK_PROPERTIES } from '../src/wikidata';

describe('parseArgs', () => {
  it('defaults to a delta run', () => {
    expect(parseArgs([])).toEqual({ full: false, dryRun: false });
  });

  it('reads --full', () => {
    expect(parseArgs(['--full']).full).toBe(true);
  });

  it('ignores the -- separator pnpm forwards', () => {
    // `pnpm catalog:sync -- --full` reaches the script as ['--', '--full'].
    expect(parseArgs(['--', '--full']).full).toBe(true);
  });

  it('reads --since as an instant', () => {
    const args = parseArgs(['--since', '2026-09-14T10:00:00Z']);
    expect(args.since?.toISOString()).toBe('2026-09-14T10:00:00.000Z');
  });

  it('rejects a --since that is not a date', () => {
    expect(() => parseArgs(['--since', 'yesterday'])).toThrow(/not a date/);
  });

  it('rejects --full together with --since', () => {
    expect(() => parseArgs(['--full', '--since', '2026-09-14T10:00:00Z'])).toThrow(
      /mutually exclusive/,
    );
  });

  it('rejects an unknown flag and prints usage', () => {
    expect(() => parseArgs(['--everything'])).toThrow(/Unknown argument: --everything/);
  });

  it('reads --max-pages and --dry-run', () => {
    const args = parseArgs(['--max-pages', '3', '--dry-run']);
    expect(args.maxPages).toBe(3);
    expect(args.dryRun).toBe(true);
  });

  it('rejects a --max-pages that is not a positive integer', () => {
    expect(() => parseArgs(['--max-pages', '0'])).toThrow(/positive integer/);
  });
});

describe('readCommand', () => {
  it('defaults to sync, so every existing invocation keeps working', () => {
    expect(readCommand([])).toEqual({ command: 'sync', rest: [] });
    expect(readCommand(['--full'])).toEqual({ command: 'sync', rest: ['--full'] });
    expect(readCommand(['--', '--full'])).toEqual({ command: 'sync', rest: ['--', '--full'] });
  });

  it('reads availability and hands the rest of the line on', () => {
    expect(readCommand(['availability', '--dry-run'])).toEqual({
      command: 'availability',
      rest: ['--dry-run'],
    });
    expect(readCommand(['--', 'availability', '--only', 'itad'])).toEqual({
      command: 'availability',
      rest: ['--only', 'itad'],
    });
  });

  it('reads steam-scores and hands the rest of the line on', () => {
    expect(readCommand(['steam-scores', '--dry-run'])).toEqual({
      command: 'steam-scores',
      rest: ['--dry-run'],
    });
  });

  it('reads the two enrichment commands', () => {
    expect(readCommand(['wikidata-ids', '--limit', '10'])).toEqual({
      command: 'wikidata-ids',
      rest: ['--limit', '10'],
    });
    expect(readCommand(['opencritic-scores', '--dry-run'])).toEqual({
      command: 'opencritic-scores',
      rest: ['--dry-run'],
    });
  });

  it('still answers to opencritic-ids, the name the merged workflow calls', () => {
    // PR #27's name for this pass when OpenCritic was the only identifier it
    // collected. The scheduled workflow on `main` calls it by that name, so
    // the alias is what makes the two orders of merging equivalent.
    expect(COMMAND_ALIASES.get('opencritic-ids')).toBe('wikidata-ids');
    expect(readCommand(['opencritic-ids', '--limit', '10'])).toEqual({
      command: 'wikidata-ids',
      rest: ['--limit', '10'],
    });
    expect(readCommand(['--', 'opencritic-ids', '--dry-run'])).toEqual({
      command: 'wikidata-ids',
      rest: ['--dry-run'],
    });
  });

  it('falls through on a name it inherits rather than a name it was given', () => {
    // The alias table is looked up with argv. A plain object literal answers
    // `constructor` out of Object.prototype, which would have made
    // `catalog constructor` resolve to a command of `Object`.
    for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(readCommand([word])).toEqual({ command: 'sync', rest: [word] });
    }
    expect(COMMAND_ALIASES.get('constructor')).toBeUndefined();
  });

  it('never confuses the OpenCritic commands for one another', () => {
    // They share a prefix, and the match has to be on the whole word.
    expect(readCommand(['opencritic']).command).toBe('sync');
    expect(readCommand(['wikidata']).command).toBe('sync');
  });

  it('skips the -- separators pnpm forwards on either side of the command', () => {
    expect(readCommand(['steam-scores', '--', '--dry-run'])).toEqual({
      command: 'steam-scores',
      rest: ['--', '--dry-run'],
    });
    expect(readCommand(['--', 'steam-scores', '--dry-run'])).toEqual({
      command: 'steam-scores',
      rest: ['--dry-run'],
    });
  });

  it('reads tmdb-sync and hands the rest of the line on', () => {
    expect(readCommand(['tmdb-sync', '--dry-run', '--max-ids', '1'])).toEqual({
      command: 'tmdb-sync',
      rest: ['--dry-run', '--max-ids', '1'],
    });
    expect(readCommand(['--', 'tmdb-sync', '--full'])).toEqual({
      command: 'tmdb-sync',
      rest: ['--full'],
    });
    expect(COMMANDS).toContain('tmdb-sync');
    // A prefix is not the command: `tmdb` alone still falls through to sync.
    expect(readCommand(['tmdb']).command).toBe('sync');
  });

  it('reads an explicit sync too', () => {
    expect(readCommand(['sync', '--full'])).toEqual({ command: 'sync', rest: ['--full'] });
  });

  it('leaves a word that is not a command in the line, where it becomes an error', () => {
    const { command, rest } = readCommand(['scores']);

    expect(command).toBe('sync');
    expect(() => parseArgs(rest)).toThrow(/Unknown argument: scores/);
  });
});

describe('parseSteamScoresArgs', () => {
  it('defaults to writing, with the client\'s own budget and window', () => {
    expect(parseSteamScoresArgs([])).toEqual({ dryRun: false });
  });

  it('reads --budget and --stale-hours', () => {
    expect(parseSteamScoresArgs(['--budget', '120', '--stale-hours', '6'])).toEqual({
      budget: 120,
      staleHours: 6,
      dryRun: false,
    });
  });

  it('reads --dry-run', () => {
    expect(parseSteamScoresArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('ignores the -- separator pnpm forwards', () => {
    expect(parseSteamScoresArgs(['--', '--dry-run']).dryRun).toBe(true);
  });

  it('rejects a budget or a window that is not a positive integer', () => {
    expect(() => parseSteamScoresArgs(['--budget', '0'])).toThrow(/--budget needs a positive/);
    expect(() => parseSteamScoresArgs(['--budget', 'lots'])).toThrow(/--budget needs a positive/);
    expect(() => parseSteamScoresArgs(['--stale-hours', '-1'])).toThrow(
      /--stale-hours needs a positive/,
    );
  });

  it('rejects the sync command\'s flags, which mean nothing here', () => {
    expect(() => parseSteamScoresArgs(['--full'])).toThrow(/Unknown argument: --full/);
    expect(() => parseSteamScoresArgs(['--max-pages', '2'])).toThrow(/Unknown argument/);
  });
});

describe('parseWikidataIdsArgs', () => {
  it('defaults to writing, with the command\'s own limit and window', () => {
    expect(parseWikidataIdsArgs([])).toEqual({ dryRun: false });
  });

  it('reads --limit, --chunk-size and --recheck-days', () => {
    expect(
      parseWikidataIdsArgs(['--limit', '5000', '--chunk-size', '250', '--recheck-days', '7']),
    ).toEqual({ limit: 5000, chunkSize: 250, recheckDays: 7, dryRun: false });
  });

  it('reads --dry-run and ignores the -- separator pnpm forwards', () => {
    expect(parseWikidataIdsArgs(['--', '--dry-run']).dryRun).toBe(true);
  });

  it('rejects a value that is not a positive integer', () => {
    expect(() => parseWikidataIdsArgs(['--limit', '0'])).toThrow(/--limit needs a positive/);
    expect(() => parseWikidataIdsArgs(['--chunk-size', 'lots'])).toThrow(
      /--chunk-size needs a positive/,
    );
    expect(() => parseWikidataIdsArgs(['--recheck-days', '-3'])).toThrow(
      /--recheck-days needs a positive/,
    );
  });

  it('rejects the other commands\' flags, which mean nothing here', () => {
    expect(() => parseWikidataIdsArgs(['--budget', '10'])).toThrow(/Unknown argument: --budget/);
    expect(() => parseWikidataIdsArgs(['--full'])).toThrow(/Unknown argument: --full/);
  });

  it('parses the same flags under the old command name', () => {
    const { command, rest } = readCommand(['opencritic-ids', '--limit', '5']);
    expect(command).toBe('wikidata-ids');
    expect(parseWikidataIdsArgs(rest)).toEqual({ limit: 5, dryRun: false });
  });
});

describe('parseOpenCriticScoresArgs', () => {
  it('defaults to writing, with the client\'s own budget and window', () => {
    expect(parseOpenCriticScoresArgs([])).toEqual({ dryRun: false });
  });

  it('reads --budget and --stale-hours', () => {
    expect(parseOpenCriticScoresArgs(['--budget', '40', '--stale-hours', '24'])).toEqual({
      budget: 40,
      staleHours: 24,
      dryRun: false,
    });
  });

  it('reads --dry-run and ignores the -- separator pnpm forwards', () => {
    expect(parseOpenCriticScoresArgs(['--', '--dry-run']).dryRun).toBe(true);
  });

  it('rejects a budget or a window that is not a positive integer', () => {
    expect(() => parseOpenCriticScoresArgs(['--budget', '0'])).toThrow(/--budget needs a positive/);
    expect(() => parseOpenCriticScoresArgs(['--stale-hours', 'many'])).toThrow(
      /--stale-hours needs a positive/,
    );
  });

  it('rejects the id command\'s flags, which mean nothing here', () => {
    expect(() => parseOpenCriticScoresArgs(['--chunk-size', '10'])).toThrow(
      /Unknown argument: --chunk-size/,
    );
  });
});

describe('usage', () => {
  it('names every command and says what each needs', () => {
    const text = usage();

    expect(text).toContain('steam-scores');
    expect(text).toContain('external_scores (igdb_critics, igdb_users)');
    expect(text).toContain('external_ids.steam');
    expect(text).toContain('DATABASE_URL only: the storefront takes no key');
    expect(text).toContain('wikidata-ids');
    expect(text).toContain('Also accepted as opencritic-ids, its former name.');
    expect(text).toContain('opencritic-scores');
    expect(text).toContain('external_ids.opencritic');
    expect(text).toContain('P5794');
    expect(text).toContain('P9043');
  });

  it('names every identifier the Wikidata pass collects', () => {
    const text = usage();
    for (const property of CROSS_LINK_PROPERTIES) expect(text).toContain(property.key);
    expect(text).toContain('OPENCRITIC_RAPIDAPI_KEY');
    expect(text).toContain('skips with a message rather than failing');
  });

  it('lists a usage line for every command', () => {
    const text = usage();
    for (const command of COMMANDS) expect(text).toContain(`run ${command} -- [options]`);
  });

  it('carries no secret value, only the names of the variables', () => {
    expect(usage()).not.toMatch(/=\S/);
  });

  it('names the availability command, its sources and its one optional key', () => {
    const text = usage();

    expect(text).toContain('availability');
    expect(text).toContain('game_availability');
    expect(text).toContain('geforce-now, game-pass, itad');
    expect(text).toContain('ITAD_API_KEY');
  });
});

describe('parseAvailabilityArgs', () => {
  it('defaults to writing, every source, and the region the run picks', () => {
    expect(parseAvailabilityArgs([])).toEqual({ dryRun: false });
  });

  it('reads --dry-run and the -- separator pnpm forwards', () => {
    expect(parseAvailabilityArgs(['--dry-run']).dryRun).toBe(true);
    expect(parseAvailabilityArgs(['--', '--dry-run']).dryRun).toBe(true);
  });

  it('reads --only as a comma-separated list of sources', () => {
    expect(parseAvailabilityArgs(['--only', 'game-pass']).sources).toEqual(['game-pass']);
    expect(parseAvailabilityArgs(['--only', 'game-pass,itad']).sources).toEqual([
      'game-pass',
      'itad',
    ]);
  });

  it('puts --only back in the canonical order, so two runs’ logs compare', () => {
    expect(parseAvailabilityArgs(['--only', 'itad, game-pass']).sources).toEqual([
      'game-pass',
      'itad',
    ]);
    expect(parseAvailabilityArgs(['--only', 'itad,itad']).sources).toEqual(['itad']);
  });

  it('rejects a source it does not know, and says which ones it does', () => {
    expect(() => parseAvailabilityArgs(['--only', 'ps-plus'])).toThrow(
      /does not know the source ps-plus/,
    );
    expect(() => parseAvailabilityArgs(['--only', 'ps-plus'])).toThrow(/geforce-now/);
    expect(() => parseAvailabilityArgs(['--only'])).toThrow(/--only needs one of/);
  });

  it('reads --region as a two-letter code and upper-cases it', () => {
    expect(parseAvailabilityArgs(['--region', 'gb']).region).toBe('GB');
    expect(() => parseAvailabilityArgs(['--region', 'United Kingdom'])).toThrow(
      /two-letter country code/,
    );
    expect(() => parseAvailabilityArgs(['--region'])).toThrow(/two-letter country code/);
  });

  it('reads --itad-limit', () => {
    expect(parseAvailabilityArgs(['--itad-limit', '50']).itadLimit).toBe(50);
    expect(() => parseAvailabilityArgs(['--itad-limit', '0'])).toThrow(
      /--itad-limit needs a positive/,
    );
  });

  it('rejects the other commands’ flags, which mean nothing here', () => {
    expect(() => parseAvailabilityArgs(['--full'])).toThrow(/Unknown argument: --full/);
    expect(() => parseAvailabilityArgs(['--budget', '10'])).toThrow(/Unknown argument: --budget/);
  });
});

describe('parseTmdbSyncArgs', () => {
  it('defaults to a nightly run over both media', () => {
    expect(parseTmdbSyncArgs([])).toEqual({ full: false, dryRun: false });
  });

  it('reads --full and --dry-run, and the -- separator pnpm forwards', () => {
    expect(parseTmdbSyncArgs(['--', '--full', '--dry-run'])).toEqual({
      full: true,
      dryRun: true,
    });
  });

  it('reads --medium, de-duplicated and back in the canonical order', () => {
    expect(parseTmdbSyncArgs(['--medium', 'movie']).media).toEqual(['movie']);
    expect(parseTmdbSyncArgs(['--medium', 'tv,movie,tv']).media).toEqual(['movie', 'tv']);
  });

  it('rejects a medium it does not know, and says which ones it does', () => {
    expect(() => parseTmdbSyncArgs(['--medium', 'anime'])).toThrow(/does not know anime/);
    expect(() => parseTmdbSyncArgs(['--medium', 'anime'])).toThrow(/movie, tv/);
    expect(() => parseTmdbSyncArgs(['--medium'])).toThrow(/needs at least one value/);
  });

  it('reads --regions as two-letter codes, upper-cased and de-duplicated', () => {
    expect(parseTmdbSyncArgs(['--regions', 'us']).regions).toEqual(['US']);
    expect(parseTmdbSyncArgs(['--regions', 'us,GB,us']).regions).toEqual(['US', 'GB']);
    expect(() => parseTmdbSyncArgs(['--regions', 'United States'])).toThrow(
      /two-letter country codes/,
    );
  });

  it('reads the three numbers and --max-ids', () => {
    const args = parseTmdbSyncArgs([
      '--budget',
      '500',
      '--stale-days',
      '30',
      '--since',
      '48',
      '--max-ids',
      '5',
    ]);
    expect(args.budget).toBe(500);
    expect(args.staleDays).toBe(30);
    expect(args.sinceHours).toBe(48);
    expect(args.maxIds).toBe(5);
  });

  it('takes --since as hours here, not as an instant', () => {
    // `sync --since` is an ISO timestamp; this one is a count of hours,
    // because the window it sets reaches TMDB as two plain dates.
    expect(parseTmdbSyncArgs(['--since', '26']).sinceHours).toBe(26);
    expect(() => parseTmdbSyncArgs(['--since', '2026-09-14T10:00:00Z'])).toThrow(
      /--since needs a positive integer/,
    );
  });

  it('rejects a number that is not a positive integer', () => {
    expect(() => parseTmdbSyncArgs(['--budget', '0'])).toThrow(/--budget needs a positive/);
    expect(() => parseTmdbSyncArgs(['--max-ids', '-1'])).toThrow(/--max-ids needs a positive/);
  });

  it('rejects the other commands\u2019 flags, which mean nothing here', () => {
    expect(() => parseTmdbSyncArgs(['--only', 'itad'])).toThrow(/Unknown argument: --only/);
    expect(() => parseTmdbSyncArgs(['--max-pages', '2'])).toThrow(/Unknown argument: --max-pages/);
  });
});

describe('usage covers tmdb-sync', () => {
  it('lists the command, its flags and its defaults', () => {
    const text = usage();

    expect(text).toContain('tmdb-sync');
    expect(text).toContain('tmdb-sync options:');
    for (const flag of [
      '--full',
      '--medium',
      '--regions',
      '--budget',
      '--stale-days',
      '--since',
      '--max-ids',
      '--dry-run',
    ]) {
      expect(text).toContain(flag);
    }
    expect(text).toContain(String(TMDB_RUN_BUDGET));
    expect(text).toContain(String(TMDB_DEFAULT_STALE_DAYS));
    expect(text).toContain(String(TMDB_DEFAULT_SINCE_HOURS));
    expect(text).toContain(String(MOVIE_POPULARITY_THRESHOLD));
    expect(text).toContain(String(TV_POPULARITY_THRESHOLD));
    expect(text).toContain('TMDB_API_READ_ACCESS_TOKEN');
  });
});
