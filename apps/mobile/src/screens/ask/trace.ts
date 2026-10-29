/**
 * The ask sheet's words: the question, the trace the sheet writes from the
 * request, and the caption under the picks. Pure, so test/ask-trace.test.ts
 * reads every line without a renderer.
 *
 * The trace is three lines, as the site's hero draws them (ask-moment.tsx;
 * movies-build.md, PR 3): the list it reads, what it leaves out, and a third
 * from the person's own words when they name a constraint, else the pool it
 * starts from. It names what the engine does with this request and nothing it
 * does not: "Keeping it under 2 hours" is only said when the note's length
 * became the request's `maxMinutes`, which is a hard filter in SQL; every other
 * third line names what the note asks of the model, which reads the note.
 *
 * The sheet's sentences are the dictionary's (`lists.ask`): what this returns
 * is a key, or a `TraceLine` (a key and its numbers), and the sheet says it
 * with `t`, so this module never loads `@/lib/i18n` (spanish-build.md).
 *
 * The rules read the note in English and in Spanish at once, whatever the
 * device's language (VER-204): a person may type either, and every rule tries
 * both word sets, so "menos de 2 horas" sets the same filter and line as
 * "under 2 hours". The note still reaches the model as typed.
 */

// Types only, erased at build.
import type { TranslationKey, TranslationVars } from '../../lib/i18n/dictionary';

export type AskMedium = 'game' | 'movie';

/** A line the sheet says: `t(key, vars)`. */
export interface TraceLine {
  key: TranslationKey;
  vars?: TranslationVars;
}

/**
 * The large title, the site's words (copy.ts, `ask`), in English.
 *
 * Kept for Home's ask button until wave 4 translates Home and switches it to
 * `t(askQuestionKey(medium))`; the sheet itself says `askQuestionKey`.
 */
export function askQuestion(medium: AskMedium): string {
  return medium === 'movie' ? 'What do you want to watch?' : 'What do you feel like playing?';
}

/** The large title's key, the site's words (copy.ts, `ask`). */
export function askQuestionKey(medium: AskMedium): TranslationKey {
  return medium === 'movie' ? 'lists.ask.question.movie' : 'lists.ask.question.game';
}

/** The medium chip's word. */
export function askChipLabel(medium: AskMedium): TranslationKey {
  return medium === 'movie' ? 'lists.ask.chip.movie' : 'lists.ask.chip.game';
}

/** What the note asks for, read once: a length the request filters on, and the trace's third line. */
export interface NoteConstraints {
  /** A length the person typed ("under 2 hours", "menos de 90 minutos"), in minutes. */
  maxMinutes: number | null;
  /** The third trace line the note earns, or null when it names nothing the rules know. */
  line: TraceLine | null;
}

/**
 * Spanish words as a whole-word pattern. `\b` only knows ASCII letters, so it
 * finds no edge after the á of "sofá" and finds one inside "película"; these
 * edges count accented letters and ñ as part of a word.
 */
function spanishWords(words: string): RegExp {
  const letter = '\\wáéíóúüñ';
  return new RegExp(`(?:^|[^${letter}])(?:${words})(?![${letter}])`, 'i');
}

/**
 * Words that name a constraint, in the order they win, each in English and
 * in Spanish. Kept short on purpose: a line the sheet writes from a guess is
 * worse than the default line.
 */
const RULES: { en: RegExp; es: RegExp; line: (medium: AskMedium) => TranslationKey }[] = [
  {
    en: /\b(family|kids?|children|every age|all ages)\b/i,
    es: spanishWords('familia|familiar(?:es)?|niñ[oa]s?|hij[oa]s|peques?|todas las edades|cualquier edad'),
    line: () => 'lists.ask.trace.everyAge',
  },
  {
    en: /\b(friends?|co-?op|together|multiplayer|couch|partner|two of us)\b/i,
    es: spanishWords('amig[oa]s?|cooperativ[oa]s?|junt[oa]s|multijugador|sof[aá]|pareja|novi[oa]|los dos|nosotr[oa]s dos'),
    line: (medium) => (medium === 'game' ? 'lists.ask.trace.coop' : 'lists.ask.trace.group'),
  },
  {
    en: /\b(scary|horror|spooky|creepy)\b/i,
    es: spanishWords('miedo|terror|horror|escalofriantes?|espeluznantes?|aterrador(?:a|es|as)?'),
    line: () => 'lists.ask.trace.scary',
  },
  {
    en: /\b(funny|comedy|laugh|light|fun|feel-?good|cozy|cosy|chill)\b/i,
    es: spanishWords('divertid[oa]s?|comedias?|re[ií]r(?:me|nos)?|risas?|liger[oa]s?|acogedor(?:a|es|as)?|relajad[oa]s?|tranquil[oa]s?'),
    line: () => 'lists.ask.trace.light',
  },
  { en: /\b(short|quick)\b/i, es: spanishWords('cort[oa]s?|r[aá]pid[oa]s?'), line: () => 'lists.ask.trace.short' },
  { en: /\bclassics?\b/i, es: spanishWords('cl[aá]sic[oa]s?'), line: () => 'lists.ask.trace.classics' },
  {
    en: /\b(recent|latest)\b/i,
    es: spanishWords('recientes?|lo [uú]ltimo|estrenos?'),
    line: () => 'lists.ask.trace.recent',
  },
];

/**
 * Words before a figure that make it a floor: "over 2 hours", "at least 90
 * minutes", "no less than 2 hours"; "más de 2 horas", "al menos 90 minutos",
 * "no menos de 2 horas".
 */
const FLOOR_BEFORE =
  /\b(over|more than|longer than|at least|minimum|not? (?:less|shorter) than|m[aá]s (?:de|que)|m[aá]s larg[oa] (?:de|que)|al menos|por lo menos|m[ií]nimo|no menos (?:de|que))\s*$/;
