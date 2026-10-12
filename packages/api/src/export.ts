/**
 * Take your data out, and put entries back in.
 *
 * "Import and export of your own data as JSON or CSV, so the ranking is never
 * trapped in the app" is a V0 feature, and it only counts if the file means
 * something away from this database. So nothing here is keyed by our uuids:
 * every item is named by its IGDB id, its title, and its year. A person can
 * read the file, a script can join it to IGDB, and an import can find the same
 * games in a catalog that has been rebuilt since.
 *
 * Two shapes go out and one comes back. `exportUserData` writes the JSON
 * document below, which carries everything including the comparison log, and
 * `importEntries` reads it. `exportUserDataCsv` writes one row per entry for
 * spreadsheets; it is lossy by nature -- a spreadsheet has no place for a log
 * of head-to-head answers -- and nothing reads it back. Import is JSON only.
 *
 * ## The document
 *
 *   {
 *     "format": "verso.export",
 *     "version": 1,
 *     "exportedAt": "2026-09-16T12:00:00.000Z",
 *     "medium": "game",
 *     "entries":     [ { "item": {...}, "status": ..., "notes": ..., ... } ],
 *     "rankings":    [ { "item": {...}, "tier": ..., "position": 0, "score": 9.2 } ],
 *     "comparisons": [ { "itemA": {...}, "itemB": {...}, "outcome": ..., ... } ]
 *   }
 *
 * One medium per document, because a ranking is per medium and a file that
 * mixed them would have to say so on every row.
 *
 * Files written before 2026-10-07 carry an `ownedPlatforms` list on every
 * entry. Ownership left the product that day (decision 26), so the export no
 * longer writes it and the import accepts it and ignores it: an old file still
 * restores, and nothing in it becomes a played-on answer it never was. The
 * version stays 1: the change only removes a key, and the builds that required
 * it on import never left development, so no released reader is stranded.
 *
 * ## Why import is entries only
 *
 * `importEntries` writes entries and nothing else, on purpose.
 *
 * A ranking is not data the user typed; it is the output of comparisons they
 * answered. Writing positions straight into `ranking_entries` would manufacture
 * an order that no answer in the log supports, and the next insertion would
 * binary-search against it as if it were earned. The comparison log is the
 * durable asset — the whole reason every head-to-head is stored — so rebuilding
 * a ranking from a file is a recompute, deliberately, and not something an
 * import silently does on the way past.
 *
 * Both sections are still exported, still read, and counted in the result as
 * skipped, so nobody has to guess whether they were quietly applied.
 */

import type { ComparisonOutcome, EntryStatus, Medium, Tier } from '@verso/core';
import { scoreForPosition, TIERS } from '@verso/core';
import type { Client } from './client';
import type { Database, Json } from './database.types';

type UserEntryInsert = Database['public']['Tables']['user_entries']['Insert'];

export const EXPORT_FORMAT = 'verso.export';
export const EXPORT_VERSION = 1;

/**
 * How the document names one game. The IGDB id is what an import matches on;
 * the title and year are for the human reading the file, and for saying which
 * games could not be matched.
 */
export interface ExportItemRef {
  /** Null for a catalog row with no IGDB id, which an import cannot match. */
  igdbId: number | null;
  title: string;
  year: number | null;
}

export interface ExportEntry {
  item: ExportItemRef;
  status: EntryStatus;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  purchasedAt: string | null;
  notes: string | null;
  playtimeMinutes: number | null;
  playtimeSource: string | null;
  /**
   * Where the user played it, as the catalog spells the platforms. Empty means
   * not recorded. Optional on the way in: a file written before the field
   * existed imports as empty, which is what that account held at the time.
   */
  playedPlatforms: string[];
  /**
   * The user's own place for this game in their backlog, 0 first. Null unless
   * the status is `backlog`. Carried because the order of the backlog is
   * something the user arranged by hand, not a sort the app can recompute.
   */
  backlogPosition: number | null;
}

export interface ExportRanking {
  item: ExportItemRef;
  tier: Tier;
  /** 0 is the best item in the tier. */
  position: number;
  /** The derived 0-10 score, recomputed at export time exactly as the app shows it. */
  score: number;
}

export interface ExportComparison {
  itemA: ExportItemRef;
  itemB: ExportItemRef;
  outcome: ComparisonOutcome;
  /** Tier, tier size, and why that opponent was shown. Written by `finish_insertion`. */
  context: Json;
  createdAt: string;
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  medium: Medium;
  entries: ExportEntry[];
  rankings: ExportRanking[];
  comparisons: ExportComparison[];
}

