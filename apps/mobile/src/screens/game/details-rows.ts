/**
 * The Details block, as a list of label-and-value rows.
 *
 * Rule 20, hide what is empty: there are no "Started: add" rows and no empty
 * values. A row exists because the fact behind it exists, which makes this a
 * filter over what the page happens to know rather than a fixed table with
 * holes — and it is why the whole block is computed here, where it can be
 * tested, instead of as nine conditional JSX branches.
 *
 * Rule 9, show what you know: Released falls back from the full date to the
 * year and then disappears, because IGDB's date precision is not stored and
 * printing a day the catalog does not have would be inventing one.
 */

import { fullDate, hours, personalDate, timeToBeat } from '../../lib/format';

import type { GamePage, PlayerCount } from '@verso/api';

/** One row: a quiet label on the left, the value on the right. */
export interface DetailRow {
  key: string;
  label: string;
  value: string;
  /**
   * Rows that open something when tapped. Time to beat carries the chevron
   * inside its value (`~22 h ›`), as the frame draws it; Hours does not, and
   * opens the same sheet Home's long press does.
   */
  action?: 'time-to-beat' | 'hours';
  /** Notes wrap under their label instead of sitting on the right. */
  wrap?: boolean;
}

/**
 * A player count with thousands separated: `24,318`.
 *
 * By hand rather than through `Intl`, for the reason `format.ts` gives: a
 * device set to another language should not produce a number the rest of the
 * (English) interface disagrees with.
 */
export function groupDigits(value: number): string {
  const whole = Math.max(0, Math.round(value));
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The playtime row's value: `14 h · Steam`, `14 h · entered by hand`. */
function playedFor(minutes: number | null, source: string | null): string | null {
  const played = hours(minutes);
  if (played === null) return null;
  return `${played} · ${source === 'steam' ? 'Steam' : 'entered by hand'}`;
}

/**
 * The three figures behind the Time to beat row, for the alert that opens when
 * it is tapped. Each line is dropped when IGDB has no average for it.
 */
export function timeToBeatBreakdown(page: GamePage): string[] {
  const ttb = page.game?.timeToBeat;
  if (!ttb) return [];

  return (
    [
      ['Rushed', ttb.hastilySeconds],
      ['Normally', ttb.normallySeconds],
      ['Completely', ttb.completelySeconds],
    ] as const
  )
    .map(([label, seconds]) => {
      const figure = timeToBeat(seconds);
      return figure === null ? null : `${label}  ${figure}`;
    })
    .filter((line): line is string => line !== null);
}

/**
 * Every Details row this game has, in the order the spec lists them: the
 * catalog's facts, then the live Steam figure, then the caller's own.
 */
export function detailRows(
  page: GamePage,
  playerCount: PlayerCount | null,
  now: Date = new Date(),
): DetailRow[] {
  const rows: DetailRow[] = [];
  const entry = page.entry;

  const released = fullDate(page.releaseDate) ?? (page.year === null ? null : String(page.year));
  if (released) rows.push({ key: 'released', label: 'Released', value: released });

  const beat = timeToBeat(page.game?.timeToBeat.normallySeconds ?? null);
  if (beat) {
    rows.push({ key: 'time-to-beat', label: 'Time to beat', value: `${beat} ›`, action: 'time-to-beat' });
  }

  if (entry) {
    const added = personalDate(entry.addedAt, now);
    if (added) rows.push({ key: 'added', label: 'Added', value: added });
  }

  if (playerCount) {
    rows.push({
      key: 'playing-now',
      label: 'Playing now',
      value: `${groupDigits(playerCount.players)} on Steam`,
    });
  }

  if (entry) {
    const started = personalDate(entry.startedAt, now);
    if (started) rows.push({ key: 'started', label: 'Started', value: started });

    const finished = personalDate(entry.finishedAt, now);
    if (finished) rows.push({ key: 'finished', label: 'Finished', value: finished });

    const played = playedFor(entry.playtimeMinutes, entry.playtimeSource);
    if (played) rows.push({ key: 'hours', label: 'Hours', value: played, action: 'hours' });

    const notes = entry.notes?.trim();
    if (notes) rows.push({ key: 'notes', label: 'Notes', value: notes, wrap: true });
  }

  return rows;
}
