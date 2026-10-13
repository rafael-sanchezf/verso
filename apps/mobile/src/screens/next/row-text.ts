/**
 * The two- and three-line text chains the Backlog and Upcoming rows show.
 *
 * Pulled out of the row components so the fallback chains
 * docs/design/specs/next.md spells out ("dropping what is missing") are
 * testable without rendering anything native. Every function here follows
 * ui-principles rule 9: a missing fact drops out of the chain, it is never
 * shown as an empty line or an invented value.
 */

import type { EntryRow } from '@verso/api';

// Relative, not the `@/` alias: `apps/mobile/vitest.config.ts` (the shell's,
// not this screen's to edit) has no path-alias resolution, and this module is
// imported directly by test/next-row-text.test.ts.
import { personalDate, platforms as formatPlatforms, playtime, timeToBeat } from '../../lib/format';
// A type only, erased at build: the sentences stay in the dictionary and the
// row says them, so this module never loads `@/lib/i18n` (spanish-build.md).
import type { TranslationKey } from '../../lib/i18n/dictionary';

/**
 * A local copy of `@/ui/text`'s `joinParts`, rather than importing it: that
 * module pulls in `react-native`, which the vitest suite this file is tested
 * under deliberately never loads (vitest.config.ts, "no rendering"). Same
 * behavior — drop the missing parts of a fallback chain, join what is left.
 */
function joinChain(parts: readonly (string | null)[], separator: string): string | null {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length === 0 ? null : present.join(separator);
}

/**
 * Backlog line two: "{played-on platforms joined by ' · '} · ~{time to beat}",
 * dropping whichever half is missing.
 *
 * An entry with nothing recorded as played on, which is most of a backlog,
 * falls back to the catalog's first platform (next.md, line 13), so the row
 * still says where the game is playable.
 */
export function backlogSubtitle(entry: EntryRow): string | null {
  const played = entry.entry.playedPlatforms;
  const platformNames = played.length > 0 ? played : entry.platforms.slice(0, 1);
  const platformsPart = formatPlatforms(platformNames, ' · ');
  const timePart = timeToBeat(entry.timeToBeat.normallySeconds);
  return joinChain([platformsPart, timePart], ' · ');
}

/**
 * Backlog line three, as the row says it: a sentence from the dictionary with
 * its date (`Started {date}`, `Added {date}`), or words `format.ts` already
 * wrote in the app's language (`14 h played`).
 */
export type BacklogDetail = { key: TranslationKey; date: string } | { text: string };

/**
 * Backlog line three: the first of "Started {date}", "{hours} played",
 * "Added {date}" that has something to say. `added_at` is never null on a
 * real row, so this only returns null for a fixture built without one.
 */
export function backlogDetail(entry: EntryRow, now: Date = new Date()): BacklogDetail | null {
  const started = personalDate(entry.entry.startedAt, now);
  if (started) return { key: 'lists.next.started', date: started };

  const played = playtime(entry.entry.playtimeMinutes);
  if (played) return { text: played };

  const added = personalDate(entry.entry.addedAt, now);
  if (added) return { key: 'lists.next.added', date: added };

  return null;
}

/**
 * Upcoming's one subtitle line: the catalog's platforms, joined the way Next
 * joins them (` · `), at most three (next.md, line 21). A game that is not out
 * has been played nowhere, so the entry has no list of its own to put first.
 */
export function upcomingSubtitle(entry: EntryRow): string | null {
  return formatPlatforms(entry.platforms, ' · ');
}

/**
 * The sub row's count, as the key the row says with `{ count }`: `3 games`,
 * and `1 game` when there is one.
 *
 * next.md writes it as "{n} games", which is right for every number the frames
 * drew and wrong for the one they did not. Starting a game from a two-item
 * backlog leaves "1 games" on screen.
 */
export function gameCountKey(count: number): TranslationKey {
  return count === 1 ? 'lists.next.games.one' : 'lists.next.games.other';
}