export interface ExportOptions {
  /** Which medium to export. V0 has one. */
  medium?: Medium;
}

/** Thrown before anything is read or written, when the document is not one we can import. */
export class ImportValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    const shown = problems.slice(0, 20);
    const more = problems.length - shown.length;
    super(
      `this is not a Verso export document:\n  ${shown.join('\n  ')}` +
        (more > 0 ? `\n  ... and ${more} more` : ''),
    );
    this.name = 'ImportValidationError';
    this.problems = problems;
  }
}

export interface ImportResult {
  /** Document entries whose IGDB id was found in the catalog. `created + updated`. */
  matched: number;
  /** Of those, the ones that did not exist and were inserted. */
  created: number;
  /** Of those, the ones that already existed and were overwritten. */
  updated: number;
  /** Document entries whose IGDB id is not in the catalog, or which have none. Nothing was written for these. */
  unmatched: number;
  /** Which ones those were, so a screen can name them rather than report a number. */
  unmatchedItems: ExportItemRef[];
  /** Read from the document and deliberately not written. See the note at the top of this file. */
  skipped: { rankings: number; comparisons: number };
}

/** Pull the IGDB id out of a `media_items.external_ids` blob. */
function igdbIdOf(externalIds: Json): number | null {
  if (typeof externalIds !== 'object' || externalIds === null || Array.isArray(externalIds)) return null;
  const raw = externalIds['igdb'];
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return null;
}

/**
 * Everything the caller has for one medium: entries, the ranked list, and the
 * comparison log behind it.
 *
 * Rankings come from `tier_list`, one call per tier, so the file carries the
 * order the app itself would show rather than a re-derivation of it, and the
 * score is `scoreForPosition` over that same list. Every id is resolved to an
 * `ExportItemRef` first; a ranked game the user no longer tracks still gets a
 * title.
 */
export async function exportUserData(
  client: Client,
  options: ExportOptions = {},
): Promise<ExportDocument> {
  const medium = options.medium ?? 'game';

  const [entryRows, tiers, comparisonRows] = await Promise.all([
    selectEntries(client, medium),
    Promise.all(TIERS.map((tier) => selectTier(client, medium, tier))),
    selectComparisons(client, medium),
  ]);

  // The refs the entries need come back with them; rankings and comparisons
  // carry only ids, so resolve those in one further query.
  const refs = new Map<string, ExportItemRef>();
  for (const row of entryRows) {
    refs.set(row.media_items.id, {
      igdbId: igdbIdOf(row.media_items.external_ids),
      title: row.media_items.title,
      year: row.media_items.year,
    });
  }

  const missing = new Set<string>();
  for (const tier of tiers) {
    for (const row of tier.rows) if (!refs.has(row.media_item_id)) missing.add(row.media_item_id);
  }
  for (const row of comparisonRows) {
    if (!refs.has(row.item_a)) missing.add(row.item_a);
    if (!refs.has(row.item_b)) missing.add(row.item_b);
  }
  for (const [id, ref] of await selectRefs(client, [...missing])) refs.set(id, ref);

  /** A ranked or compared item whose catalog row has vanished still needs a name. */
  const ref = (id: string): ExportItemRef => refs.get(id) ?? { igdbId: null, title: '(unknown)', year: null };

  const rankings: ExportRanking[] = [];
  for (const { tier, rows } of tiers) {
    for (const row of rows) {
      rankings.push({
        item: ref(row.media_item_id),
        tier,
        position: row.position,
        score: scoreForPosition(tier, row.position, rows.length),
      });
    }
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    medium,
    entries: entryRows.map((row) => ({
      item: ref(row.media_items.id),
      status: row.status,
      addedAt: row.added_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      purchasedAt: row.purchased_at,
      notes: row.notes,
      playtimeMinutes: row.playtime_minutes,
      playtimeSource: row.playtime_source,
      playedPlatforms: row.played_platforms,
      backlogPosition: row.backlog_position,
    })),
    rankings,
    comparisons: comparisonRows.map((row) => ({
      itemA: ref(row.item_a),
      itemB: ref(row.item_b),
      outcome: row.outcome,
      context: row.context,
      createdAt: row.created_at,
    })),
  };
}

// CSV ------------------------------------------------------------------------

