/**
 * The rules of the joint Profile, with no React and no network
 * (docs/design/profile-brief.md with Rafa's letters applied; movies-build.md,
 * PR 5): which page a person sees, what the switcher offers, which tiles a
 * page shows, how a line of activity reads, and how a month of activity lays
 * out on the calendar.
 *
 * Relative imports only, so `test/profile-model.test.ts` runs it under node.
 * No sentence lives here (spanish-build.md): a label is returned as its key,
 * and a line built from parts takes the screen's `t` as `say`, so the words
 * are the dictionary's (`lib/i18n/en/profile.ts`) and the module never loads
 * the binding, which needs the device.
 */

import type { ActivityEvent, ActivityKind, ProfileStats } from '@verso/api';
import type { Medium } from '@verso/core';

import { personalDate } from '../../lib/format';
import type { TranslationKey, TranslationVars } from '../../lib/i18n/dictionary';
import { LIVE_MEDIA, MEDIUM_WORDS, trackedMedia, type LiveMedium } from '../../state/medium-model';

/** The screen's `t` (`useT()`), passed in by whoever draws the line. */
export type Say = (key: TranslationKey, vars?: TranslationVars) => string;

// ---------------------------------------------------------------------------
// The page and the switcher
// ---------------------------------------------------------------------------

/** What the page is showing: every medium, or one. */
export type ProfileView = 'all' | LiveMedium;

/** How many entries a medium's counts hold: ranked or listed, in any status. */
function entryCount(stats: ProfileStats): number {
  // Ranked items are played entries too, so the statuses alone count them;
  // `ranked` is added only for a ranking with no entry row (never in practice).
  const listed = stats.backlog + stats.upcoming + stats.playing + stats.played + stats.dropped;
  return Math.max(listed, stats.ranked);
}

/**
 * The media the page shows: the tracked ones that hold at least one entry
 * (the brief: a second medium "gains the segments and the second section the
 * moment the first item" is there; until then "add a medium" in Edit profile
 * is the door). A person with nothing anywhere still gets their first
 * tracked medium's page. Null while any tracked medium's counts are still
 * loading, so the page never flashes one layout and then the other.
 */
export function shownMedia(
  profileMedia: readonly Medium[] | null | undefined,
  stats: Partial<Record<LiveMedium, ProfileStats>>,
): LiveMedium[] | null {
  const tracked = trackedMedia(profileMedia);
  if (tracked.some((medium) => stats[medium] === undefined)) return null;
  const withEntries = tracked.filter((medium) => entryCount(stats[medium]!) > 0);
  return withEntries.length > 0 ? withEntries : [tracked[0]!];
}

/**
 * What the switcher under the identity row offers, in order: "All" first,
 * then one icon per shown medium. Nothing at all with one medium shown
 * (the brief: the switcher is present only when there is more than one), so
 * the page is that medium's and has no control.
 */
export function switcherOptions(shown: readonly LiveMedium[]): ProfileView[] {
  return shown.length > 1 ? ['all', ...shown] : [];
}

/**
 * The page a person sees: what they picked on the switcher when it exists,
 * else their one medium. A pick outside the shown media (defensive: the
 * switcher only offers shown ones) reads as All.
 */
export function profileView(picked: ProfileView, shown: readonly LiveMedium[]): ProfileView {
  if (shown.length === 1) return shown[0]!;
  return picked === 'all' || shown.includes(picked) ? picked : 'all';
}

/** The medium a read is scoped to: none on All. */
export function mediumOf(view: ProfileView): LiveMedium | undefined {
  return view === 'all' ? undefined : view;
}

/**
 * A medium's plural as Profile, Activity and Edit profile write it ("Games",
 * "Movies"): the section titles, the switcher, the rows under "Media you
 * track". Profile's own keys rather than `MEDIUM_WORDS`, which is the shell's.
 */
export const MEDIUM_KEYS: Readonly<Record<LiveMedium, TranslationKey>> = {
  game: 'profile.media.game',
  movie: 'profile.media.movie',
};

/** The switcher's word, as a key, and icon for a view. */
export function viewWords(view: ProfileView): { word: TranslationKey; icon: 'layers' | 'gamepad-2' | 'film' } {
  if (view === 'all') return { word: 'profile.page.all', icon: 'layers' };
  return { word: MEDIUM_KEYS[view], icon: MEDIUM_WORDS[view].icon };
}

// ---------------------------------------------------------------------------
// The tiles
// ---------------------------------------------------------------------------

export interface Tile {
  key: 'played' | 'watched' | 'ranked' | 'top' | 'hours';
  value: string;
  label: string;
}

