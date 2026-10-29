/**
 * How the app writes hours, dates, platforms and genres.
 *
 * Every screen shows the same handful of facts in the same handful of shapes,
 * so the shapes live here and the screens ask for them. The rules are the ones
 * in docs/design/specs/README.md, "Formatting helpers".
 *
 * Two things every function here has in common:
 *
 * - A missing fact returns `null`, never `''` and never a zero. Rule 9 says
 *   fall back down a defined hierarchy rather than show an empty field, and a
 *   caller can only do that if "I have nothing" is a value it can test.
 * - `now` is a parameter. A relative date that reads the clock inside itself
 *   cannot be tested, and "Today" is exactly the kind of thing that is wrong
 *   for six hours a day if the timezone handling is subtly off.
 *
 * No `Intl`: the month and weekday names are the app's own tables, one per
 * language the app speaks, read against the language the app is in
 * (`lib/i18n/store.ts`), never the device's locale on its own. A device set to
 * a language the app does not speak would otherwise print a date the rest of
 * the interface disagrees with. The tables are the whole of what localization
 * changes here: the shapes (which facts, how precise, what falls back to what)
 * are the same in every language.
 *
 * Spanish writes the day before the month (`24 sept`, `2 sept 2025`), with the
 * RAE's lowercase month abbreviations, and the rest of the week's weekday as a
 * standalone label, capitalized like `Hoy` and `Ayer` because it starts the
 * line.
 */

import { genreDisplayName } from '@verso/core';

import { languageStore } from './i18n/store';
import type { Language } from './i18n/model';

type Twelve = readonly [string, string, string, string, string, string, string, string, string, string, string, string];
type Seven = readonly [string, string, string, string, string, string, string];

/**
 * One language's month and weekday names: the only copy in the app for
 * everything that prints a date through here, and exported for a screen that
 * lays out its own (Activity's calendar, the watchlist's Calendar, the movie
 * page's diary line), so those words are never spelled a second time.
 */
export interface DateTables {
  /** `Sep`, `sept`: the short month, inside a line. */
  months: Twelve;
  /** `September`, `Septiembre`: the month on its own, as a header. */
  monthNames: Twelve;
  /** `Monday`, `Lunes`: the weekday on its own, starting a line. */
  weekdays: Seven;
  /** `Mon`, `lun`: the weekday inside a line, as `months` is. */
  weekdaysShort: Seven;
  /** `S M T W T F S`, `D L M M J V S`: a calendar's week row, Sunday first. */
  weekdayLetters: Seven;
}

interface DateWords extends DateTables {
  today: string;
  yesterday: string;
  /** `Sep 24` or `24 sept`. */
  monthDay(month: string, day: number): string;
  /** `Sep 24, 2025` or `24 sept 2025`. */
  monthDayYear(month: string, day: number, year: number): string;
  /** `Sep 2026` or `sept 2026`. */
  monthYear(month: string, year: number): string;
  /** `14 h played` or `14 h jugadas`; `40 min played` or `40 min jugados`. */
  played(figure: string, unit: 'h' | 'min'): string;
}

/** A week row is each weekday's first letter, in every language the app speaks. */
function letters(weekdays: Seven): Seven {
  return weekdays.map((weekday) => weekday.charAt(0)) as unknown as Seven;
}

const EN_WEEKDAYS: Seven = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ES_WEEKDAYS: Seven = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const DATE_WORDS: Readonly<Record<Language, DateWords>> = {
  en: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthNames: [
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
    ],
    weekdays: EN_WEEKDAYS,
    weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    weekdayLetters: letters(EN_WEEKDAYS),
    today: 'Today',
    yesterday: 'Yesterday',
    monthDay: (month, day) => `${month} ${day}`,
    monthDayYear: (month, day, year) => `${month} ${day}, ${year}`,
    monthYear: (month, year) => `${month} ${year}`,
    played: (figure) => `${figure} played`,
  },
  es: {
    months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
    // Capitalized: each stands alone at the start of a header, as `Hoy` does.
    monthNames: [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ],
    weekdays: ES_WEEKDAYS,
    weekdaysShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    weekdayLetters: letters(ES_WEEKDAYS),
    today: 'Hoy',
    yesterday: 'Ayer',
    monthDay: (month, day) => `${day} ${month}`,
    monthDayYear: (month, day, year) => `${day} ${month} ${year}`,
    monthYear: (month, year) => `${month} ${year}`,
    // Hours are feminine, minutes masculine.
    played: (figure, unit) => `${figure} ${unit === 'h' ? 'jugadas' : 'jugados'}`,
  },
};

