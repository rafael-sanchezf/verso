/**
 * `app_open`, once per calendar day (specs/onboarding.md, "Events"): the rule
 * behind `use-app-open-event.ts`, with no storage and no clock of its own.
 *
 * The day is the device's own calendar day, the one `todayLocal` uses for a
 * finished date, so "once a day" means what the user means by it. The stamp
 * carries the user id, so a second account signed in on the same phone the
 * same day still logs its own open. Nothing in the stamp leaves the device.
 *
 * No React and no `react-native` import (`test/app-open.test.ts`).
 */

/** The AsyncStorage key holding the last day an open was logged, as `{userId}:{YYYY-MM-DD}`. */
export const APP_OPEN_KEY = 'events.app_open';

/** The local calendar day, `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function appOpenStamp(userId: string, day: string): string {
  return `${userId}:${day}`;
}

/** Whether today's open is still to be logged for this user. */
export function appOpenDue(stored: string | null | undefined, userId: string, day: string): boolean {
  return stored !== appOpenStamp(userId, day);
}
