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
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface IdentityProfile {
  displayName: string | null;
  username: string | null;
  /** ISO timestamp; `profiles.created_at`. */
  createdAt: string;
}

/** `Sep 2026` from an ISO timestamp, or null if it does not parse. */
export function joinedLabel(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
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
export function subtitleFor(profile: Pick<IdentityProfile, 'username' | 'createdAt'>): string {
  const joined = joinedLabel(profile.createdAt);
  const parts = [
    profile.username ? `@${profile.username}` : null,
    joined ? `joined ${joined}` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}