/** What the tiles are made from; a field still loading is undefined. */
export interface TileInputs {
  /** `profileStats` per tracked medium. */
  stats: Partial<Record<LiveMedium, ProfileStats>>;
  /** `rankerPercentile` for the view; null hides the tile. */
  percentile: number | null | undefined;
  /** `profileHours` for the view. */
  hours: number | undefined;
}

const LOADING = '—';

/**
 * "Top 8%" from a percentile of 92.3: the share of rankers at or above the
 * caller, rounded, never "Top 0%". Null when there is no percentile (a cohort
 * under ten, or nothing ranked), and the tile then hides rather than claiming
 * "Top 100%" of nobody (the build's default 4).
 */
export function topPercentLabel(percentile: number | null | undefined, say: Say): string | null {
  if (percentile === null || percentile === undefined || !Number.isFinite(percentile)) return null;
  const top = Math.max(1, Math.round(100 - percentile));
  // "Top 100%" says nothing and reads as an insult: the lowest ranker's tile hides.
  return top >= 100 ? null : say('profile.page.tiles.topPercent', { percent: top });
}

/** The Hours tile's number: whole hours, "0" for none. */
export function hoursValue(hours: number | undefined): string {
  if (hours === undefined) return LOADING;
  return String(Math.round(hours));
}

/**
 * The tiles a page shows, in Beli's shape (round one): on All, Ranked across
 * media, Top N% of rankers, Hours; on one medium, that medium's four, the
 * first being what you did with it (Watched for films, Played for games),
 * then Ranked, Top N%, Hours. The Top tile is dropped whenever the
 * percentile is null; while it loads it holds its place with a dash.
 */
export function profileTiles(
  view: ProfileView,
  tracked: readonly LiveMedium[],
  inputs: TileInputs,
  say: Say,
): Tile[] {
  const scope = view === 'all' ? tracked : [view];
  const loaded = scope.every((medium) => inputs.stats[medium] !== undefined);
  const sum = (pick: (stats: ProfileStats) => number) =>
    loaded ? String(scope.reduce((total, medium) => total + pick(inputs.stats[medium]!), 0)) : LOADING;

  const tiles: Tile[] = [];
  if (view === 'movie') {
    tiles.push({ key: 'watched', value: sum((s) => s.played), label: say('profile.page.tiles.watched') });
  }
  if (view === 'game') {
    tiles.push({ key: 'played', value: sum((s) => s.played), label: say('profile.page.tiles.played') });
  }
  tiles.push({ key: 'ranked', value: sum((s) => s.ranked), label: say('profile.page.tiles.ranked') });

  const ofRankers = say('profile.page.tiles.ofRankers');
  if (inputs.percentile === undefined) {
    tiles.push({ key: 'top', value: LOADING, label: ofRankers });
  } else {
    const top = topPercentLabel(inputs.percentile, say);
    if (top) tiles.push({ key: 'top', value: top, label: ofRankers });
  }

  tiles.push({ key: 'hours', value: hoursValue(inputs.hours), label: say('profile.page.tiles.hours') });
  return tiles;
}

/**
 * A medium section's counts at the right of its header: "48 ranked · 12
 * backlog" for games, "31 ranked · 12 watchlist" for films (the brief's
 * per-medium vocabulary, rule 18). The backlog is both of the Next tab's
 * segments, released and upcoming, since both are on the list.
 */
export function sectionCounts(medium: LiveMedium, stats: ProfileStats | undefined, say: Say): string | null {
  if (!stats) return null;
  const list = stats.backlog + stats.upcoming;
  return say(medium === 'movie' ? 'profile.page.sectionCounts.movie' : 'profile.page.sectionCounts.game', {
    ranked: stats.ranked,
    list,
  });
}

/** "Your top films" or "Your top games", the one-medium page's section title, as a key. */
export function topTitle(medium: LiveMedium): TranslationKey {
  return medium === 'movie' ? 'profile.page.topTitle.movie' : 'profile.page.topTitle.game';
}

// ---------------------------------------------------------------------------
// Activity lines
// ---------------------------------------------------------------------------

/** Each kind's line, without and with the score: "Ranked {title}", "Ranked {title} · {score}". */
export const ACTIVITY_LINES: Readonly<Record<ActivityKind, { plain: TranslationKey; scored: TranslationKey }>> = {
  ranked: { plain: 'profile.activityLine.ranked', scored: 'profile.activityLine.rankedScored' },
  watched: { plain: 'profile.activityLine.watched', scored: 'profile.activityLine.watchedScored' },
  finished: { plain: 'profile.activityLine.finished', scored: 'profile.activityLine.finishedScored' },
};

