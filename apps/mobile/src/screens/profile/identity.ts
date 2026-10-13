/**
 * The subtitle for the Profile identity row (docs/design/specs/profile.md,
 * "Data"). The name line is `nameLine` in model.ts since the joint Profile:
 * the display name, else the handle, else "Set your name", and the email's
 * local part never stands in for a name again (profile-brief, the page).
 *
 * Pure and free of React Native imports on purpose, so the fallback chain is
 * unit tested directly (apps/mobile/test) rather than only eyeballed on the
 * simulator: `getMyProfile` seeds nothing for an email sign-up and seeds a
 * name and picture but never a username for a Google one, so every branch
 * here is a real V0 state, not a hypothetical edge case.
 *
 * Takes a minimal local shape rather than `Profile` from `@verso/api` so this
 * module has no dependency, even a type-only one, on the api package.
 *
 * The words are the dictionary's (`profile.page.joined`, `profile.calendar`):
 * the screen passes its `t` as `say`, so this module never loads the i18n
 * binding, which needs the device.
 */

import type { TranslationKey, TranslationVars } from '../../lib/i18n/dictionary';

type Say = (key: TranslationKey, vars?: TranslationVars) => string;

/** The short month names, January first, as keys. */
const MONTHS: readonly TranslationKey[] = [
  'profile.calendar.monthsShort.jan',
  'profile.calendar.monthsShort.feb',
  'profile.calendar.monthsShort.mar',
  'profile.calendar.monthsShort.apr',
  'profile.calendar.monthsShort.may',
  'profile.calendar.monthsShort.jun',
  'profile.calendar.monthsShort.jul',
  'profile.calendar.monthsShort.aug',
  'profile.calendar.monthsShort.sep',
  'profile.calendar.monthsShort.oct',
  'profile.calendar.monthsShort.nov',
  'profile.calendar.monthsShort.dec',
];

export interface IdentityProfile {
  displayName: string | null;
  username: string | null;
  /** ISO timestamp; `profiles.created_at`. */
  createdAt: string;
}

/** `Sep 2026` (`sept 2026`) from an ISO timestamp, or null if it does not parse. */
export function joinedLabel(createdAt: string, say: Say): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return say('profile.calendar.monthYear', { month: say(MONTHS[date.getMonth()]!), year: date.getFullYear() });
}

/**
 * The second line: `@{username} · joined {Mon YYYY}`, or the joined date
 * alone without a username (rule 9: no invented handle).
 *
 * A small local fallback-chain join rather than `joinParts` from `@/ui/text`:
 * that module pulls in `react-native`, which would stop this file's tests
 * running under vitest's plain node environment (see test/format.test.ts's
 * vitest.config.ts comment). The two do the same thing.
 */
export function subtitleFor(profile: Pick<IdentityProfile, 'username' | 'createdAt'>, say: Say): string {
  const joined = joinedLabel(profile.createdAt, say);
  const parts = [
    profile.username ? `@${profile.username}` : null,
    joined ? say('profile.page.joined', { date: joined }) : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}
