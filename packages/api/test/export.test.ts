/**
 * `export.ts`: the document, the validator, and the round trip.
 *
 * The validator tests need no stack and always run. The rest exports one user's
 * data and imports it into a second, brand new user, which is the only honest
 * way to prove the file carries enough to rebuild a library somewhere else.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TIERS } from '@verso/core';
import { moveBacklogEntry } from '../src/backlog';
import type { Client } from '../src/client';
import {
  getEntry,
  markFinished,
  setNotes,
  setPlayedPlatforms,
  setPurchasedAt,
  setStatus,
  logPlaytime,
} from '../src/entries';
import {
  EXPORT_CSV_COLUMNS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportUserData,
  exportUserDataCsv,
  ImportValidationError,
  importEntries,
  validateExportDocument,
  type ExportDocument,
  type ExportEntry,
} from '../src/export';
import { finishInsertion, insertRankingEntry } from '../src/ranking';
import { backlog } from '../src/views';
import { live, seedGames, signUpUser, stopClients, type SeededGame } from './support';

/** The smallest document the validator should accept: entries and nothing else. */
function minimalDocument(entries: unknown[] = []): Record<string, unknown> {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: '2026-09-16T00:00:00.000Z',
    medium: 'game',
    entries,
  };
}

function entryFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    item: { igdbId: 1234, title: 'A Game', year: 2020 },
    status: 'backlog',
    addedAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    purchasedAt: null,
    notes: null,
    playtimeMinutes: null,
    playtimeSource: null,
    ...overrides,
  };
}

describe('validateExportDocument', () => {
  it('accepts a document with entries and no rankings or comparisons', () => {
    const doc = validateExportDocument(minimalDocument([entryFixture()]));

    expect(doc.medium).toBe('game');
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]!.item.igdbId).toBe(1234);
    expect(doc.rankings).toEqual([]);
    expect(doc.comparisons).toEqual([]);
  });

  it('refuses something that is not a JSON object at all', () => {
    expect(() => validateExportDocument('{}')).toThrow(ImportValidationError);
    expect(() => validateExportDocument(null)).toThrow(ImportValidationError);
    expect(() => validateExportDocument([minimalDocument()])).toThrow(ImportValidationError);
  });

  it('refuses a document that is not ours, and one with no entries', () => {
    expect(() => validateExportDocument({ ...minimalDocument(), format: 'letterboxd' })).toThrow(
      /format must be/,
    );
    const { entries: _entries, ...withoutEntries } = minimalDocument();
    expect(() => validateExportDocument(withoutEntries)).toThrow(/entries must be an array/);
  });

  it('says plainly when the file was written by a newer version of the app', () => {
    expect(() => validateExportDocument({ ...minimalDocument(), version: EXPORT_VERSION + 1 })).toThrow(
      /written by a newer version/,
    );
  });

  it('reports every problem it found, not only the first', () => {
    const error = (() => {
      try {
        validateExportDocument(
          minimalDocument([
            entryFixture({ status: 'wishlist' }),
            entryFixture({ finishedAt: '04/07/2023', playtimeMinutes: -5 }),
            entryFixture({ item: { igdbId: 'nope', title: '', year: 2020 } }),
          ]),
        );
        return null;
      } catch (e) {
        return e as ImportValidationError;
      }
    })();

    expect(error).toBeInstanceOf(ImportValidationError);
    expect(error!.problems).toHaveLength(5);
    expect(error!.problems.join('\n')).toMatch(/entries\[0\]\.status/);
    expect(error!.problems.join('\n')).toMatch(/entries\[1\]\.finishedAt/);
    expect(error!.problems.join('\n')).toMatch(/entries\[1\]\.playtimeMinutes/);
    expect(error!.problems.join('\n')).toMatch(/entries\[2\]\.item\.igdbId/);
    expect(error!.problems.join('\n')).toMatch(/entries\[2\]\.item\.title/);
  });

  it('allows an item with no IGDB id, which an import will report as unmatched', () => {
    const doc = validateExportDocument(
      minimalDocument([entryFixture({ item: { igdbId: null, title: 'Homebrew', year: null } })]),
    );
    expect(doc.entries[0]!.item.igdbId).toBeNull();
  });

  it('reads playedPlatforms when it is there, and an entry without one as nothing recorded', () => {
    const doc = validateExportDocument(
      minimalDocument([
        entryFixture({ playedPlatforms: ['PlayStation 5'] }),
        // A version 1 file from before the field existed.
        entryFixture(),
        entryFixture({ playedPlatforms: null }),
      ]),
    );

    expect(doc.entries.map((entry) => entry.playedPlatforms)).toEqual([['PlayStation 5'], [], []]);
  });

  it('accepts the ownedPlatforms key of a file written before decision 26, and ignores it', () => {
    const doc = validateExportDocument(
      minimalDocument([
        // What every version 1 file written before 2026-10-07 carries.
        entryFixture({ ownedPlatforms: ['Nintendo Switch'], playedPlatforms: ['PlayStation 5'] }),
        entryFixture({ ownedPlatforms: [] }),
        // Ignored means not read at all: a value that was never valid is not
        // a reason to refuse an old file now.
        entryFixture({ ownedPlatforms: 'PC' }),
      ]),
    );

    expect(doc.entries).toHaveLength(3);
    for (const entry of doc.entries) expect(entry).not.toHaveProperty('ownedPlatforms');
    // And nothing in it becomes a played-on answer.
    expect(doc.entries.map((entry) => entry.playedPlatforms)).toEqual([['PlayStation 5'], [], []]);
  });

  it('refuses playedPlatforms that is not a list of names', () => {
    expect(() =>
      validateExportDocument(minimalDocument([entryFixture({ playedPlatforms: 'PlayStation 5' })])),
    ).toThrow(/entries\[0\]\.playedPlatforms must be an array/);
    expect(() =>
      validateExportDocument(minimalDocument([entryFixture({ playedPlatforms: ['PC', 5] })])),
    ).toThrow(/playedPlatforms/);
  });
});

