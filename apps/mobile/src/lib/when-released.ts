/**
 * A write that only happens for a game that is out (phone feedback entry 10).
 *
 * Marking a game Playing or played says something happened to it, and nothing
 * has happened to a game that is not out yet. The screens that offer those
 * writes in one tap (Search's Playing and add-many intents, the Next tab's
 * Start button) already hide them for an unreleased game where they can see a
 * date; this is the last check, made at the moment of writing, against the
 * catalog rather than against whatever a list had cached. Out or not is
 * `releaseState`, the rule the add sheet, Coming up and Upcoming apply.
 *
 * No React, no `react-native` and no `@/` import, so it runs in the Vitest node
 * environment (`apps/mobile/test/when-released.test.ts`). The caller hands in
 * the client, which is what keeps `lib/supabase.ts` out of the test.
 */

import { releaseDates, releaseState, type Client } from '@verso/api';

/** What the guarded write came to. */
export type WhenReleased<T> = { released: true; value: T } | { released: false };

export interface WhenReleasedOptions {
  /** Treat this `YYYY-MM-DD` as today. For tests; the default is the device's own date. */
  today?: string;
}

/** The catalog's release date for one item, or null when it has none. */
export async function releaseDateOf(client: Client, mediaItemId: string): Promise<string | null> {
  const [row] = await releaseDates(client, [mediaItemId]);
  return row?.releaseDate ?? null;
}

/**
 * Run `write` only when the release date `readReleaseDate` answers with says
 * the game is out. An undated game counts as out, as `releaseState` has it. A
 * failed read fails the whole call, so nothing is written on a guess.
 */
export async function whenReleased<T>(
  readReleaseDate: () => Promise<string | null | undefined>,
  write: () => Promise<T>,
  options: WhenReleasedOptions = {},
): Promise<WhenReleased<T>> {
  const date = await readReleaseDate();
  if (!releaseState(date, options).released) return { released: false };

  return { released: true, value: await write() };
}