/**
 * One line of activity (profile-brief, round two): the verb by what happened
 * ("Ranked", "Watched", "Finished"), the title, and the score when the item is
 * ranked, never a rank number ("I just need to know the score"). The read
 * already folds a placement into the watch or finish of the same day, so
 * "Finished Elden Ring · 9.4" is one line, not two.
 */
export function activityLine(event: Pick<ActivityEvent, 'kind' | 'title' | 'score'>, say: Say): string {
  const line = ACTIVITY_LINES[event.kind];
  if (event.score === null || event.score === undefined) return say(line.plain, { title: event.title });
  return say(line.scored, { title: event.title, score: event.score.toFixed(1) });
}

/** The month names, January first, as keys. */
const MONTH_KEYS: readonly TranslationKey[] = [
  'profile.calendar.months.january',
  'profile.calendar.months.february',
  'profile.calendar.months.march',
  'profile.calendar.months.april',
  'profile.calendar.months.may',
  'profile.calendar.months.june',
  'profile.calendar.months.july',
  'profile.calendar.months.august',
  'profile.calendar.months.september',
  'profile.calendar.months.october',
  'profile.calendar.months.november',
  'profile.calendar.months.december',
];

/** A `YYYY-MM-DD` day as a local midnight, or null. */
function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Recent's trailing time, as the frames write it: "Today", then "4d", "2w",
 * and past five weeks the day itself ("Aug 3", with the year when it is not
 * this one). Counted in whole days from the event's day, so a line from late
 * last night is "1d" and not "Today".
 */
export function shortAgo(onDate: string, say: Say, now: Date = new Date()): string {
  const day = parseDay(onDate);
  if (!day) return '';
  const days = Math.round((startOfDay(now).getTime() - day.getTime()) / 86_400_000);
  if (days <= 0) return say('profile.page.ago.today');
  if (days < 7) return say('profile.page.ago.days', { count: days });
  if (days < 35) return say('profile.page.ago.weeks', { count: Math.floor(days / 7) });
  return dayLabel(onDate, now);
}

/**
 * "Oct 12", with the year when it is not the current one: the Activity list's
 * date. `personalDate` in lib/format.ts is this exact shape, in the app's
 * language (`12 oct`, `31 dic 2025`).
 */
export function dayLabel(onDate: string, now: Date = new Date()): string {
  if (!parseDay(onDate)) return '';
  return personalDate(onDate.slice(0, 10), now) ?? '';
}

// ---------------------------------------------------------------------------
// The month grid
// ---------------------------------------------------------------------------

export interface MonthCell<T> {
  /** 1 to 31. */
  day: number;
  /** The poster the day shows: its newest event, or null for a day with none. */
  first: T | null;
  /** How many more the day holds: the "+N" badge, 0 for none. */
  more: number;
}

/** A week row: seven cells, null for a day outside the month. */
export type MonthWeek<T> = (MonthCell<T> | null)[];

/**
 * The Activity calendar's month (round one, and round two's "+2"): weeks from
 * Sunday, as the frame draws them, one cell per day, each with the day's
 * newest event as its poster and a "+N" for the rest. `events` come newest
 * first from `activityMonth`, so the first one seen for a day is the poster.
 */