/**
 * A floor's words after "no" or "not" keep the figure a ceiling, as "under"
 * does: "no more than 2 hours", "not longer than 90 minutes"; "no más de 2 horas".
 */
const CEILING_BEFORE = /\bnot? (?:over|more than|longer than|m[aá]s (?:de|que)|m[aá]s larg[oa] (?:de|que))\s*$/;
/** Words after a figure that make it a floor: "2 hours or more", "2 horas o más", "2h+". */
const FLOOR_AFTER = /^\s*(\+|or more\b|or longer\b|o m[aá]s\b)/;

/** A unit of hours or of minutes, in either language: "2 hours", "2 horas", "90 min", "90 minutos". */
const HOURS = '(?:h|hr|hrs|hour|hours|hora|horas)';
const MINUTES = '(?:m|min|mins|minute|minutes|minuto|minutos)';

/**
 * The app's own format first ("1 h 30", "2h30", "2 hours 15 min", "2 hours and
 * 15 minutes"), then hours and a half, hours, minutes, and the hour in words.
 * After "and" or "y" the minutes need their unit, so "2 hours and 2 friends"
 * is 2 hours.
 */
const LENGTHS: { pattern: RegExp; minutes: (match: RegExpExecArray) => number }[] = [
  {
    pattern: new RegExp(
      `(\\d+)\\s*${HOURS}\\s*(?:(\\d{1,2})(?:\\s*${MINUTES})?|(?:and|y)\\s+(\\d{1,2})\\s*${MINUTES})\\b`,
    ),
    minutes: (match) => Number(match[1]) * 60 + Number(match[2] ?? match[3]),
  },
  {
    pattern: new RegExp(`(\\d+)(?:\\s*${HOURS}\\s+(?:and a half|y media)| and a half\\s*${HOURS})\\b`),
    minutes: (match) => Number(match[1]) * 60 + 30,
  },
  {
    pattern: new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${HOURS}\\b`),
    minutes: (match) => Math.round(Number(match[1]!.replace(',', '.')) * 60),
  },
  { pattern: new RegExp(`(\\d+)\\s*${MINUTES}\\b`), minutes: (match) => Number(match[1]) },
  { pattern: /\b(?:(?:an |one )?hour and a half|one and a half hours?|(?:una )?hora y media)\b/, minutes: () => 90 },
  { pattern: /\b(?:half an hour|(?:a )?half[- ]hour|media hora)\b/, minutes: () => 30 },
  { pattern: /\b(?:(?:an|one) hour|una hora)\b/, minutes: () => 60 },
];

/**
 * A ceiling in the note, as minutes: "under 2 hours", "no more than 2 hours",
 * "2h", "1.5 hrs", "1 h 30", "90 minutes", "an hour", "half an hour", "menos
 * de 2 horas", "no más de 2 horas", "máximo 90 minutos", "una hora", "hora y
 * media". Only a number with its unit counts; "2" alone is not a length. A
 * floor ("over 2 hours", "no less than 2 hours", "2 hours or more", "2h+") is
 * not a ceiling and gives null: the note still reaches the model, but SQL is
 * not asked to filter on it.
 */
export function readMaxMinutes(note: string): number | null {
  const text = note.toLowerCase();
  for (const { pattern, minutes } of LENGTHS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const floorBefore = FLOOR_BEFORE.test(before) && !CEILING_BEFORE.test(before);
    if (floorBefore || FLOOR_AFTER.test(after)) return null;
    const value = minutes(match);
    return value > 0 ? value : null;
  }
  return null;
}

/** "Under 2 hours", "Under 1 h 30", "Under 45 minutes". */
export function lengthLine(minutes: number): TraceLine {
  if (minutes < 60) return { key: 'lists.ask.trace.underMinutes', vars: { minutes } };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return { key: hours === 1 ? 'lists.ask.trace.underHour' : 'lists.ask.trace.underHours', vars: { hours } };
  return { key: 'lists.ask.trace.underHoursMinutes', vars: { hours, minutes: rest } };
}

export function readNote(note: string, medium: AskMedium): NoteConstraints {
  const maxMinutes = readMaxMinutes(note);
  if (maxMinutes !== null) return { maxMinutes, line: lengthLine(maxMinutes) };
  const rule = RULES.find(({ en, es }) => en.test(note) || es.test(note));
  return { maxMinutes: null, line: rule ? { key: rule.line(medium) } : null };
}

/** The three lines, in order. */
export function buildTrace(medium: AskMedium, note: string): [TraceLine, TraceLine, TraceLine] {
  const { line } = readNote(note, medium);
  return [
    { key: 'lists.ask.trace.reading' },
    { key: medium === 'movie' ? 'lists.ask.trace.leavingOutSeen' : 'lists.ask.trace.leavingOutPlayed' },
    line ?? { key: medium === 'movie' ? 'lists.ask.trace.watchlistFirst' : 'lists.ask.trace.backlogFirst' },
  ];
}

/**
 * The line under the picks: where they came from. "Your services" only when
 * the request carried them, since that is the only time the picks were held
 * to them.
 */
export function picksCaption(medium: AskMedium, onServices: boolean): TranslationKey {
  if (medium === 'movie') {
    return onServices ? 'lists.ask.caption.movieServices' : 'lists.ask.caption.movie';
  }
  return 'lists.ask.caption.game';
}

/**
 * The summary pill once the question is answered: the person's words, or
 * null for a blank ask, which the sheet says as "Anything".
 */
export function summaryLabel(note: string): string | null {
  const trimmed = note.trim();
  return trimmed === '' ? null : trimmed;
}