/**
 * The columns of the CSV export, in order. The header row is these names.
 *
 * Exported so a test, or anything that reads the file back, can name a column
 * rather than count commas.
 */
export const EXPORT_CSV_COLUMNS = [
  'igdb_id',
  'title',
  'year',
  'status',
  'tier',
  'global_rank',
  'score',
  'played_platforms',
  'started_at',
  'finished_at',
  'purchased_at',
  'playtime_minutes',
  'playtime_source',
  'backlog_position',
  'added_at',
  'placed_at',
  'notes',
] as const;

/** RFC 4180 separates records with CRLF, which is also what a spreadsheet expects. */
const CSV_RECORD_SEPARATOR = '\r\n';

/**
 * The played platforms are one column, so they need a separator that cannot be
 * confused with the one between columns. A pipe, because no IGDB platform name
 * contains one and a reader can split on it without parsing anything.
 */
const PLATFORM_SEPARATOR = '|';

/**
 * The characters a spreadsheet reads as the start of a formula.
 *
 * A cell beginning with `=`, `+`, `-`, or `@` (and, in some versions, a tab or
 * carriage return) is evaluated on open by Excel, Google Sheets, and
 * LibreOffice, so a game title or a note that happened to start that way would
 * run rather than display -- the CSV injection class OWASP documents. Nothing
 * in this file can know whether a value is malicious; it only knows the value
 * would execute.
 */
const FORMULA_LEADERS = /^[=+\-@\t\r]/;

/**
 * One field, quoted if it has to be.
 *
 * RFC 4180: a field containing a comma, a double quote, or a line break is
 * wrapped in double quotes, and each double quote inside it is written twice.
 * Null is an empty field, which is how the format says "nothing here" --
 * distinct from `0` and from `""`.
 *
 * One deliberate departure from writing every value as it stands: a field that
 * starts with a formula leader is prefixed with a single quote, the mitigation
 * OWASP recommends, which every spreadsheet reads as "this is text". The
 * apostrophe is visible in some readers, and that is the trade: one extra
 * character on the rare field that starts with `=` or `-`, against a live
 * formula in the user's spreadsheet. No numeric column here can start with
 * those characters (positions, minutes, and scores are never negative), so in
 * practice the guard touches titles and notes only.
 */