export function monthGrid<T extends { day: number }>(year: number, month: number, events: readonly T[]): MonthWeek<T>[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = new Date(year, month - 1, 1).getDay();

  const byDay = new Map<number, T[]>();
  for (const event of events) {
    if (event.day < 1 || event.day > daysInMonth) continue;
    const list = byDay.get(event.day) ?? [];
    list.push(event);
    byDay.set(event.day, list);
  }

  const cells: (MonthCell<T> | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const list = byDay.get(day) ?? [];
    cells.push({ day, first: list[0] ?? null, more: Math.max(0, list.length - 1) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: MonthWeek<T>[] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** The week header, Sunday first, as keys. */
export const WEEKDAY_LETTERS: readonly TranslationKey[] = [
  'profile.calendar.weekdayLetters.sunday',
  'profile.calendar.weekdayLetters.monday',
  'profile.calendar.weekdayLetters.tuesday',
  'profile.calendar.weekdayLetters.wednesday',
  'profile.calendar.weekdayLetters.thursday',
  'profile.calendar.weekdayLetters.friday',
  'profile.calendar.weekdayLetters.saturday',
];

/** "October 2026", the Activity header. */
export function monthTitle(year: number, month: number, say: Say): string {
  return say('profile.activity.monthTitle', { month: monthName(month, say), year });
}

/** "October", the list's header under the grid. */
export function monthName(month: number, say: Say): string {
  const key = MONTH_KEYS[month - 1];
  return key ? say(key) : '';
}

/** The month before or after, as a year and a 1-to-12 month. */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

export interface ShareSection {
  medium: LiveMedium;
  /** Best first; only the first ten are used. */
  items: readonly { title: string; score: number }[];
}

/**
 * "Share my profile" (or "Share my top 10" on one medium): the plain-text top
 * tens, one block per medium with its name over it when there are several,
 * ending "Ranked with Verso". The public link replaces it once the public
 * page exists; until then it is the text whatever the switch says. Null when
 * there is nothing ranked to share (rule 20: hide what is empty).
 */
export function profileShareText(
  sections: readonly ShareSection[],
  say: Say,
  handle: string | null = null,
): string | null {
  const filled = sections.filter((section) => section.items.length > 0);
  if (filled.length === 0) return null;

  const blocks = filled.map((section) => {
    const lines = section.items
      .slice(0, 10)
      .map((item, index) => `${index + 1}. ${item.title} — ${item.score.toFixed(1)}`);
    const heading = say(section.medium === 'movie' ? 'profile.page.share.heading.movie' : 'profile.page.share.heading.game');
    return filled.length > 1 ? [heading, ...lines].join('\n') : lines.join('\n');
  });

  const signature = handle
    ? say('profile.page.share.signatureWithHandle', { handle })
    : say('profile.page.share.signature');
  return [...blocks, signature].join('\n\n');
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The name line (profile-brief, the page, item 1): the display name, else the
 * handle, else null, which the page draws as "Set your name" in the brand
 * green. The email never shows as a name again.
 */
export function nameLine(profile: { displayName: string | null; username: string | null }): string | null {
  const name = profile.displayName?.trim();
  if (name) return name;
  const handle = profile.username?.trim();
  return handle ? handle : null;
}

/** The placeholder circle's letters: two from the name, or one from the handle, or none. */
export function initialsFor(profile: { displayName: string | null; username: string | null }): string {
  const name = profile.displayName?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : [words[0]!];
    return letters.map((word) => Array.from(word)[0]!.toUpperCase()).join('');
  }
  const handle = profile.username?.trim();
  return handle ? Array.from(handle)[0]!.toUpperCase() : '';
}

// ---------------------------------------------------------------------------
// Edit profile
// ---------------------------------------------------------------------------

/** Edit profile's form (frame 267:168). */
export interface EditForm {
  name: string;
  /** As typed, without the "@" the row draws in front of it. */
  username: string;
  media: LiveMedium[];
  isPublic: boolean;
}

export interface EditableProfile {
  displayName: string | null;
  username: string | null;
  media: readonly Medium[] | null;
  isPublic: boolean;
}

/** What Save writes: the fields that changed. */
export interface EditPatch {
  displayName?: string | null;
  username?: string | null;
  media?: LiveMedium[];
  isPublic?: boolean;
}

export function editFormFrom(profile: EditableProfile): EditForm {
  return {
    name: profile.displayName ?? '',
    username: profile.username ?? '',
    media: trackedMedia(profile.media),
    isPublic: profile.isPublic,
  };
}

/**
 * Tick or untick a medium under "Media you track": the list stays in the
 * switcher's order and never empties (the questionnaire has no skip, and
 * `setProfileMedia` refuses an empty list), so the last tick cannot be taken
 * off. Unticking hides a medium; nothing ranked in it is deleted.
 */
export function toggleMedium(media: readonly LiveMedium[], medium: LiveMedium): LiveMedium[] {
  const next = media.includes(medium) ? media.filter((each) => each !== medium) : [...media, medium];
  if (next.length === 0) return [...media];
  return LIVE_MEDIA.filter((each) => next.includes(each));
}

/** Only the fields that changed, or null when nothing did (Save then just closes). */
export function editPatch(profile: EditableProfile, form: EditForm): EditPatch | null {
  const patch: EditPatch = {};

  const name = form.name.trim();
  if (name !== (profile.displayName ?? '').trim()) patch.displayName = name || null;

  const username = form.username.trim().replace(/^@+/, '');
  if (username !== (profile.username ?? '')) patch.username = username || null;

  const before = trackedMedia(profile.media);
  if (before.length !== form.media.length || before.some((each, index) => each !== form.media[index])) {
    patch.media = [...form.media];
  }

  if (form.isPublic !== profile.isPublic) patch.isPublic = form.isPublic;

  return Object.keys(patch).length > 0 ? patch : null;
}
