/**
 * Everything Home decides before it draws anything: which fact goes on which
 * line, how a release date becomes a two-line date column, and which of the
 * screen's states the three lists add up to.
 *
 * It is a separate file with no React in it because these are the parts that
 * are wrong in ways nobody catches by looking at a screen. A subtitle chain
 * only shows its third fallback for a game with no hours and no started date,
 * which is exactly the game that is not in the test account. So the chains live
 * here and are tested in `apps/mobile/test/home-rules.test.ts` against rows the
 * database would have to be contorted to produce.
 *
 * Imports are relative rather than through `@/`: the unit tests run in Vitest's
 * node environment, which resolves this file straight off disk with no bundler
 * alias, and `apps/mobile/vitest.config.ts` belongs to the shell.
 */

import type { EntryRow } from '@verso/api';

import { personalDate, platformShortName, platforms, playtime, timeToBeat } from '../../lib/format';

/**
 * The separator every subtitle in the specs is written with.
 *
 * `joinParts` in `@/ui/text` does the same job, and this is not it: that module
 * imports `react-native`, which cannot be loaded in the node environment these
 * rules are tested in. Four lines of duplication buys the tests.
 */
function join(parts: readonly (string | null)[]): string | null {
  const present = parts.filter((part): part is string => Boolean(part && part.trim()));
  return present.length === 0 ? null : present.join(' · ');
}

/**
 * The first name in a list that is actually a name, or null for an empty list,
 * in its short form — these all end up on a subtitle line, and an Up next card
 * has 120 points to say it in.
 */