describe.skipIf(!live)('export and import against a local stack', () => {
  let source: Client;
  let target: Client;
  let games: Record<string, SeededGame>;
  let document: ExportDocument;

  beforeAll(async () => {
    source = (await signUpUser('export-source')).client;
    target = (await signUpUser('export-target')).client;
    games = await seedGames([
      { key: 'played', platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'] },
      { key: 'playing' },
      { key: 'backlog' },
      { key: 'backlog2' },
      { key: 'backlog3' },
      { key: 'dropped' },
      { key: 'untracked' },
      // A film in the same library. One medium per document, so it belongs to
      // neither the games export nor the import that follows it.
      { key: 'film', medium: 'movie', title: 'A Film' },
    ]);

    await setStatus(source, games['playing']!.mediaItemId, 'playing');
    await setStatus(source, games['backlog']!.mediaItemId, 'backlog');
    await setStatus(source, games['backlog2']!.mediaItemId, 'backlog');
    const third = await setStatus(source, games['backlog3']!.mediaItemId, 'backlog');
    await setStatus(source, games['dropped']!.mediaItemId, 'dropped');

    // Drag the last one to the front, so the exported order is one the user
    // arranged rather than the order things were added.
    await moveBacklogEntry(source, { entryId: third.id, position: 0 });

    const played = games['played']!.mediaItemId;
    await setStatus(source, played, 'played');
    await setNotes(source, played, 'the one I finished');
    await logPlaytime(source, played, 1_500);
    await setPurchasedAt(source, played, '2025-11-30');
    await setPlayedPlatforms(source, played, ['PC (Microsoft Windows)']);

    // A ranking with the comparison log that produced it, written the way the
    // app writes them: one transaction per ranked game.
    await finishInsertion(source, {
      mediaItemId: played,
      medium: 'game',
      tier: 'loved',
      position: 0,
      comparisons: [],
    });
    await finishInsertion(source, {
      mediaItemId: games['playing']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 1,
      comparisons: [
        {
          item_a: played,
          item_b: games['playing']!.mediaItemId,
          outcome: 'a',
          context: { tier: 'loved', sameGenre: true, tierSize: 1, pivotReason: { kind: 'midpoint' } },
        },
      ],
    });

    // The film, tracked and ranked the way the games above are.
    await setStatus(source, games['film']!.mediaItemId, 'played');
    await finishInsertion(source, {
      mediaItemId: games['film']!.mediaItemId,
      medium: 'movie',
      tier: 'loved',
      position: 0,
      comparisons: [],
    });

    document = await exportUserData(source);
  });

  afterAll(async () => {
    await stopClients();
  });

  it('produces a versioned document that names every game by IGDB id and title', () => {
    expect(document.format).toBe(EXPORT_FORMAT);
    expect(document.version).toBe(EXPORT_VERSION);
    expect(document.medium).toBe('game');
    expect(Date.parse(document.exportedAt)).not.toBeNaN();

    expect(document.entries).toHaveLength(6);
    for (const entry of document.entries) {
      expect(entry.item.igdbId).toEqual(expect.any(Number));
      expect(entry.item.title).toBeTruthy();
    }
    expect(document.entries.map((entry) => entry.item.igdbId)).not.toContain(
      games['untracked']!.igdbId,
    );
  });

  it('carries every fact the user typed', () => {
    const played = document.entries.find((entry) => entry.item.igdbId === games['played']!.igdbId)!;

    expect(played.status).toBe('played');
    expect(played.notes).toBe('the one I finished');
    expect(played.playtimeMinutes).toBe(1_500);
    expect(played.playtimeSource).toBe('manual');
    expect(played.purchasedAt).toBe('2025-11-30');
    expect(played.playedPlatforms).toEqual(['PC (Microsoft Windows)']);
    // Decision 26: the export no longer writes an owned list.
    expect(played).not.toHaveProperty('ownedPlatforms');
    expect(Date.parse(played.addedAt)).not.toBeNaN();

    // Nothing recorded is an empty list in the file, never a missing key.
    const playing = document.entries.find((entry) => entry.item.igdbId === games['playing']!.igdbId)!;
    expect(playing.playedPlatforms).toEqual([]);
  });

  it('carries the ranked list with its derived scores, and the comparisons behind it', () => {
    expect(document.rankings).toHaveLength(2);
    expect(document.rankings[0]).toMatchObject({
      tier: 'loved',
      position: 0,
      score: 10,
      item: { igdbId: games['played']!.igdbId },
    });
    expect(document.rankings[1]).toMatchObject({ tier: 'loved', position: 1, score: 8.5 });

    expect(document.comparisons).toHaveLength(1);
    expect(document.comparisons[0]!.itemA.igdbId).toBe(games['played']!.igdbId);
    expect(document.comparisons[0]!.itemB.igdbId).toBe(games['playing']!.igdbId);
    expect(document.comparisons[0]!.outcome).toBe('a');
    expect(document.comparisons[0]!.context).toMatchObject({ tier: 'loved' });
  });

  it('writes one medium per document: the games by default, the film when asked', async () => {
    expect(document.entries.map((entry) => entry.item.igdbId)).not.toContain(games['film']!.igdbId);
    expect(document.rankings.map((ranking) => ranking.item.igdbId)).not.toContain(
      games['film']!.igdbId,
    );

    const film = await exportUserData(source, { medium: 'movie' });

    expect(film.medium).toBe('movie');
    expect(film.entries.map((entry) => entry.item.igdbId)).toEqual([games['film']!.igdbId]);
    // Alone in its tier, so the top of the loved band rather than the 10 the
    // same position scores in the two-game games list.
    expect(film.rankings).toEqual([
      {
        item: { igdbId: games['film']!.igdbId, title: 'A Film', year: 2020 },
        tier: 'loved',
        position: 0,
        score: 9.3,
      },
    ]);
    // `finishInsertion` logged none, and the games' one comparison is not this
    // document's: `comparisons` carries the medium itself.
    expect(film.comparisons).toEqual([]);
  });

  it('survives a JSON round trip: what comes out parses back into what went in', () => {
    const reparsed = validateExportDocument(JSON.parse(JSON.stringify(document)));
    expect(reparsed.entries).toEqual(document.entries);
  });

  it('imports entries into a second account, matching by IGDB id', async () => {
    const result = await importEntries(target, JSON.parse(JSON.stringify(document)));

    expect(result).toMatchObject({ matched: 6, created: 6, updated: 0, unmatched: 0 });
    expect(result.unmatchedItems).toEqual([]);

    const played = (await getEntry(target, games['played']!.mediaItemId))!;
    expect(played.status).toBe('played');
    expect(played.notes).toBe('the one I finished');
    expect(played.playtimeMinutes).toBe(1_500);
    expect(played.playtimeSource).toBe('manual');
    expect(played.purchasedAt).toBe('2025-11-30');
    expect(played.playedPlatforms).toEqual(['PC (Microsoft Windows)']);

    // The order of the backlog is part of what is restored.
    const source = document.entries.find((entry) => entry.item.igdbId === games['played']!.igdbId)!;
    expect(Date.parse(played.addedAt)).toBe(Date.parse(source.addedAt));
  });

  it('brings the backlog back in the order the user dragged it into', async () => {
    const here = (await backlog(source)).map((row) => row.mediaItemId);
    const there = (await backlog(target)).map((row) => row.mediaItemId);

    expect(here).toEqual([
      games['backlog3']!.mediaItemId,
      games['backlog']!.mediaItemId,
      games['backlog2']!.mediaItemId,
    ]);
    expect(there).toEqual(here);
  });

  it('imports entries only, and counts the rankings and comparisons it left alone', async () => {
    const result = await importEntries(target, JSON.parse(JSON.stringify(document)));

    expect(result.skipped).toEqual({ rankings: 2, comparisons: 1 });

    const { data, error } = await target.from('ranking_entries').select('media_item_id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const comparisons = await target.from('comparisons').select('id');
    expect(comparisons.data).toEqual([]);
  });

  it('counts a second import of the same file as updates, not creations', async () => {
    const result = await importEntries(target, JSON.parse(JSON.stringify(document)));
    expect(result).toMatchObject({ matched: 6, created: 0, updated: 6 });
  });

  it('restores a file written before decision 26, ownedPlatforms and all', async () => {
    // The same document as an export from before 2026-10-07 spelled it: every
    // entry with an owned list beside the played one.
    const old = JSON.parse(JSON.stringify(document)) as { entries: Record<string, unknown>[] };
    for (const entry of old.entries) entry['ownedPlatforms'] = ['Nintendo Switch'];

    const result = await importEntries(target, old);

    expect(result).toMatchObject({ matched: 6, created: 0, updated: 6, unmatched: 0 });
    const played = (await getEntry(target, games['played']!.mediaItemId))!;
    expect(played.playedPlatforms).toEqual(['PC (Microsoft Windows)']);
    expect(played).not.toHaveProperty('ownedPlatforms');
  });

  it('reports the games it could not find, and writes nothing for them', async () => {
    const doc = minimalDocument([
      entryFixture({ item: { igdbId: 999_999_999, title: 'Not In The Catalog', year: 2030 } }),
      entryFixture({ item: { igdbId: null, title: 'Homebrew', year: null } }),
      entryFixture({ item: { igdbId: games['untracked']!.igdbId, title: 'Real', year: 2020 } }),
    ]);

    const result = await importEntries(target, doc);

    expect(result).toMatchObject({ matched: 1, created: 1, updated: 0, unmatched: 2 });
    expect(result.unmatchedItems.map((item) => item.title).sort()).toEqual([
      'Homebrew',
      'Not In The Catalog',
    ]);
  });

  it('takes the last of two entries for the same game rather than failing the whole import', async () => {
    const igdbId = games['dropped']!.igdbId;
    const doc = minimalDocument([
      entryFixture({ item: { igdbId, title: 'Twice', year: 2020 }, status: 'backlog', notes: 'first' }),
      entryFixture({ item: { igdbId, title: 'Twice', year: 2020 }, status: 'played', notes: 'second' }),
    ]);

    const result = await importEntries(target, doc);

    expect(result.matched).toBe(1);
    const entry = (await getEntry(target, games['dropped']!.mediaItemId))!;
    expect(entry.status).toBe('played');
    expect(entry.notes).toBe('second');
  });

  it('validates before it writes: a bad document changes nothing', async () => {
    const before = (await getEntry(target, games['backlog']!.mediaItemId))!;

    const doc = minimalDocument([
      entryFixture({
        item: { igdbId: games['backlog']!.igdbId, title: 'Fine', year: 2020 },
        status: 'played',
      }),
      entryFixture({ status: 'not-a-status' }),
    ]);
    await expect(importEntries(target, doc)).rejects.toBeInstanceOf(ImportValidationError);

    expect(await getEntry(target, games['backlog']!.mediaItemId)).toEqual(before);
  });

  it('stamps a started date on an entry imported as playing with none of its own', async () => {
    const doc = minimalDocument([
      entryFixture({
        item: { igdbId: games['untracked']!.igdbId, title: 'Started', year: 2020 },
        status: 'playing',
        startedAt: null,
      }) as ExportEntry & Record<string, unknown>,
    ]);

    await importEntries(target, doc);

    const entry = (await getEntry(target, games['untracked']!.mediaItemId))!;
    expect(entry.status).toBe('playing');
    expect(entry.startedAt).not.toBeNull();
  });
});

/**
 * A small RFC 4180 reader, so the CSV assertions below are about fields a
 * spreadsheet would see rather than about the exact bytes. Writing the parser
 * here rather than pulling one in is the point: if the export only survives a
 * lenient parser, it is not a CSV.
 */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r' && text[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 2;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** The parsed rows as objects keyed by the header, which is what the tests read. */
function parseCsvRows(text: string): Record<string, string>[] {
  const [header, ...records] = parseCsv(text);
  return records.map((record) => Object.fromEntries(header!.map((name, i) => [name, record[i] ?? ''])));
}

describe.skipIf(!live)('the CSV export against a local stack', () => {
  let alice: Client;
  let bob: Client;
  let games: Record<string, SeededGame>;
  let csv: string;
  let rows: Record<string, string>[];

  // A note with a line break, a comma, and a pair of quotes in it: all three
  // things RFC 4180 has a rule about, in the one field a user types freely.
  const NOTES = 'Finished it.\nBest boss: "Hades", by far, twice.';

  beforeAll(async () => {
    alice = (await signUpUser('csv-source')).client;
    bob = (await signUpUser('csv-other')).client;

    games = await seedGames([
      // A real title with a comma in it, of which there are many.
      { key: 'comma', title: 'Sam & Max Save the World, Remastered' },
      { key: 'quoted', title: 'The "Definitive" Edition' },
      { key: 'plain' },
      { key: 'backlogged' },
      // A title a spreadsheet would run. IGDB has stranger ones.
      { key: 'formula', title: '=HYPERLINK("https://example.com","Free games")' },
      { key: 'bobOnly' },
      { key: 'film', medium: 'movie', title: 'A Film' },
    ]);

    const comma = games['comma']!.mediaItemId;
    await markFinished(alice, comma, { finishedAt: '2026-03-04' });
    await setNotes(alice, comma, NOTES);
    await logPlaytime(alice, comma, 1_500);
    await setPurchasedAt(alice, comma, '2025-11-30');
    await setPlayedPlatforms(alice, comma, ['Nintendo Switch', 'PC (Microsoft Windows)']);

    await setStatus(alice, games['quoted']!.mediaItemId, 'played');
    await setStatus(alice, games['plain']!.mediaItemId, 'playing');
    await setStatus(alice, games['backlogged']!.mediaItemId, 'backlog');
    await setStatus(alice, games['formula']!.mediaItemId, 'dropped');
    await setNotes(alice, games['formula']!.mediaItemId, '-not a formula, a note');

    // Two in loved, one in liked, and one game tracked but never ranked.
    await insertRankingEntry(alice, { mediaItemId: comma, medium: 'game', tier: 'loved', position: 0 });
    await insertRankingEntry(alice, {
      mediaItemId: games['quoted']!.mediaItemId,
      medium: 'game',
      tier: 'loved',
      position: 1,
    });
    await insertRankingEntry(alice, {
      mediaItemId: games['plain']!.mediaItemId,
      medium: 'game',
      tier: 'liked',
      position: 0,
    });

    await setStatus(bob, games['bobOnly']!.mediaItemId, 'backlog');

    // A film Alice has watched and ranked. It is a sixth entry of hers, and
    // none of the five records the tests below count.
    await setStatus(alice, games['film']!.mediaItemId, 'played');
    await insertRankingEntry(alice, {
      mediaItemId: games['film']!.mediaItemId,
      medium: 'movie',
      tier: 'liked',
      position: 0,
    });

    csv = await exportUserDataCsv(alice);
    rows = parseCsvRows(csv);
  });

  afterAll(async () => {
    await stopClients();
  });

  it('starts with the header row, in the documented order', () => {
    expect(csv.split('\r\n')[0]).toBe(
      'igdb_id,title,year,status,tier,global_rank,score,played_platforms,started_at,finished_at,' +
        'purchased_at,playtime_minutes,playtime_source,backlog_position,added_at,placed_at,notes',
    );
    expect(parseCsv(csv)[0]).toEqual([...EXPORT_CSV_COLUMNS]);
  });

  it('writes one record per entry, in the order the JSON export lists them', async () => {
    const document = await exportUserData(alice);

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => Number(row['igdb_id']))).toEqual(
      document.entries.map((entry) => entry.item.igdbId),
    );
  });

  it('separates records with CRLF and ends the file with one', () => {
    expect(csv.endsWith('\r\n')).toBe(true);
    // Six records: the header and five entries.
    expect(parseCsv(csv)).toHaveLength(6);
    // The note's own line break is a bare LF inside a quoted field, so it is
    // not a record separator and even a reader that only splits on CRLF sees
    // the same six.
    expect(csv.split('\r\n').filter((piece) => piece !== '')).toHaveLength(6);
  });

  it('quotes a title that contains a comma, and reads back as the title', () => {
    const row = rows.find((candidate) => candidate['title']!.startsWith('Sam & Max'))!;

    expect(row['title']).toBe('Sam & Max Save the World, Remastered');
    expect(csv).toContain('"Sam & Max Save the World, Remastered"');
  });

  it('quotes a field with a line break in it, and doubles the quotes inside', () => {
    const row = rows.find((candidate) => candidate['notes'] !== '')!;

    expect(row['notes']).toBe(NOTES);
    // On the wire: wrapped in quotes, with every inner quote written twice.
    expect(csv).toContain('"Finished it.\nBest boss: ""Hades"", by far, twice."');
  });

  it('quotes a title whose only problem is a pair of quotes', () => {
    const row = rows.find((candidate) => candidate['title']!.includes('Definitive'))!;

    expect(row['title']).toBe('The "Definitive" Edition');
    expect(csv).toContain('"The ""Definitive"" Edition"');
  });

  it('carries the ranking as tier, global rank, and score, counted across the tiers', () => {
    const byTitle = new Map(rows.map((row) => [row['title'], row]));

    expect(byTitle.get('Sam & Max Save the World, Remastered')).toMatchObject({
      tier: 'loved',
      global_rank: '1',
      score: '10',
    });
    expect(byTitle.get('The "Definitive" Edition')).toMatchObject({
      tier: 'loved',
      global_rank: '2',
      score: '8.5',
    });
    // First in liked, third overall: the count runs on through the tiers.
    expect(byTitle.get(games['plain']!.title)).toMatchObject({
      tier: 'liked',
      global_rank: '3',
      score: '7.5',
    });
  });

  it('leaves the ranking columns empty for a game that is not ranked, never zero', () => {
    const row = rows.find((candidate) => candidate['title'] === games['backlogged']!.title)!;

    expect(row['tier']).toBe('');
    expect(row['global_rank']).toBe('');
    expect(row['score']).toBe('');
    expect(row['placed_at']).toBe('');
    // And the other direction: a real zero is written as a zero. This game is
    // first in the backlog, which is position 0.
    expect(row['backlog_position']).toBe('0');
    expect(row['status']).toBe('backlog');
  });

  it('dates a ranked row by when it was placed', () => {
    const row = rows.find((candidate) => candidate['title']!.startsWith('Sam & Max'))!;

    expect(Date.parse(row['placed_at']!)).not.toBeNaN();
    expect(Date.parse(row['placed_at']!)).toBeLessThanOrEqual(Date.now());
  });

  it('carries every fact the user typed, with the played platforms in one field', () => {
    const row = rows.find((candidate) => candidate['title']!.startsWith('Sam & Max'))!;

    expect(row).toMatchObject({
      status: 'played',
      year: '2020',
      finished_at: '2026-03-04',
      purchased_at: '2025-11-30',
      playtime_minutes: '1500',
      playtime_source: 'manual',
      // Catalog order, which is how `setPlayedPlatforms` stores them.
      played_platforms: 'PC (Microsoft Windows)|Nintendo Switch',
      backlog_position: '',
    });
    // Decision 26: no owned column, on this row or in the header.
    expect(row).not.toHaveProperty('owned_platforms');
    expect(Date.parse(row['added_at']!)).not.toBeNaN();
    expect(Number(row['igdb_id'])).toBe(games['comma']!.igdbId);
  });

  it('leaves a field the user never filled in empty', () => {
    const row = rows.find((candidate) => candidate['title'] === games['backlogged']!.title)!;

    expect(row['notes']).toBe('');
    expect(row['finished_at']).toBe('');
    expect(row['purchased_at']).toBe('');
    expect(row['playtime_minutes']).toBe('');
    expect(row['playtime_source']).toBe('');
    expect(row['played_platforms']).toBe('');
    expect(row['started_at']).toBe('');
  });

  it('stamps started_at on the game that was set to playing', () => {
    const row = rows.find((candidate) => candidate['title'] === games['plain']!.title)!;

    expect(Date.parse(row['started_at']!)).not.toBeNaN();
  });

  it('disarms a field a spreadsheet would run as a formula', () => {
    const row = rows.find((candidate) => candidate['title']!.endsWith('Free games")'))!;

    // A leading apostrophe, which every spreadsheet reads as "text".
    expect(row['title']).toBe(`'=HYPERLINK("https://example.com","Free games")`);
    expect(row['notes']).toBe("'-not a formula, a note");
    // Quoted on the wire for its quotes and comma, the apostrophe inside.
    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"",""Free games"")"`);
    // And a value that does not start with a leader is untouched: the note
    // that begins with a letter still comes back byte for byte.
    expect(rows.some((candidate) => candidate['notes'] === NOTES)).toBe(true);
  });

  it('agrees with the JSON export on tier, global rank, and score, row for row', async () => {
    const document = await exportUserData(alice);
    const byIgdbId = new Map(document.rankings.map((ranking) => [ranking.item.igdbId, ranking]));

    expect(rows.filter((row) => row['tier'] !== '')).toHaveLength(document.rankings.length);
    for (const row of rows) {
      const ranking = byIgdbId.get(Number(row['igdb_id']));
      if (ranking === undefined) {
        expect(row['tier']).toBe('');
        continue;
      }
      // The document carries tier and position; global rank is derived from
      // them the same way the Ranking tab numbers its rows.
      const better = document.rankings.filter(
        (other) => TIERS.indexOf(other.tier) < TIERS.indexOf(ranking.tier),
      ).length;
      expect(row['tier']).toBe(ranking.tier);
      expect(row['score']).toBe(String(ranking.score));
      expect(row['global_rank']).toBe(String(better + ranking.position + 1));
    }
  });

  it('writes the games by default and the film only when it is asked for', async () => {
    expect(rows.map((row) => row['title'])).not.toContain('A Film');

    const film = parseCsvRows(await exportUserDataCsv(alice, { medium: 'movie' }));

    expect(film).toHaveLength(1);
    // Ranked first of one film, so first overall in a file that is only films:
    // the global rank counts through the tiers of this medium and no other.
    expect(film[0]).toMatchObject({
      title: 'A Film',
      status: 'played',
      tier: 'liked',
      global_rank: '1',
    });
    // `placed_at` comes from a second read of `ranking_entries`, which carries
    // the medium column; a film that borrowed the games' filter would have none.
    expect(Date.parse(film[0]!['placed_at']!)).not.toBeNaN();
  });

  it('gives each user their own file', async () => {
    const his = parseCsvRows(await exportUserDataCsv(bob));

    expect(his).toHaveLength(1);
    expect(his[0]!['title']).toBe(games['bobOnly']!.title);
    // Nothing of Alice's, including the ranking she built on the same catalog.
    expect(his[0]!['tier']).toBe('');
    expect(his.map((row) => row['title'])).not.toContain(games['plain']!.title);
  });
});
