/**
 * The review's Done: one `finishInsertion` per new game, in the order
 * `batchFinishArgs` gives (tier by tier, best position first), each carrying
 * its own answers and its `placedBy` (specs/batch-session.md, "The review").
 *
 * Every answer of the session reaches the database here and nowhere else,
 * exactly as the log flow writes its one game: the placement and the game's
 * comparisons land in one transaction per game.
 *
 * Order matters inside a tier: each position is right for the tier as the
 * earlier calls left it. So when a call fails, the rest of that tier waits for
 * the retry instead of landing one place off; the other tiers do not depend on
 * it and go on. A retry runs only what is not written yet.
 *
 * A call can land and still fail on the way back (a dropped connection after
 * the commit). Its retry then hits `23505`, "already ranked", and that is
 * counted as written: the game is placed, and nothing was duplicated, because
 * the refused call rolled back its own comparisons with it.
 *
 * Pure apart from the `write` it is given, so the bookkeeping is tested in node
 * (`apps/mobile/test/session-writes.test.ts`).
 */

import type { BatchFinishArgs, Tier } from '@verso/core';

export interface WriteOutcome {
  /** Every game written so far, this run and the earlier ones. */
  readonly written: ReadonlySet<string>;
  /** Games still to write, in write order: the one that failed and its tier's later ones. */
  readonly pending: readonly string[];
  /** The first error of this run, or null when everything landed. */
  readonly error: unknown;
}

/** PostgREST's unique-violation code, which `insert_ranking_entry` raises for a ranked game. */
const ALREADY_RANKED = '23505';

export function isAlreadyRanked(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === ALREADY_RANKED;
}

export async function runWrites(
  args: readonly BatchFinishArgs[],
  already: ReadonlySet<string>,
  write: (args: BatchFinishArgs) => Promise<unknown>,
): Promise<WriteOutcome> {
  const written = new Set(already);
  const blocked = new Set<Tier>();
  const pending: string[] = [];
  let firstError: unknown = null;

  for (const call of args) {
    if (written.has(call.mediaItemId)) continue;
    if (blocked.has(call.tier)) {
      pending.push(call.mediaItemId);
      continue;
    }
    try {
      await write(call);
      written.add(call.mediaItemId);
    } catch (error) {
      if (isAlreadyRanked(error)) {
        written.add(call.mediaItemId);
        continue;
      }
      if (firstError === null) firstError = error;
      blocked.add(call.tier);
      pending.push(call.mediaItemId);
    }
  }

  return { written, pending, error: firstError };
}