function csvField(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (FORMULA_LEADERS.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRecord(values: readonly (string | number | null)[]): string {
  return values.map(csvField).join(',');
}

/** What the ranked list contributes to a row, for the games that have one. */
interface CsvRanking {
  tier: Tier;
  globalRank: number;
  score: number;
  placedAt: string | null;
}

/**
 * The same data as `exportUserData`, flattened into one row per entry, for
 * everything that reads a spreadsheet rather than a JSON document.
 *
 * "Import and export of your own data as JSON or CSV" is the V0 feature
 * (ROADMAP, V0). The JSON document is the one that round trips: it carries the
 * comparison log, which is the durable asset, and `importEntries` reads it
 * back. This is the other half, and it is deliberately lossy in a way the
 * header makes obvious -- a spreadsheet has no place for a log of head-to-head
 * answers. Import stays JSON only.
 *
 * ## What a row is
 *
 * One row per **user entry**, in the order `exportUserData` lists them, which
 * is by the date they were added. A game that is ranked but not tracked has no
 * entry and so has no row; a game that is tracked but not ranked has a row with
 * the four ranking columns empty. Empty, never zero: rank 1 and score 0 are
 * both real values, so writing a zero for "not ranked" would be a lie a
 * spreadsheet cannot see through.
 *
 * `tier`, `global_rank`, and `score` are the same numbers the JSON export
 * writes and the app shows, because they come from the same reads: `tier_list`
 * per tier, `scoreForPosition` over that list, and global rank counted across
 * the tiers in order (`docs/design/specs/README.md`, "Global rank"). `score` is
 * written as computed, not rounded for display.
 *
 * The string is UTF-8 with no byte order mark. Software that needs one for
 * Excel can prepend U+FEFF to the file it writes; putting it in the string
 * would break every parser that does not expect it.
 *
 * Fields that would be read as a formula are prefixed with a single quote;
 * see `csvField`. That is the one place a value is not written exactly as
 * stored.
 */
export async function exportUserDataCsv(
  client: Client,
  options: ExportOptions = {},
): Promise<string> {
  const medium = options.medium ?? 'game';

  const [entryRows, tiers, placedAt] = await Promise.all([
    selectEntries(client, medium),
    Promise.all(TIERS.map((tier) => selectTier(client, medium, tier))),
    selectPlacedAt(client, medium),
  ]);

  // Walked best tier first, so the running count is the number of games in
  // better tiers: global rank = that + position + 1.
  const rankings = new Map<string, CsvRanking>();
  let inBetterTiers = 0;
  for (const { tier, rows } of tiers) {
    for (const row of rows) {
      rankings.set(row.media_item_id, {
        tier,
        globalRank: inBetterTiers + row.position + 1,
        score: scoreForPosition(tier, row.position, rows.length),
        placedAt: placedAt.get(row.media_item_id) ?? null,
      });
    }
    inBetterTiers += rows.length;
  }

  const records = [csvRecord(EXPORT_CSV_COLUMNS)];
  for (const row of entryRows) {
    const item = row.media_items;
    const ranking = rankings.get(item.id) ?? null;
    records.push(
      csvRecord([
        igdbIdOf(item.external_ids),
        item.title,
        item.year,
        row.status,
        ranking?.tier ?? null,
        ranking?.globalRank ?? null,
        ranking?.score ?? null,
        row.played_platforms.join(PLATFORM_SEPARATOR),
        row.started_at,
        row.finished_at,
        row.purchased_at,
        row.playtime_minutes,
        row.playtime_source,
        row.backlog_position,
        row.added_at,
        ranking?.placedAt ?? null,
        row.notes,
      ]),
    );
  }

  return records.join(CSV_RECORD_SEPARATOR) + CSV_RECORD_SEPARATOR;
}

/**
 * When the caller placed each of their ranked games.
 *
 * `tier_list` gives the order and the catalog columns but not this one, so it
 * is one further read of `ranking_entries` -- scoped to the caller by Row Level
 * Security, like everything else in this file.
 */
async function selectPlacedAt(client: Client, medium: Medium): Promise<Map<string, string>> {
  const { data, error } = await client
    .from('ranking_entries')
    .select('media_item_id, placed_at')
    .eq('medium', medium);
  if (error) throw error;
  return new Map(data.map((row) => [row.media_item_id, row.placed_at]));
}

interface EntryExportRow {
  status: EntryStatus;
  added_at: string;
  started_at: string | null;
  finished_at: string | null;
  purchased_at: string | null;
  notes: string | null;
  playtime_minutes: number | null;
  playtime_source: string | null;
  played_platforms: string[];
  backlog_position: number | null;
  media_items: { id: string; title: string; year: number | null; external_ids: Json };
}

async function selectEntries(client: Client, medium: Medium): Promise<EntryExportRow[]> {
  const { data, error } = await client
    .from('user_entries')
    .select(
      `status, added_at, started_at, finished_at, purchased_at, notes,
       playtime_minutes, playtime_source, played_platforms, backlog_position,
       media_items!inner ( id, title, year, external_ids, medium )`,
    )
    .eq('media_items.medium', medium)
    // By the date they were added, which every entry has, whatever its status.
    // The backlog's own order rides on each row instead.
    .order('added_at', { ascending: true });
  if (error) throw error;
  return data as unknown as EntryExportRow[];
}

async function selectTier(
  client: Client,
  medium: Medium,
  tier: Tier,
): Promise<{ tier: Tier; rows: { media_item_id: string; position: number }[] }> {
  const { data, error } = await client.rpc('tier_list', { p_medium: medium, p_tier: tier });
  if (error) throw error;
  return { tier, rows: data ?? [] };
}

async function selectComparisons(client: Client, medium: Medium) {
  const { data, error } = await client
    .from('comparisons')
    .select('item_a, item_b, outcome, context, created_at')
    .eq('medium', medium)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

/** How many ids to put in one `in.()` filter, so the URL stays a sane length. */
const LOOKUP_CHUNK = 200;

function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function selectRefs(client: Client, ids: string[]): Promise<Map<string, ExportItemRef>> {
  const refs = new Map<string, ExportItemRef>();
  for (const batch of chunk(ids, LOOKUP_CHUNK)) {
    const { data, error } = await client
      .from('media_items')
      .select('id, title, year, external_ids')
      .in('id', batch);
    if (error) throw error;
    for (const row of data) {
      refs.set(row.id, { igdbId: igdbIdOf(row.external_ids), title: row.title, year: row.year });
    }
  }
  return refs;
}

// Validation ------------------------------------------------------------------

const STATUSES: readonly EntryStatus[] = ['backlog', 'playing', 'played', 'dropped'];
const MEDIA: readonly Medium[] = ['game', 'movie', 'tv'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check a parsed JSON value all the way through and hand back a document that
 * the importer can trust, or throw with every problem it found rather than the
 * first one. Nothing touches the database until this has passed.
 *
 * `rankings` and `comparisons` may be absent and default to empty, so a
 * hand-written file of entries is a legal import. Everything else is required:
 * a document with no `medium` is one whose rows could belong to anything.
 */
export function validateExportDocument(value: unknown): ExportDocument {
  const problems: string[] = [];

  if (!isObject(value)) throw new ImportValidationError(['the document is not a JSON object']);

  if (value['format'] !== EXPORT_FORMAT) {
    problems.push(`format must be ${JSON.stringify(EXPORT_FORMAT)}, got ${JSON.stringify(value['format'])}`);
  }
  if (value['version'] !== EXPORT_VERSION) {
    problems.push(
      typeof value['version'] === 'number' && value['version'] > EXPORT_VERSION
        ? `version ${value['version']} was written by a newer version of the app than this one, which reads ${EXPORT_VERSION}`
        : `version must be ${EXPORT_VERSION}, got ${JSON.stringify(value['version'])}`,
    );
  }
  if (typeof value['exportedAt'] !== 'string') problems.push('exportedAt must be a timestamp string');
  if (!MEDIA.includes(value['medium'] as Medium)) {
    problems.push(`medium must be one of ${MEDIA.join(', ')}, got ${JSON.stringify(value['medium'])}`);
  }

  const rawEntries = value['entries'];
  if (!Array.isArray(rawEntries)) {
    problems.push('entries must be an array');
    throw new ImportValidationError(problems);
  }

  const entries: ExportEntry[] = [];
  rawEntries.forEach((raw, index) => {
    const at = `entries[${index}]`;
    if (!isObject(raw)) {
      problems.push(`${at} is not an object`);
      return;
    }

    const item = validateItemRef(raw['item'], `${at}.item`, problems);
    if (!STATUSES.includes(raw['status'] as EntryStatus)) {
      problems.push(`${at}.status must be one of ${STATUSES.join(', ')}, got ${JSON.stringify(raw['status'])}`);
    }
    if (typeof raw['addedAt'] !== 'string' || Number.isNaN(Date.parse(raw['addedAt']))) {
      problems.push(`${at}.addedAt must be a timestamp string`);
    }
    checkTimestamp(raw['startedAt'], `${at}.startedAt`, problems);
    checkDate(raw['finishedAt'], `${at}.finishedAt`, problems);
    checkDate(raw['purchasedAt'], `${at}.purchasedAt`, problems);
    checkNullableString(raw['notes'], `${at}.notes`, problems);
    checkNullableString(raw['playtimeSource'], `${at}.playtimeSource`, problems);

    const minutes = raw['playtimeMinutes'];
    if (minutes !== null && (!Number.isInteger(minutes) || (minutes as number) < 0)) {
      problems.push(`${at}.playtimeMinutes must be a whole number of minutes, 0 or more, or null`);
    }
    // `ownedPlatforms` is not read at all, whatever it holds: files written
    // before 2026-10-07 carry it, and ownership left the product that day
    // (decision 26). Accepting it is what lets those files still restore.
    //
    // Optional: version 1 files written before the played-on question existed
    // have no such key, and absent means empty.
    const played = raw['playedPlatforms'] ?? [];
    if (!Array.isArray(played) || played.some((name) => typeof name !== 'string')) {
      problems.push(`${at}.playedPlatforms must be an array of platform names when present`);
    }
    // Optional: a file written by hand, or by version 1 before the backlog got
    // an order of its own, simply has no place for this game in the queue.
    const position = raw['backlogPosition'];
    if (position !== null && position !== undefined && (!Number.isInteger(position) || (position as number) < 0)) {
      problems.push(`${at}.backlogPosition must be a whole number, 0 or more, or null`);
    }

    if (problems.length === 0) {
      entries.push({
        item: item!,
        status: raw['status'] as EntryStatus,
        addedAt: raw['addedAt'] as string,
        startedAt: (raw['startedAt'] as string | null) ?? null,
        finishedAt: (raw['finishedAt'] as string | null) ?? null,
        purchasedAt: (raw['purchasedAt'] as string | null) ?? null,
        notes: (raw['notes'] as string | null) ?? null,
        playtimeMinutes: (minutes as number | null) ?? null,
        playtimeSource: (raw['playtimeSource'] as string | null) ?? null,
        playedPlatforms: played as string[],
        backlogPosition: (position as number | null) ?? null,
      });
    }
  });

  const rankings = value['rankings'] ?? [];
  const comparisons = value['comparisons'] ?? [];
  if (!Array.isArray(rankings)) problems.push('rankings must be an array when present');
  if (!Array.isArray(comparisons)) problems.push('comparisons must be an array when present');

  if (problems.length > 0) throw new ImportValidationError(problems);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: value['exportedAt'] as string,
    medium: value['medium'] as Medium,
    entries,
    // Read so they can be counted and reported, never written. See the top of this file.
    rankings: rankings as ExportRanking[],
    comparisons: comparisons as ExportComparison[],
  };
}

function validateItemRef(value: unknown, at: string, problems: string[]): ExportItemRef | null {
  if (!isObject(value)) {
    problems.push(`${at} must be an object with igdbId, title, and year`);
    return null;
  }
  const igdbId = value['igdbId'];
  if (igdbId !== null && !Number.isInteger(igdbId)) {
    problems.push(`${at}.igdbId must be a whole number or null`);
  }
  if (typeof value['title'] !== 'string' || value['title'].length === 0) {
    problems.push(`${at}.title must be a non-empty string`);
  }
  const year = value['year'];
  if (year !== null && !Number.isInteger(year)) problems.push(`${at}.year must be a whole number or null`);

  return {
    igdbId: (igdbId as number | null) ?? null,
    title: value['title'] as string,
    year: (year as number | null) ?? null,
  };
}

function checkNullableString(value: unknown, at: string, problems: string[]): void {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    problems.push(`${at} must be a string or null`);
  }
}

function checkDate(value: unknown, at: string, problems: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    problems.push(`${at} must be a calendar date as YYYY-MM-DD, or null`);
  }
}

function checkTimestamp(value: unknown, at: string, problems: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    problems.push(`${at} must be a timestamp string, or null`);
  }
}

