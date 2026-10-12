/**
 * What `DateField` takes and gives, and the date arithmetic both of its
 * platforms share.
 *
 * The value is a string because that is what the database hands the screens:
 * `purchased_at` and `finished_at` are `YYYY-MM-DD`, `started_at` is a full
 * timestamp. `DateField` shows either as a calendar day in the device's time
 * zone and always gives back `YYYY-MM-DD`, which is what a person means when
 * they pick a day ("I bought it on the 24th", not "at 04:00 UTC").
 *
 * The same care `format.ts` and the details sheet take: `new Date('2026-09-24')`
 * is UTC midnight, which is the evening of the 23rd in New York, so a
 * date-only string is read as local parts, never through the parser.
 */

export interface DateFieldProps {
  /** The row's name, and the field's accessible name. */
  label: string;
  /** `YYYY-MM-DD` or an ISO timestamp; null when unset. */
  value: string | null;
  /** A local `YYYY-MM-DD`, or null when cleared. */
  onChange: (value: string | null) => void;
  /** The latest day that can be picked, `YYYY-MM-DD`: "today" for a day that has happened. */
  max?: string;
  /** Show a Clear control while there is a value (Started and Purchased, not Finished). */
  clearable?: boolean;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A stored value as a local `Date`, or null for null or an unreadable string. */
export function localDateOf(value: string | null | undefined): Date | null {
  if (!value) return null;

  const parts = DATE_ONLY.exec(value);
  if (parts) {
    const [, year, month, day] = parts;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A `Date`'s local calendar day as `YYYY-MM-DD`. */
export function dateOnly(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A stored value as the `YYYY-MM-DD` a date input shows, or null. */
export function dateOnlyOf(value: string | null | undefined): string | null {
  const date = localDateOf(value);
  return date ? dateOnly(date) : null;
}
