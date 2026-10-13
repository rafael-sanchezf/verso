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
 */

export type AskMedium = 'game' | 'movie';

/** The large title, the site's words (copy.ts, `ask`). */
export function askQuestion(medium: AskMedium): string {
  return medium === 'movie' ? 'What do you want to watch?' : 'What do you feel like playing?';
}

/** The medium chip's word. */
export function askChipLabel(medium: AskMedium): string {
  return medium === 'movie' ? 'Movies' : 'Games';
}

/** What the note asks for, read once: a length the request filters on, and the trace's third line. */
export interface NoteConstraints {
  /** A length the person typed ("under 2 hours", "90 minutes"), in minutes. */
  maxMinutes: number | null;
  /** The third trace line the note earns, or null when it names nothing the rules know. */
  line: string | null;
}

/**
 * Words that name a constraint, in the order they win. Kept short on purpose:
 * a line the sheet writes from a guess is worse than the default line.
 */
const RULES: { test: RegExp; line: (medium: AskMedium) => string }[] = [
  { test: /\b(family|kids?|children|every age|all ages)\b/i, line: () => 'Keeping it for every age' },
  {
    test: /\b(friends?|co-?op|together|multiplayer|couch|partner|two of us)\b/i,
    line: (medium) => (medium === 'game' ? 'Keeping the co-op games' : 'Keeping it for a group'),
  },
  { test: /\b(scary|horror|spooky|creepy)\b/i, line: () => 'Keeping it scary' },
  { test: /\b(funny|comedy|laugh|light|fun|feel-?good|cozy|cosy|chill)\b/i, line: () => 'Keeping it light' },
  { test: /\b(short|quick)\b/i, line: () => 'Keeping it short' },
  { test: /\bclassics?\b/i, line: () => 'Keeping to the classics' },
  { test: /\b(recent|latest)\b/i, line: () => 'Keeping it recent' },
];

/** Words before a figure that make it a floor: "over 2 hours", "at least 90 minutes". */
const FLOOR_BEFORE = /\b(over|more than|longer than|at least|minimum)\s*$/;
/** Words after a figure that make it a floor: "2 hours or more", "2h+". */
const FLOOR_AFTER = /^\s*(\+|or more\b|or longer\b)/;

/** The app's own format first ("1 h 30", "2h30", "2 hours 15 min"), then hours, then minutes. */
const LENGTHS: { pattern: RegExp; minutes: (match: RegExpExecArray) => number }[] = [
  {
    pattern: /(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(\d{1,2})(?:\s*(?:m|min|mins|minute|minutes))?\b/,
    minutes: (match) => Number(match[1]) * 60 + Number(match[2]),
  },
  {
    pattern: /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/,
    minutes: (match) => Math.round(Number(match[1]!.replace(',', '.')) * 60),
  },
  { pattern: /(\d+)\s*(?:m|min|mins|minute|minutes)\b/, minutes: (match) => Number(match[1]) },
  { pattern: /\b(?:an|one) hour\b/, minutes: () => 60 },
];

/**
 * A ceiling in the note, as minutes: "under 2 hours", "2h", "1.5 hrs",
 * "1 h 30", "90 minutes", "an hour". Only a number with its unit counts; "2"
 * alone is not a length. A floor ("over 2 hours", "2 hours or more", "2h+")
 * is not a ceiling and gives null: the note still reaches the model, but SQL
 * is not asked to filter on it.
 */
export function readMaxMinutes(note: string): number | null {
  const text = note.toLowerCase();
  for (const { pattern, minutes } of LENGTHS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    if (FLOOR_BEFORE.test(before) || FLOOR_AFTER.test(after)) return null;
    const value = minutes(match);
    return value > 0 ? value : null;
  }
  return null;
}

/** "Under 2 hours", "Under 1 h 30", "Under 45 minutes". */
export function lengthLine(minutes: number): string {
  if (minutes < 60) return `Keeping it under ${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `Keeping it under ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `Keeping it under ${hours} h ${rest}`;
}

export function readNote(note: string, medium: AskMedium): NoteConstraints {
  const maxMinutes = readMaxMinutes(note);
  if (maxMinutes !== null) return { maxMinutes, line: lengthLine(maxMinutes) };
  const rule = RULES.find(({ test }) => test.test(note));
  return { maxMinutes: null, line: rule ? rule.line(medium) : null };
}

/** The three lines, in order. */
export function buildTrace(medium: AskMedium, note: string): [string, string, string] {
  const { line } = readNote(note, medium);
  return [
    'Reading your ranked list',
    medium === 'movie' ? "Leaving out what you've seen" : "Leaving out what you've played",
    line ?? (medium === 'movie' ? 'Keeping your watchlist first' : 'Keeping your backlog first'),
  ];
}

/**
 * The line under the picks: where they came from. "Your services" only when
 * the request carried them, since that is the only time the picks were held
 * to them.
 */
export function picksCaption(medium: AskMedium, onServices: boolean): string {
  if (medium === 'movie') {
    return onServices ? "From your watchlist and what's on your services" : 'From your watchlist and the catalog';
  }
  return 'From your backlog and the catalog';
}

/** The summary pill once the question is answered: the words, or "Anything" for a blank ask. */
export function summaryLabel(note: string): string {
  const trimmed = note.trim();
  return trimmed === '' ? 'Anything' : trimmed;
}
