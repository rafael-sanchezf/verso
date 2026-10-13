/**
 * The rules of the joint Profile, with no React and no network
 * (docs/design/profile-brief.md with Rafa's letters applied; movies-build.md,
 * PR 5): which page a person sees, what the switcher offers, which tiles a
 * page shows, how a line of activity reads, and how a month of activity lays
 * out on the calendar.
 *
 * Relative imports only, so `test/profile-model.test.ts` runs it under node.
 */

import type { ActivityEvent, ActivityKind, ProfileStats } from '@verso/api';
import type { Medium } from '@verso/core';

import { LIVE_MEDIA, MEDIUM_WORDS, trackedMedia, type LiveMedium } from '../../state/medium-model';

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

/** The switcher's word and icon for a view. */
export function viewWords(view: ProfileView): { word: string; icon: 'layers' | 'gamepad-2' | 'film' } {
  if (view === 'all') return { word: 'All', icon: 'layers' };
  return { word: MEDIUM_WORDS[view].plural, icon: MEDIUM_WORDS[view].icon };
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
export function topPercentLabel(percentile: number | null | undefined): string | null {
  if (percentile === null || percentile === undefined || !Number.isFinite(percentile)) return null;
  const top = Math.max(1, Math.round(100 - percentile));
  // "Top 100%" says nothing and reads as an insult: the lowest ranker's tile hides.
  return top >= 100 ? null : `Top ${top}%`;
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
export function profileTiles(view: ProfileView, tracked: readonly LiveMedium[], inputs: TileInputs): Tile[] {
  const scope = view === 'all' ? tracked : [view];
  const loaded = scope.every((medium) => inputs.stats[medium] !== undefined);
  const sum = (pick: (stats: ProfileStats) => number) =>
    loaded ? String(scope.reduce((total, medium) => total + pick(inputs.stats[medium]!), 0)) : LOADING;

  const tiles: Tile[] = [];
  if (view === 'movie') tiles.push({ key: 'watched', value: sum((s) => s.played), label: 'Watched' });
  if (view === 'game') tiles.push({ key: 'played', value: sum((s) => s.played), label: 'Played' });
  tiles.push({ key: 'ranked', value: sum((s) => s.ranked), label: 'Ranked' });

  if (inputs.percentile === undefined) {
    tiles.push({ key: 'top', value: LOADING, label: 'of rankers' });
  } else {
    const top = topPercentLabel(inputs.percentile);
    if (top) tiles.push({ key: 'top', value: top, label: 'of rankers' });
  }

  tiles.push({ key: 'hours', value: hoursValue(inputs.hours), label: 'Hours' });
  return tiles;
}

/**
 * A medium section's counts at the right of its header: "48 ranked · 12
 * backlog" for games, "31 ranked · 12 watchlist" for films (the brief's
 * per-medium vocabulary, rule 18). The backlog is both of the Next tab's
 * segments, released and upcoming, since both are on the list.
 */
export function sectionCounts(medium: LiveMedium, stats: ProfileStats | undefined): string | null {
  if (!stats) return null;
  const list = stats.backlog + stats.upcoming;
  return `${stats.ranked} ranked · ${list} ${medium === 'movie' ? 'watchlist' : 'backlog'}`;
}

/** "Your top films" or "Your top games", the one-medium page's section title. */
export function topTitle(medium: LiveMedium): string {
  return medium === 'movie' ? 'Your top films' : 'Your top games';
}

// ---------------------------------------------------------------------------
// Activity lines
// ---------------------------------------------------------------------------

export const ACTIVITY_VERBS: Readonly<Record<ActivityKind, string>> = {
  ranked: 'Ranked',
  watched: 'Watched',
  finished: 'Finished',
};

/**
 * One line of activity (profile-brief, round two): the verb by what happened
 * ("Ranked", "Watched", "Finished"), the title, and the score when the item is
 * ranked, never a rank number ("I just need to know the score"). The read
 * already folds a placement into the watch or finish of the same day, so
 * "Finished Elden Ring · 9.4" is one line, not two.
 */
export function activityLine(event: Pick<ActivityEvent, 'kind' | 'title' | 'score'>): string {
  const verb = ACTIVITY_VERBS[event.kind];
  const score = event.score === null || event.score === undefined ? '' : ` · ${event.score.toFixed(1)}`;
  return `${verb} ${event.title}${score}`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

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
export function shortAgo(onDate: string, now: Date = new Date()): string {
  const day = parseDay(onDate);
  if (!day) return '';
  const days = Math.round((startOfDay(now).getTime() - day.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days < 7) return `${days}d`;
  if (days < 35) return `${Math.floor(days / 7)}w`;
  return dayLabel(onDate, now);
}

/** "Oct 12", with the year when it is not the current one: the Activity list's date. */
export function dayLabel(onDate: string, now: Date = new Date()): string {
  const day = parseDay(onDate);
  if (!day) return '';
  const label = `${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}`;
  return day.getFullYear() === now.getFullYear() ? label : `${label}, ${day.getFullYear()}`;
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

/** The week header, Sunday first. */
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** "October 2026", the Activity header. */
export function monthTitle(year: number, month: number): string {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** "October", the list's header under the grid. */
export function monthName(month: number): string {
  return MONTHS_LONG[month - 1] ?? '';
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
export function profileShareText(sections: readonly ShareSection[], handle: string | null = null): string | null {
  const filled = sections.filter((section) => section.items.length > 0);
  if (filled.length === 0) return null;

  const blocks = filled.map((section) => {
    const lines = section.items
      .slice(0, 10)
      .map((item, index) => `${index + 1}. ${item.title} — ${item.score.toFixed(1)}`);
    return filled.length > 1 ? [`My top ${MEDIUM_WORDS[section.medium].plural.toLowerCase()}`, ...lines].join('\n') : lines.join('\n');
  });

  const signature = handle ? `Ranked with Verso · @${handle}` : 'Ranked with Verso';
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