// Import ----------------------------------------------------------------------

/** How many rows to upsert in one statement. */
const WRITE_CHUNK = 500;

/**
 * Put entries from a document back, matching each one to the catalog by IGDB id
 * through `media_items.external_ids`, which the `media_items_igdb_uniq` index
 * covers. An id the catalog does not have is reported, not invented: this
 * package never writes to the catalog, which belongs to the mirror.
 *
 * The document is validated in full before the first query, so a malformed file
 * cannot leave half an import behind.
 *
 * Existing entries are overwritten, including `added_at`, because this is a
 * restore and the dates are part of what is being restored. Two consequences
 * worth knowing: an entry imported as `playing` with no started date gets one
 * stamped by the trigger, exactly as if it had just been started; and
 * `playedPlatforms` is written as the document spells it, without checking it
 * against the catalog, because a round trip that quietly dropped a platform
 * would not be a round trip. `setPlayedPlatforms` is where unknown names are
 * refused. A document with no `playedPlatforms` on an entry writes it as empty,
 * overwriting what the account held, like every other field of a restored
 * entry. An `ownedPlatforms` key in an older document is ignored (see the top
 * of this file).
 *
 * The backlog keeps its order but not its exact numbering. Imported backlog
 * entries are numbered from one past wherever the account's backlog already
 * reaches, in the document's own order. Into an empty account that reproduces
 * the original positions exactly; into an account that already has a backlog it
 * appends, rather than colliding with `user_entries_backlog_position_uniq`.
 *
 * The positions are written explicitly, which the trigger leaves alone: the
 * door its author left open for exactly this. Letting the trigger append
 * instead would number the rows in the order they appear in the write, and that
 * is the file's order, which is by date added. The queue the user dragged into
 * shape rides on `backlogPosition`, not on the order of the array.
 *
 * Rankings and comparisons in the document are counted and skipped.
 */
