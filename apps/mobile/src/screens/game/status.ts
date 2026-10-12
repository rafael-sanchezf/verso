/**
 * The sentence under the buttons, and the label on the button beside "I
 * finished this".
 *
 * Both are the same question asked twice — what is this game to you right now?
 * — so they live in one file and are tested together. Both are pure.
 *
 * The status line renders only when there is an entry: a game you do not track
 * has no status to report, and rule 20 says a row with nothing in it does not
 * draw. Every part of the sentence drops out on its own when the fact behind it
 * is missing, which is why each branch builds a list and joins it rather than
 * interpolating a template with a hole in it.
 *
 * A game that is not out yet gets two actions and no more: into the backlog,
 * and out of the library (phone feedback entry 10, polish list item 1). Nobody
 * is playing GTA 6 and nobody has finished it, so the buttons and the Change
 * menu stop offering either, the same rule the add sheet applies through
 * `addSheetRows` (search/add-options.ts). Out or not is `releaseState` from
 * `@verso/api`, the rule Coming up and Upcoming apply, so the page can never
 * lock down a game those lists would not call unreleased.
 */

import { hours, personalDate } from '../../lib/format';

import type { Entry, ReleaseState } from '@verso/api';

/** The line under the actions row: a dot, a sentence, and "Change". */
export interface StatusLine {
  text: string;
  /** The dot is the brand text color while a game is being played, quiet otherwise. */
  playing: boolean;
}

/**
 * How the hours read inside the playing line: `14 h on Steam`, `14 h by hand`.
 *
 * Data honesty (ui-principles): an imported figure says where it came from. A
 * hand-entered one says so too rather than reading as if the app measured it.
 */
function hoursPart(entry: Entry): string | null {
  const played = hours(entry.playtimeMinutes);
  if (played === null) return null;
  return entry.playtimeSource === 'steam' ? `${played} on Steam` : `${played} by hand`;
}

/** The status sentence, or null when the caller does not track this game. */
export function statusLine(entry: Entry | null, now: Date = new Date()): StatusLine | null {
  if (!entry) return null;

  switch (entry.status) {
    case 'playing': {
      const since = personalDate(entry.startedAt, now);
      const parts = [since ? `Playing since ${since}` : 'Playing', hoursPart(entry)];
      return { text: parts.filter(Boolean).join(' · '), playing: true };
    }
    case 'backlog': {
      const since = personalDate(entry.addedAt, now);
      return {
        text: since ? `In your backlog since ${since}` : 'In your backlog',
        playing: false,
      };
    }
    case 'played': {
      const finished = personalDate(entry.finishedAt, now);
      return { text: finished ? `Finished ${finished}` : 'Played', playing: false };
    }
    case 'dropped':
      return { text: 'Dropped', playing: false };
  }
}

/** The four statuses, in the order the change-status sheet offers them. */
export const STATUS_CHOICES = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'playing', label: 'Playing' },
  { status: 'played', label: 'Played' },
  { status: 'dropped', label: 'Dropped' },
] as const;

export type StatusChoice = (typeof STATUS_CHOICES)[number];

/**
 * The statuses the Change menu offers for a game in this release state: all
 * four once it is out, Backlog alone before. Removing it is offered beside
 * these either way; that is the page's, not a status.
 */
export function statusChoices(release: ReleaseState): readonly StatusChoice[] {
  return release.released ? STATUS_CHOICES : STATUS_CHOICES.filter(({ status }) => status === 'backlog');
}

/** The primary button: "I finished this", or the score once there is one. */
export interface PrimaryAction {
  label: string;
  disabled: boolean;
}

/**
 * Null when there is no primary button: a game that is not out cannot be
 * finished. A ranked one still shows its score, which is a fact rather than an
 * offer.
 */
export function primaryAction(ranking: { score: number } | null, release: ReleaseState): PrimaryAction | null {
  if (ranking) return { label: `Ranked · ${ranking.score.toFixed(1)}`, disabled: true };
  if (!release.released) return null;
  return { label: 'I finished this', disabled: false };
}

/**
 * What the second button does, which is always the next thing this game could
 * become.
 *
 * `move` once it is ranked, because from there the only thing left to change is
 * where it sits. `rank` for a game you have played and never ranked, which is
 * the one case that opens the log flow without marking it finished a second
 * time. Otherwise the core loop is one tap away (rule 10): into the backlog, or
 * out of the backlog and into your hands.
 *
 * A game that is not out only ever goes into the backlog: "Add to backlog"
 * from anywhere else, and no button at all once it is there, since the one
 * other thing left (removing it) is in the Change menu.
 */
export type SecondaryKind = 'backlog' | 'play' | 'rank' | 'move';

export interface SecondaryAction {
  label: string;
  kind: SecondaryKind;
}

export function secondaryAction(
  entry: Entry | null,
  ranked: boolean,
  release: ReleaseState,
): SecondaryAction | null {
  if (ranked) return { label: 'Move in Ranking', kind: 'move' };
  if (!release.released) {
    return entry?.status === 'backlog' ? null : { label: 'Add to backlog', kind: 'backlog' };
  }
  if (!entry) return { label: 'Add to backlog', kind: 'backlog' };

  switch (entry.status) {
    case 'backlog':
      return { label: 'Start playing', kind: 'play' };
    case 'played':
      return { label: 'Rank it', kind: 'rank' };
    case 'playing':
    case 'dropped':
      return { label: 'Add to backlog', kind: 'backlog' };
  }
}
