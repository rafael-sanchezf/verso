/**
 * Hours in the field, minutes in the column.
 *
 * `user_entries.playtime_minutes` is minutes because Steam reports minutes and
 * an import must not round someone's playtime away. A person thinks in hours
 * and types "14" or "14.5", so the two sheets that take a playtime convert on
 * the way in and back on the way out.
 *
 * Both directions are here, pure and tested, because a conversion that is out
 * by a factor of sixty looks entirely plausible on screen.
 */

/** Minutes as the hours a person would type back: `845` becomes `14.1`. */
export function hoursFieldValue(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return '';
  }

  // One decimal: enough to say "half an hour", not so much that a Steam figure
  // comes back as 14.0833333.
  const hours = Math.round((minutes / 60) * 10) / 10;
  return String(hours);
}

/**
 * What the field says, as whole minutes, or null when it is not a number.
 *
 * Null is both "clear this" and "not a number", which is the same thing to the
 * writer: `logPlaytime(client, id, null)` erases the figure and its source.
 * A comma is a decimal point, because some keypads give one.
 */
export function minutesFromField(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;

  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || hours < 0) return null;
  return Math.round(hours * 60);
}