export async function importEntries(client: Client, document: unknown): Promise<ImportResult> {
  const doc = validateExportDocument(document);

  const { data: session, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = session.session?.user.id;
  if (!userId) throw new Error('importEntries needs a signed-in user');

  const skipped = { rankings: doc.rankings.length, comparisons: doc.comparisons.length };
  const unmatchedItems: ExportItemRef[] = [];

  // Two entries for the same game would make one `on conflict` statement try to
  // touch the same row twice, which Postgres refuses. Last one in the file wins,
  // which is also what a human editing a file by hand would expect.
  const byIgdbId = new Map<number, ExportEntry>();
  for (const entry of doc.entries) {
    if (entry.item.igdbId === null) unmatchedItems.push(entry.item);
    else byIgdbId.set(entry.item.igdbId, entry);
  }

  const idByIgdbId = await lookupCatalog(client, doc.medium, [...byIgdbId.keys()]);

  const matchedEntries: { mediaItemId: string; entry: ExportEntry }[] = [];
  for (const [igdbId, entry] of byIgdbId) {
    const mediaItemId = idByIgdbId.get(igdbId);
    if (mediaItemId === undefined) unmatchedItems.push(entry.item);
    else matchedEntries.push({ mediaItemId, entry });
  }

  // The queue the user arranged, in its own order, renumbered to sit after
  // whatever this account's backlog already holds.
  const nextPosition = new Map<string, number>();
  let slot = (await maxBacklogPosition(client)) + 1;
  for (const { mediaItemId, entry } of [...matchedEntries].sort(byBacklogPosition)) {
    if (entry.status === 'backlog') nextPosition.set(mediaItemId, slot++);
  }

  const rows: UserEntryInsert[] = matchedEntries.map(({ mediaItemId, entry }) => ({
    user_id: userId,
    media_item_id: mediaItemId,
    status: entry.status,
    added_at: entry.addedAt,
    started_at: entry.startedAt,
    finished_at: entry.finishedAt,
    purchased_at: entry.purchasedAt,
    notes: entry.notes,
    playtime_minutes: entry.playtimeMinutes,
    playtime_source: entry.playtimeSource,
    played_platforms: entry.playedPlatforms,
    backlog_position: nextPosition.get(mediaItemId) ?? null,
  }));

  const existing = await selectExisting(client, rows.map((row) => row.media_item_id));

  for (const batch of chunk(rows, WRITE_CHUNK)) {
    const { error } = await client
      .from('user_entries')
      .upsert(batch, { onConflict: 'user_id,media_item_id' });
    if (error) throw error;
  }

  const updated = rows.filter((row) => existing.has(row.media_item_id)).length;
  return {
    matched: rows.length,
    created: rows.length - updated,
    updated,
    unmatched: unmatchedItems.length,
    unmatchedItems,
    skipped,
  };
}

async function lookupCatalog(
  client: Client,
  medium: Medium,
  igdbIds: number[],
): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  for (const batch of chunk(igdbIds, LOOKUP_CHUNK)) {
    const { data, error } = await client
      .from('media_items')
      .select('id, external_ids')
      .eq('medium', medium)
      .in(
        'external_ids->>igdb',
        batch.map((id) => String(id)),
      );
    if (error) throw error;
    for (const row of data) {
      const igdbId = igdbIdOf(row.external_ids);
      if (igdbId !== null) found.set(igdbId, row.id);
    }
  }
  return found;
}

