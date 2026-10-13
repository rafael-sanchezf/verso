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
import type { TranslationKey } from '../../lib/i18n/dictionary';

import type { Phrase } from './phrase';

import type { Entry, ReleaseState } from '@verso/api';

/**
 * The line under the actions row: a dot, a sentence, and "Change".
 *
 * The sentence is its parts, said and joined with ` · ` by the row (the
 * Spanish wave: no sentence in a module the node tests load).
 */
export interface StatusLine {
  parts: readonly Phrase[];
  /** The dot is the brand text color while a game is being played, quiet otherwise. */
  playing: boolean;
}

/**
 * How the hours read inside the playing line: `14 h on Steam`, `14 h by hand`.
 *
 * Data honesty (ui-principles): an imported figure says where it came from. A
 * hand-entered one says so too rather than reading as if the app measured it.
 */
function hoursPart(entry: Entry): Phrase | null {
  const played = hours(entry.playtimeMinutes);
  if (played === null) return null;
  return {
    key: entry.playtimeSource === 'steam' ? 'browse.game.status.hoursOnSteam' : 'browse.game.status.hoursByHand',
    vars: { hours: played },
  };
}

/** The status sentence, or null when the caller does not track this game. */
export function statusLine(entry: Entry | null, now: Date = new Date()): StatusLine | null {
  if (!entry) return null;

  switch (entry.status) {
    case 'playing': {
      const since = personalDate(entry.startedAt, now);
      const parts: (Phrase | null)[] = [
        since
          ? { key: 'browse.game.status.playingSince', vars: { date: since } }
          : { key: 'browse.game.status.playing' },
        hoursPart(entry),
      ];
      return { parts: parts.filter((part): part is Phrase => part !== null), playing: true };
    }
    case 'backlog': {
      const since = personalDate(entry.addedAt, now);
      return {
        parts: [
          since ? { key: 'browse.game.status.backlogSince', vars: { date: since } } : { key: 'browse.game.status.backlog' },
        ],
        playing: false,
      };
    }
    case 'played': {
      const finished = personalDate(entry.finishedAt, now);
      return {
        parts: [
          finished ? { key: 'browse.game.status.finishedOn', vars: { date: finished } } : { key: 'browse.game.status.played' },
        ],
        playing: false,
      };
    }
    case 'dropped':
      return { parts: [{ key: 'browse.game.status.dropped' }], playing: false };
  }
}

/** The four statuses, in the order the change-status sheet offers them. */
export const STATUS_CHOICES = [
  { status: 'backlog', label: 'browse.game.statusChoices.backlog' },
  { status: 'playing', label: 'browse.game.statusChoices.playing' },
  { status: 'played', label: 'browse.game.statusChoices.played' },
  { status: 'dropped', label: 'browse.game.statusChoices.dropped' },
] as const satisfies readonly { status: string; label: TranslationKey }[];

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
  label: Phrase;
  disabled: boolean;
}

/**
 * Null when there is no primary button: a game that is not out cannot be
 * finished. A ranked one still shows its score, which is a fact rather than an
 * offer.
 */
export function primaryAction(ranking: { score: number } | null, release: ReleaseState): PrimaryAction | null {
  if (ranking) {
    return { label: { key: 'browse.game.actions.ranked', vars: { score: ranking.score.toFixed(1) } }, disabled: true };
  }
  if (!release.released) return null;
  return { label: { key: 'browse.game.actions.finished' }, disabled: false };
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
  label: TranslationKey;
  kind: SecondaryKind;
}

export function secondaryAction(
  entry: Entry | null,
  ranked: boolean,
  release: ReleaseState,
): SecondaryAction | null {
  if (ranked) return { label: 'browse.game.actions.moveInRanking', kind: 'move' };
  if (!release.released) {
    return entry?.status === 'backlog' ? null : { label: 'browse.game.actions.addToBacklog', kind: 'backlog' };
  }
  if (!entry) return { label: 'browse.game.actions.addToBacklog', kind: 'backlog' };

  switch (entry.status) {
    case 'backlog':
      return { label: 'browse.game.actions.startPlaying', kind: 'play' };
    case 'played':
      return { label: 'browse.game.actions.rankIt', kind: 'rank' };
    case 'playing':
    case 'dropped':
      return { label: 'browse.game.actions.addToBacklog', kind: 'backlog' };
  }
}
