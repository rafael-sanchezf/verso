/**
 * The Watchlist grid's zoom: three posters across by default, a pinch out to
 * two large ones, a pinch in to the dense panel of five (frames `Watchlist`
 * 261:119, `Watchlist · Zoomed` 274:79, `Watchlist · Zoomed out` 280:106; the
 * build's default 2: the counts are 2, 3 and 5, the thresholds 0.8 and 1.25).
 *
 * One step per pinch, whatever its size: a pinch that ends past 1.25 is one
 * step in, past 0.8 the other way one step out, anything between is nothing.
 *
 * No React; relative imports only (`test/film.test.ts`).
 */

export type Columns = 2 | 3 | 5;

export const COLUMN_STEPS: readonly Columns[] = [2, 3, 5];
export const DEFAULT_COLUMNS: Columns = 3;

export const ZOOM_IN_SCALE = 1.25;
export const ZOOM_OUT_SCALE = 0.8;

/** Kept per user on the device, so a shared phone keeps each person's zoom. */
export function columnsStorageKey(userId: string | null): string {
  return userId ? `verso.watchlist.columns.${userId}` : 'verso.watchlist.columns';
}

export function parseColumns(raw: string | null | undefined): Columns {
  const value = Number(raw);
  return (COLUMN_STEPS as readonly number[]).includes(value) ? (value as Columns) : DEFAULT_COLUMNS;
}

/** The column count after a pinch that ended at `scale`. */
export function columnsAfterPinch(current: Columns, scale: number): Columns {
  const index = COLUMN_STEPS.indexOf(current);
  if (scale >= ZOOM_IN_SCALE) return COLUMN_STEPS[Math.max(0, index - 1)]!;
  if (scale <= ZOOM_OUT_SCALE) return COLUMN_STEPS[Math.min(COLUMN_STEPS.length - 1, index + 1)]!;
  return current;
}

/** The gap between posters at each count, as the three frames draw them. */
export function gapFor(columns: Columns): number {
  return columns === 2 ? 16 : columns === 3 ? 10 : 8;
}

/** One poster's width for a row of `columns` inside 16 pt side margins. */
export function cardWidth(screenWidth: number, columns: Columns): number {
  const inner = screenWidth - 32 - gapFor(columns) * (columns - 1);
  return Math.max(1, Math.floor(inner / columns));
}