/**
 * Document order for the backlog: by the position the user dragged it to, with
 * anything that has no position last, in the order the file lists it.
 */
function byBacklogPosition(
  a: { entry: ExportEntry },
  b: { entry: ExportEntry },
): number {
  return (a.entry.backlogPosition ?? Number.MAX_SAFE_INTEGER) -
    (b.entry.backlogPosition ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Where the caller's backlog currently ends, or -1 when they have no backlog.
 *
 * The one read in this file with no medium filter, deliberately. Positions are
 * unique per user across every medium -- `user_entries_backlog_position_uniq`
 * is `(user_id, backlog_position)` -- so a per-medium maximum would hand an
 * imported entry a position another medium's entry already holds, and the
 * insert would come back 23505. The document is one medium, but the column it
 * appends to is not.
 */
async function maxBacklogPosition(client: Client): Promise<number> {
  const { data, error } = await client
    .from('user_entries')
    .select('backlog_position')
    .not('backlog_position', 'is', null)
    .order('backlog_position', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.backlog_position ?? -1;
}

async function selectExisting(client: Client, mediaItemIds: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const batch of chunk(mediaItemIds, LOOKUP_CHUNK)) {
    const { data, error } = await client
      .from('user_entries')
      .select('media_item_id')
      .in('media_item_id', batch);
    if (error) throw error;
    for (const row of data) existing.add(row.media_item_id);
  }
  return existing;
}