/** The words for the language the app is in at the moment of the call. */
function words(): DateWords {
  return DATE_WORDS[languageStore.language()];
}

/** The month and weekday tables, in the language the app is in at the moment of the call. */
export function dateTables(): DateTables {
  const { months, monthNames, weekdays, weekdaysShort, weekdayLetters } = words();
  return { months, monthNames, weekdays, weekdaysShort, weekdayLetters };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A stored date as a local `Date`, or null if it is not one.
 *
 * `media_items.release_date` is a Postgres date and arrives as `2026-09-24`.
 * `new Date('2026-09-24')` reads that as UTC midnight, which in New York is
 * the evening of the 23rd — so a game would announce itself a day early on
 * every screen. Date-only strings are therefore built field by field in local
 * time; timestamps (`created_at` and friends) carry a zone and are parsed as
 * they are.
 */
function parse(value: string | null | undefined): Date | null {
  if (!value) return null;

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `Sep 24`; `24 sept` in Spanish. */
function monthDay(date: Date): string {
  const w = words();
  return w.monthDay(w.months[date.getMonth()]!, date.getDate());
}

/** `Sep 24, 2025`; `24 sept 2025` in Spanish. */
function monthDayYear(date: Date): string {
  const w = words();
  return w.monthDayYear(w.months[date.getMonth()]!, date.getDate(), date.getFullYear());
}

/**
 * `Sep 2026`; `sept 2026` in Spanish: the Profile joined line. A timestamp is
 * read in local time, as every date here is. Null if the value is not a date.
 */
export function monthYear(value: string | null | undefined): string | null {
  const date = parse(value);
  if (!date) return null;
  const w = words();
  return w.monthYear(w.months[date.getMonth()]!, date.getFullYear());
}

/** Whole days between two dates, counting calendar days rather than 24-hour spans. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------

/**
 * IGDB's time to beat, as `~30 h`.
 *
 * The tilde is not decoration: the figure is an average of other people's
 * playthroughs, and rule 9 says not to present someone else's average as if it
 * were a fact about this player.
 */
export function timeToBeat(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const hours = Math.round(seconds / 3600);
  // Anything under half an hour would round to "~0 h", which says nothing.
  return hours < 1 ? '~1 h' : `~${hours} h`;
}

/**
 * The player's own playtime, as `14 h played` or `40 min played`.
 *
 * Minutes under the hour, because "0 h played" on a game someone has played
 * for forty minutes is the kind of small lie rule 9 exists to prevent.
 */
export function playtime(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const figure = hours(minutes)!;
  return words().played(figure, minutes < 60 ? 'min' : 'h');
}

/** The same figure without the trailing word, for the game page's Hours row: `14 h`. */
export function hours(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.round(minutes / 60)} h`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * A catalog release date: `Sep 24` this year, `Feb 2027` next year, `2028`
 * further out.
 *
 * The precision drops with the distance because IGDB's own precision does. The
 * mirror stores a single date column, so a game IGDB knows only as "2028" is
 * stored as the first of some month in 2028 — printing that day would be
 * inventing one. A date this year or next is reliable enough to show.
 */
export function releaseDate(value: string | null | undefined, now: Date = new Date()): string | null {
  const date = parse(value);
  if (!date) return null;

  const years = date.getFullYear() - now.getFullYear();
  if (years <= 0) return monthDay(date);
  if (years === 1) return `${words().months[date.getMonth()]} ${date.getFullYear()}`;
  return String(date.getFullYear());
}

/**
 * A date the player entered or the app stamped: `Sep 2` this year, `Sep 2, 2025`
 * otherwise.
 *
 * The year appears as soon as it is not this one, in either direction: a
 * started date from last December and one from this January are a fortnight
 * apart and must not read the same.
 */
export function personalDate(value: string | null | undefined, now: Date = new Date()): string | null {
  const date = parse(value);
  if (!date) return null;

  return date.getFullYear() === now.getFullYear() ? monthDay(date) : monthDayYear(date);
}

/** Always the whole date, `Sep 17, 2020`. The game page's Released row. */
export function fullDate(value: string | null | undefined): string | null {
  const date = parse(value);
  if (!date) return null;
  return monthDayYear(date);
}

/**
 * How long ago, in the words a person would use: `Today`, `Yesterday`, the
 * weekday name for the rest of the week, then the date.
 *
 * Only the past gets a weekday. "Wednesday" for something three days from now
 * is ambiguous in a way "Wednesday" for something three days ago is not, so a
 * future date falls through to `personalDate`.
 */
export function relativeDate(value: string | null | undefined, now: Date = new Date()): string | null {
  const date = parse(value);
  if (!date) return null;

  const days = daysBetween(date, now);
  const w = words();
  if (days === 0) return w.today;
  if (days === 1) return w.yesterday;
  if (days > 1 && days < 7) return w.weekdays[date.getDay()]!;
  return personalDate(value, now);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/**
 * IGDB's platform names, in the words a player uses.
 *
 * The catalog stores `platforms.name` exactly as IGDB writes it, which is a
 * database's name for a platform rather than a person's: `PC (Microsoft
 * Windows)`, `PlayStation 5`, `Nintendo Switch 2`. Three of those in a 13pt
 * subtitle is a truncated string, so a row that should read `2025 · Switch 2,
 * PC` reads `2013 · Xbox Series X|S, PlayStation 3, PlayS…` instead.
 *
 * The map is explicit rather than clever, and only for the platforms the
 * catalog actually carries in quantity. A name that is not in it and matches no
 * rule below comes back exactly as IGDB wrote it: an unknown platform gets its
 * full name, never a guessed abbreviation (rule 9, never invent a fact).
 *
 * `Xbox Series X|S` is deliberately left alone. It is already short, it is the
 * name Microsoft uses, and every abbreviation of it ("XSX|S") is a string
 * nobody says out loud.
 */
const PLATFORM_SHORT_NAMES: Readonly<Record<string, string>> = {
  // PC and the desktops.
  'PC (Microsoft Windows)': 'PC',
  'Mac': 'Mac',
  'Linux': 'Linux',

  // PlayStation. The original is `PlayStation`, and `PS1` is what people call
  // it now that there are five of them.
  'PlayStation': 'PS1',
  'PlayStation 2': 'PS2',
  'PlayStation 3': 'PS3',
  'PlayStation 4': 'PS4',
  'PlayStation 5': 'PS5',
  'PlayStation Portable': 'PSP',
  'PlayStation Vita': 'Vita',
  'PlayStation VR': 'PSVR',
  'PlayStation VR2': 'PSVR2',

  // Xbox. Every one of these is already the name people use.
  'Xbox': 'Xbox',
  'Xbox 360': 'Xbox 360',
  'Xbox One': 'Xbox One',
  'Xbox Series X|S': 'Xbox Series X|S',

  // Nintendo.
  'Nintendo Switch': 'Switch',
  'Nintendo Switch 2': 'Switch 2',
  'Nintendo 3DS': '3DS',
  'New Nintendo 3DS': 'New 3DS',
  'Nintendo DS': 'DS',
  'Nintendo DSi': 'DSi',
  'Nintendo 64': 'N64',
  'Nintendo GameCube': 'GameCube',
  'Wii U': 'Wii U',
  'Wii': 'Wii',
  'Game Boy': 'Game Boy',
  'Game Boy Color': 'Game Boy Color',
  'Game Boy Advance': 'GBA',
  'Super Nintendo Entertainment System': 'SNES',
  'Nintendo Entertainment System': 'NES',
  'Family Computer': 'Famicom',
  'Super Famicom': 'Super Famicom',

  // Sega, and the rest of what the catalog carries in any number.
  'Sega Mega Drive/Genesis': 'Genesis',
  'Sega Master System/Mark III': 'Master System',
  'Sega Saturn': 'Saturn',
  'Dreamcast': 'Dreamcast',
  'Sega Game Gear': 'Game Gear',
  'Arcade': 'Arcade',
  'iOS': 'iOS',
  'Android': 'Android',
  'Web browser': 'Browser',
  'Google Stadia': 'Stadia',
  'Meta Quest 2': 'Quest 2',
  'Meta Quest 3': 'Quest 3',
  'Oculus Quest': 'Quest',
  'Oculus Rift': 'Rift',
  'SteamVR': 'SteamVR',
};

/** `PlayStation 5` and nothing else. The map above covers 1 to 5 already. */
const NUMBERED_PLAYSTATION = /^PlayStation (\d+)$/;
/** A trailing disambiguation IGDB adds for itself: `Foo (Bar)`. */
const TRAILING_PARENTHETICAL = /^(.+?)\s*\([^()]*\)$/;

/**
 * One platform name, short enough for a subtitle.
 *
 * Display only. The stored name is the identity `setPlayedPlatforms` validates
 * against (`UnknownPlatformError` for anything the catalog does not list for
 * that game), so a chip or a picker shows this and still sends the real name.
 */
export function platformShortName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const known = PLATFORM_SHORT_NAMES[trimmed];
  if (known !== undefined) return known;

  // A PlayStation the map has not met yet — a 6 exists eventually.
  const numbered = NUMBERED_PLAYSTATION.exec(trimmed);
  if (numbered) return `PS${numbered[1]}`;

  // `Foo (Bar)` is IGDB disambiguating for its own benefit; the part before the
  // bracket is the name. Only when what is left is still a name.
  const bracketed = TRAILING_PARENTHETICAL.exec(trimmed);
  if (bracketed && bracketed[1]) return bracketed[1];

  return trimmed;
}

/**
 * Up to three platforms, then a count: `PC, PS5, Switch +2`.
 *
 * The separator differs by screen (Next uses ` · `, Search and the game page
 * use `, `), which is the only reason it is a parameter.
 *
 * Every name goes through `platformShortName` on the way out, because every
 * caller of this function is printing a line for a person to read. The two
 * places that need the stored name — the played-on chips and the picker — hold
 * it themselves and only label it with the short form.
 */
export function platforms(
  list: readonly string[] | null | undefined,
  separator: string = ', ',
): string | null {
  const names = (list ?? [])
    .map((name) => platformShortName(name))
    .filter(Boolean);
  if (names.length === 0) return null;

  const shown = names.slice(0, 3).join(separator);
  const rest = names.length - 3;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

// ---------------------------------------------------------------------------
// Platform families and glyphs
// ---------------------------------------------------------------------------

/**
 * The brand a platform belongs to.
 *
 * `other` is everything the app has no mark for — Sega, the Quests, a browser,
 * a Sharp X68000 — and those keep their short name beside a gamepad rather
 * than borrowing a logo that is not theirs (rule 9, never invent a fact).
 */
export type PlatformFamily =
  | 'playstation'
  | 'xbox'
  | 'nintendo'
  | 'pc'
  | 'mac'
  | 'ios'
  | 'linux'
  | 'android'
  | 'other';

/**
 * Which mark `PlatformIcon` draws. Null for the `other` family.
 *
 * Not one per family: the Switch family gets the Switch mark and the rest of
 * Nintendo gets the Nintendo wordmark, and Mac and iOS are two families that
 * both get Apple's apple.
 */
export type PlatformGlyphName =
  | 'playstation'
  | 'xbox'
  | 'switch'
  | 'nintendo'
  | 'windows'
  | 'apple'
  | 'linux'
  | 'android';

/** One platform, ready to draw as a glyph chip. */
export interface PlatformGlyph {
  /** The catalog's own name, trimmed — still the identity a write sends. */
  name: string;
  /** `platformShortName(name)`: what a chip prints when there is no mark. */
  shortName: string;
  family: PlatformFamily;
  glyph: PlatformGlyphName | null;
  /** `4`, `X|S`, `Mac`. Empty unless a sibling draws the same mark; see below. */
  suffix: string;
}

interface FamilyEntry {
  family: PlatformFamily;
  glyph: PlatformGlyphName;
  /**
   * What tells this platform apart from the others drawn with the same mark.
   *
   * Empty for the one that *is* the mark: a bare Switch mark is the Switch, a
   * bare Xbox sphere is the original Xbox. `PlayStation` is `1` rather than
   * empty because nobody has called it anything but PS1 since 2000, while
   * "Xbox 1" is a different console from the original Xbox.
   */
  suffix: string;
  /**
   * Keep the suffix even when nothing else draws this mark.
   *
   * For the platform that is *not* what a reader assumes the bare mark means.
   * Apple's apple is the Mac to anyone looking at a list of games, so a game
   * that is only on iOS would otherwise claim to be a Mac game; `iOS` says
   * which it is. The Mac itself stays bare, because it is the reading people
   * already make.
   */
  alwaysSuffix?: true;
}

/**
 * The families, explicit, in the same spirit as the short-name map above: a
 * name that is not here is `other`, not a guess.
 */
const PLATFORM_FAMILIES: Readonly<Record<string, FamilyEntry>> = {
  // Desktop.
  'PC (Microsoft Windows)': { family: 'pc', glyph: 'windows', suffix: '' },
  'Mac': { family: 'mac', glyph: 'apple', suffix: 'Mac' },
  'Linux': { family: 'linux', glyph: 'linux', suffix: '' },

  // Phones. iOS shares Apple's mark with the Mac, which is exactly the case
  // the suffix exists for.
  'iOS': { family: 'ios', glyph: 'apple', suffix: 'iOS', alwaysSuffix: true },
  'Android': { family: 'android', glyph: 'android', suffix: '' },

  // PlayStation.
  'PlayStation': { family: 'playstation', glyph: 'playstation', suffix: '1' },
  'PlayStation 2': { family: 'playstation', glyph: 'playstation', suffix: '2' },
  'PlayStation 3': { family: 'playstation', glyph: 'playstation', suffix: '3' },
  'PlayStation 4': { family: 'playstation', glyph: 'playstation', suffix: '4' },
  'PlayStation 5': { family: 'playstation', glyph: 'playstation', suffix: '5' },
  'PlayStation Portable': { family: 'playstation', glyph: 'playstation', suffix: 'PSP' },
  'PlayStation Vita': { family: 'playstation', glyph: 'playstation', suffix: 'Vita' },
  'PlayStation VR': { family: 'playstation', glyph: 'playstation', suffix: 'VR' },
  'PlayStation VR2': { family: 'playstation', glyph: 'playstation', suffix: 'VR2' },

  // Xbox.
  'Xbox': { family: 'xbox', glyph: 'xbox', suffix: '' },
  'Xbox 360': { family: 'xbox', glyph: 'xbox', suffix: '360' },
  'Xbox One': { family: 'xbox', glyph: 'xbox', suffix: 'One' },
  'Xbox Series X|S': { family: 'xbox', glyph: 'xbox', suffix: 'X|S' },

  // Nintendo: the Switch mark for the Switch family, the wordmark for the rest.
  'Nintendo Switch': { family: 'nintendo', glyph: 'switch', suffix: '' },
  'Nintendo Switch 2': { family: 'nintendo', glyph: 'switch', suffix: '2' },
  'Nintendo 3DS': { family: 'nintendo', glyph: 'nintendo', suffix: '3DS' },
  'New Nintendo 3DS': { family: 'nintendo', glyph: 'nintendo', suffix: 'New 3DS' },
  'Nintendo DS': { family: 'nintendo', glyph: 'nintendo', suffix: 'DS' },
  'Nintendo DSi': { family: 'nintendo', glyph: 'nintendo', suffix: 'DSi' },
  'Nintendo 64': { family: 'nintendo', glyph: 'nintendo', suffix: 'N64' },
  'Nintendo GameCube': { family: 'nintendo', glyph: 'nintendo', suffix: 'GameCube' },
  'Wii U': { family: 'nintendo', glyph: 'nintendo', suffix: 'Wii U' },
  'Wii': { family: 'nintendo', glyph: 'nintendo', suffix: 'Wii' },
  'Game Boy': { family: 'nintendo', glyph: 'nintendo', suffix: 'GB' },
  'Game Boy Color': { family: 'nintendo', glyph: 'nintendo', suffix: 'GBC' },
  'Game Boy Advance': { family: 'nintendo', glyph: 'nintendo', suffix: 'GBA' },
  'Super Nintendo Entertainment System': { family: 'nintendo', glyph: 'nintendo', suffix: 'SNES' },
  'Nintendo Entertainment System': { family: 'nintendo', glyph: 'nintendo', suffix: 'NES' },
  'Family Computer': { family: 'nintendo', glyph: 'nintendo', suffix: 'Famicom' },
  'Super Famicom': { family: 'nintendo', glyph: 'nintendo', suffix: 'Super Famicom' },
};

/**
 * One platform's family and mark, with no suffix decided yet.
 *
 * A suffix is a fact about the *list* — whether something else on this game
 * draws the same mark — so a lone name cannot have one. `platformGlyphs` is
 * what fills it in; this is for a component that is handed one name and has to
 * draw something.
 */
export function platformGlyph(name: string): PlatformGlyph {
  const trimmed = name.trim();
  const entry = familyOf(trimmed);

  return {
    name: trimmed,
    shortName: platformShortName(trimmed),
    family: entry?.family ?? 'other',
    glyph: entry?.glyph ?? null,
    suffix: '',
  };
}

function familyOf(name: string): FamilyEntry | null {
  const known = PLATFORM_FAMILIES[name];
  if (known) return known;

  // The same forward compatibility `platformShortName` has: a PlayStation 6
  // is a PlayStation, and `6` is what tells it from the 5.
  const numbered = NUMBERED_PLAYSTATION.exec(name);
  if (numbered && numbered[1]) {
    return { family: 'playstation', glyph: 'playstation', suffix: numbered[1] };
  }

  return null;
}

/**
 * A game's platforms as marks, each with a suffix only where it earns one.
 *
 * Rule 31: on the game page a platform is a brand glyph, because "Nintendo
 * Switch 2" spelled out is three quarters of the line for one chip, and nobody
 * needs to read the words to know what a PS5 is. The names come back in the
 * places where a reader is choosing from a list — the platforms sheet, the
 * Ranking filter — and in every `accessibilityLabel`.
 *
 * The suffix is the part that has to be computed over the whole list rather
 * than per name: `4` and `5` are worth drawing on a game that is on both
 * PlayStations, and noise on a game that is only on the 5.
 *
 * Two platforms count as needing telling apart when they draw the *same mark*,
 * which is a shade narrower than "the same family". Nintendo Switch beside
 * Nintendo 3DS already reads apart, because one is the Switch mark and the
 * other the wordmark; Mac beside iOS does not, because Apple has one apple, so
 * those two get `Mac` and `iOS` even though they are two families.
 *
 * The exception is `alwaysSuffix`, which iOS alone carries: a lone apple is a
 * Mac to every reader, so an iOS-only game keeps its `iOS` with nothing beside
 * it to be told apart from. A lone Mac keeps nothing, because the assumption
 * is already right.
 *
 * Order is the caller's, and every name comes back — blank entries aside — so
 * a caller can zip the result against its own list.
 */
export function platformGlyphs(list: readonly string[] | null | undefined): PlatformGlyph[] {
  const entries = (list ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ ...platformGlyph(name), suffix: familyOf(name)?.suffix ?? '' }));

  const drawn = new Map<PlatformGlyphName, number>();
  for (const entry of entries) {
    if (entry.glyph) drawn.set(entry.glyph, (drawn.get(entry.glyph) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const repeated = entry.glyph !== null && (drawn.get(entry.glyph) ?? 0) > 1;
    const always = familyOf(entry.name)?.alwaysSuffix === true;
    return { ...entry, suffix: repeated || always ? entry.suffix : '' };
  });
}

/**
 * Up to two genres, in their display names: `Roguelike, Action`.
 *
 * `genreDisplayName` returns null for a genre the app does not show (IGDB's
 * own categories are a mix of genres and marketing), and those are skipped
 * before the two are counted, so a game tagged Indie first still shows two real
 * genres. In the app's language: core has a table per language (wave 7).
 */
export function genres(list: readonly string[] | null | undefined): string | null {
  const language = languageStore.language();
  const names = (list ?? [])
    .map((genre) => genreDisplayName(genre, language))
    .filter((name): name is string => name !== null);

  return names.length === 0 ? null : names.slice(0, 2).join(', ');
}

// ---------------------------------------------------------------------------
// Genre labels and icons
// ---------------------------------------------------------------------------

/**
 * A genre where it starts a line: `Platformer`, `RPG`, `Adventure game`.
 *
 * The same display name the rows print (`genreDisplayName`), with a capital to
 * begin it. Those names are written for the middle of a sentence ("Which
 * platformer did you enjoy more?", "2017 · platformer"), so they are lower case
 * unless they are an acronym, and a whole list of them in the Ranking filter
 * read as a bug on the phone (docs/private/phone-feedback.md, entry 2). A row in a list
 * and a chip each start a line, so they get the capital; the words stay the
 * same, so a genre reads the same on the chip as on the rows it filters.
 *
 * Null for a genre the app does not name (Indie), which is also a genre the
 * filter does not offer. In the app's language: `Juego de plataformas` in Spanish.
 */
export function genreLabel(genre: string): string | null {
  const display = genreDisplayName(genre, languageStore.language());
  if (display === null || display === '') return null;
  return display.charAt(0).toUpperCase() + display.slice(1);
}

/**
 * The Lucide icons the genres draw, by the names lucide.dev uses.
 *
 * A union here rather than `IconName` from `@/ui`, because this file is loaded
 * by the node test suite and `src/ui/icon.tsx` imports React Native. Passing
 * one of these to `Icon` (in `src/ui/genre-icon.tsx`) is what checks that each
 * is in the icon set.
 */
export type GenreIconName =
  | 'compass'
  | 'joystick'
  | 'playing-cards'
  | 'swords'
  | 'axe'
  | 'castle'
  | 'music'
  | 'circle-dot'
  | 'brick-wall'
  | 'mouse-pointer-click'
  | 'puzzle'
  | 'circle-question-mark'
  | 'car'
  | 'timer'
  | 'wand-sparkles'
  | 'crosshair'
  | 'plane'
  | 'volleyball'
  | 'chess-knight'
  | 'shield'
  | 'hourglass'
  | 'message-square-text';

/**
 * One icon per genre the app names, keyed by IGDB's own genre name exactly as
 * `GENRE_DISPLAY_NAMES` in `@verso/core` is (docs/private/phone-feedback.md, entry 3).
 *
 * A proposal for Rafa's reaction (roadmap item 29), not a settled set: swapping
 * one is its line here plus its import in `src/ui/icon.tsx`. What the tests hold
 * it to: every genre with a display name has an icon, no two genres share one,
 * and nothing here is a genre the app does not name. None of them is an icon the
 * app already means something else by: `gamepad-2` is the games medium and a
 * platform with no mark, `book-open` is books, `trophy` is the Ranking tab,
 * `clock` is hours, `grid-2x2` is the grid view beside the filter chips.
 *
 * The drawing is in `src/ui/genre-icon.tsx`. The table is here, beside the
 * platform glyphs, for the reason those are: it is a rule, and the unit suite
 * can test a rule only where no component is imported.
 */
export const GENRE_ICONS: Readonly<Record<string, GenreIconName>> = {
  Adventure: 'compass',
  Arcade: 'joystick',
  'Card & Board Game': 'playing-cards',
  Fighting: 'swords',
  "Hack and slash/Beat 'em up": 'axe',
  MOBA: 'castle',
  Music: 'music',
  Pinball: 'circle-dot',
  Platform: 'brick-wall',
  'Point-and-click': 'mouse-pointer-click',
  Puzzle: 'puzzle',
  'Quiz/Trivia': 'circle-question-mark',
  Racing: 'car',
  'Real Time Strategy (RTS)': 'timer',
  'Role-playing (RPG)': 'wand-sparkles',
  Shooter: 'crosshair',
  Simulator: 'plane',
  Sport: 'volleyball',
  Strategy: 'chess-knight',
  Tactical: 'shield',
  'Turn-based strategy (TBS)': 'hourglass',
  'Visual Novel': 'message-square-text',
};

/**
 * The table above keyed by display name, so a lookup forgives what
 * `genreDisplayName` forgives: case, stray spaces, a curly apostrophe. Keyed by
 * the English name on purpose, whatever language the app is in: an icon belongs
 * to the genre, not to the word.
 */
const GENRE_ICONS_BY_DISPLAY_NAME: ReadonlyMap<string, GenreIconName> = new Map(
  Object.entries(GENRE_ICONS).flatMap(([genre, icon]) => {
    const display = genreDisplayName(genre, 'en');
    return display === null ? [] : [[display, icon] as const];
  }),
);

/** The icon for an IGDB genre name, or null for a genre the app does not name. */
export function genreIcon(genre: string): GenreIconName | null {
  const display = genreDisplayName(genre, 'en');
  return display === null ? null : (GENRE_ICONS_BY_DISPLAY_NAME.get(display) ?? null);
}