function first(list: readonly string[] | null | undefined): string | null {
  for (const name of list ?? []) {
    const trimmed = platformShortName(name);
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * The Playing hero's and the small cards' second line (home.md, Data).
 *
 * The chain, in the spec's own order:
 *
 *   {played-on platforms joined by ", "} · {hours played}
 *   without hours:              {platforms} · Started {date}
 *   without a started date:     the platforms alone
 *   with no played-on recorded: the first catalog platform
 *
 * The last line replaces the platform half of the other three rather than being
 * a fourth case: a game with nothing recorded but fourteen hours played still
 * says where it runs and how long you have played it. And every part can be
 * missing at once — a game with nothing recorded, no catalog platforms, no
 * hours and no started date returns null, and rule 9 says the line does not
 * render rather than rendering blank.
 */
export function playingSubtitle(row: EntryRow, now: Date = new Date()): string | null {
  // Three, then "+2", as README.md's platform rule has it; Home joins with ", ".
  const played = platforms(row.entry.playedPlatforms, ', ');
  const where = played ?? first(row.platforms);

  const hours = playtime(row.entry.playtimeMinutes);
  if (hours) return join([where, hours]);

  const started = personalDate(row.entry.startedAt, now);
  if (started) return join([where, `Started ${started}`]);

  return where;
}

/**
 * An Up next card's second line: `~30 h` from time to beat; else the platform
 * it was played on; else the year.
 *
 * One fact, not a joined pair: the card's text column is 120pt wide and the
 * line has to survive on one line beside a two-line title. The played-on
 * platform is the first one rather than all of them for the same reason — "PC,
 * PS5, Switch +2" in 120 points is a truncated string, not a fact.
 */
export function upNextSubtitle(row: EntryRow): string | null {
  return (
    timeToBeat(row.timeToBeat.normallySeconds) ??
    first(row.entry.playedPlatforms) ??
    (row.year === null ? null : String(row.year))
  );
}

/**
 * A Coming up row's second line: the first catalog platform.
 *
 * A game that is not out has been played nowhere, so the entry has no
 * platform of its own to put first; where it is coming out is the thing worth
 * knowing next to a date. No year fallback here: the row's whole left side is
 * the date.
 */
export function comingUpSubtitle(row: EntryRow): string | null {
  return first(row.platforms);
}

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/**
 * The two lines of a Coming up date column. A null month leaves the year alone.
 *
 * Exactly one of `day` and `year` is set, because the second line is one or the
 * other and the two are drawn at different sizes: the day as the column's large
 * figure, the year smaller, so "2027" fits the same fixed-width column as "19"
 * and every cover in the block sits at the same x (phone-feedback entry 13).
 */
export interface DateColumn {
  /** `SEP`, or null when the catalog's date is not precise enough to name a month. */
  month: string | null;
  /** The day of the month, when the date is close enough to trust the day. */
  day: string | null;
  /** The year, when that is all the second line is worth. */
  year: string | null;
}

/**
 * A catalog release date as the month over the day.
 *
 * The frame draws a month and a day for every row, and for the usual Coming up
 * row — something out in the next few months — that is what this returns. It
 * cannot be what it returns for every row, because the mirror stores one `date`
 * column and IGDB's own precision is not stored beside it: a game IGDB knows
 * only as "2028" is stored as the first of some month in 2028, and printing
 * "JAN 1" would be inventing a release day (rule 9, never fake a number).
 *
 * So the precision follows `releaseDate` in `src/lib/format.ts`, which already
 * decided where the catalog stops being trustworthy: full day in the current
 * year, month and year for next year, the year alone beyond that.
 *
 * A next-year date reads month over year even when the catalog's day is real:
 * a game announced for 2027-01-28 shows "JAN" over "2027", not "JAN 28". With
 * no precision stored, a real 28 January and an IGDB date that only means
 * "January 2027" or "Q1 2027" arrive as the same kind of row, and the app has
 * no way to tell which day is invented. Showing the day there waits on the
 * catalog storing IGDB's date precision beside the date.
 *
 * The column keeps its shape in every case — two lines, or one when there is
 * no month worth naming.
 */
export function comingUpDate(value: string | null | undefined, now: Date = new Date()): DateColumn | null {
  const date = parseLocalDate(value);
  if (!date) return null;

  const month = MONTHS[date.getMonth()]!;
  const year = String(date.getFullYear());
  const years = date.getFullYear() - now.getFullYear();
  if (years <= 0) return { month, day: String(date.getDate()), year: null };
  if (years === 1) return { month, day: null, year };
  return { month: null, day: null, year };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A stored date as a local `Date`.
 *
 * The same care `src/lib/format.ts` takes, for the same reason:
 * `media_items.release_date` arrives as `2026-09-24` and `new Date()` reads a
 * bare date string as UTC midnight, which west of Greenwich is the evening
 * before — so a game would announce itself a day early in its own date column.
 * That module's parser is private, and this file cannot import a react-native
 * module anyway (see the head of the file).
 */
function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Which Home this is.
 *
 * `first-run` is the whole screen being empty: nothing playing, nothing in the
 * backlog, nothing on the way. It is a different screen rather than three empty
 * blocks stacked up, and home.md gives it two drawn variants — B, the one built
 * until Rafa picks, is the ordinary blocks with their empty cards, minus the
 * Playing card's button.
 *
 * Anything else is `blocks`: the ordinary screen, where each block handles its
 * own emptiness.
 */
export function homeState(counts: {
  playing: number;
  upNext: number;
  comingUp: number;
}): 'first-run' | 'blocks' {
  return counts.playing === 0 && counts.upNext === 0 && counts.comingUp === 0
    ? 'first-run'
    : 'blocks';
}

/** Where a button on the empty Playing card goes. */
export type PlayingEmptyAction = 'pick-from-backlog' | 'search-new';

/** The empty Playing card: its sentence, and none, one or two buttons. */
export interface PlayingEmptyCard {
  body: string;
  /** The green button, or null for the first-run card, which has none. */
  primary: { action: PlayingEmptyAction; label: string } | null;
  /** The quiet button under it, or null. */
  secondary: { action: PlayingEmptyAction; label: string } | null;
}

const PICK_FROM_BACKLOG = { action: 'pick-from-backlog', label: 'Pick from backlog' } as const;
const SEARCH_NEW = { action: 'search-new', label: 'Search a new game' } as const;

/**
 * What the Playing block says when nothing is playing (home.md, Playing empty,
 * revised 2026-09-23 from phone-feedback entry 1).
 *
 * The card depends on whether there is a backlog to pick from:
 *
 *   first run (all three blocks empty):  first run B, unchanged, no button
 *   a backlog:     "Start a game from your backlog."  Pick from backlog, then Search a new game
 *   no backlog:    "Search for the game you're playing."  Search a new game only
 *
 * `backlog` is the length of the list Home already reads for Up next, not a
 * new query: that list is the released backlog, which is also exactly what
 * can be picked to play. A backlog of nothing but unreleased games (they are
 * in Coming up) counts as no backlog, because "Pick from backlog" would land
 * on an empty Backlog segment.
 *
 * Null is a backlog that has not answered yet or failed to. The card then
 * offers both buttons, as the card offered its one button before Home knew
 * the first-run answer: both lead somewhere that works, and the pair only
 * loses a button once the backlog is known to be empty.
 */
export function playingEmptyCard(state: { firstRun: boolean; backlog: number | null }): PlayingEmptyCard {
  if (state.firstRun) {
    return {
      body: 'Start a game from your backlog and it shows up here.',
      primary: null,
      secondary: null,
    };
  }
  if (state.backlog === 0) {
    return { body: "Search for the game you're playing.", primary: SEARCH_NEW, secondary: null };
  }
  return { body: 'Start a game from your backlog.', primary: PICK_FROM_BACKLOG, secondary: SEARCH_NEW };
}

/** The Playing block's two shapes: the hero, and the small cards under it. */
export interface PlayingSplit {
  hero: EntryRow | null;
  alsoPlaying: EntryRow[];
}

/**
 * The hero is the first row and the rest are the small cards.
 *
 * `playing()` orders by most recently started, falling back to most recently
 * added, so "the game you picked up last is the big one" is a database
 * decision and this only has to not undo it. It exists as a function so the
 * ordering is asserted somewhere rather than living in a `rows[0]` in the
 * middle of a component.
 */
export function splitPlaying(rows: readonly EntryRow[]): PlayingSplit {
  return { hero: rows[0] ?? null, alsoPlaying: rows.slice(1) };
}
