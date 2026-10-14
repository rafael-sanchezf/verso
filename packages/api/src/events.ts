/**
 * Product events: the onboarding funnel and the interest taps, logged as the
 * signed-in user into `events` (supabase/migrations/20261007120000_onboarding_backend.sql).
 *
 * Where each one comes from (docs/design/specs/onboarding.md, "Events"):
 *
 *   first_session   the questionnaire's Continue
 *   ten_ranked      once, when the ranked count first reaches ten (the review's
 *                   Done, or the single log flow)
 *   media_interest  a tap on a held medium's tile, "Notify me when available",
 *                   with `{ medium }`
 *   app_open        once per calendar day on foreground; the day-7 return is
 *                   read from these rows rather than logged
 *   day_7_return    reserved, in case the return is ever logged on the device
 *   first_pick      the finder's first pick, when the finder lands
 *   tmdb_lookup     not logged by the app: the tmdb-lookup function writes one
 *                   as the caller per film search sent to TMDB, and counts
 *                   them for its per-minute meter (supabase/functions/tmdb-lookup)
 *
 * The table is owner insert and read only and never updated or deleted, and
 * the insert grant is `kind` and `payload` alone: the user, the id and the
 * time come from the database, so this cannot backdate an event or name
 * anyone. Nothing here dedupes: "once" is the caller's rule, and the funnel
 * counts distinct users. No third party reads these rows, and no SDK sends
 * them anywhere (decision 21).
 *
 * Like the writers in entries.ts, `logEvent` throws on failure. A screen should
 * not hold its navigation on it: an event that did not land is a lost data
 * point, not a reason to stop the user, so call it without awaiting the
 * navigation on its result, or catch and drop.
 */

import type { Client } from './client';
import type { Json } from './database.types';

/** The kinds the app may log. The database accepts any snake_case word; this is the list. */
export type EventKind =
  | 'first_session'
  | 'ten_ranked'
  | 'first_pick'
  | 'app_open'
  | 'day_7_return'
  | 'media_interest';

/** A small JSON object of facts about the event; at most 4 KB, which the database enforces. */
export type EventPayload = { [key: string]: Json | undefined };

/**
 * Log one event as the signed-in user. `payload` defaults to `{}`; for
 * `media_interest` it is `{ medium }`, the held medium's name ("tv", "books").
 */
export async function logEvent(client: Client, kind: EventKind, payload: EventPayload = {}): Promise<void> {
  const { error } = await client.from('events').insert({ kind, payload: payload as Json });
  if (error) throw error;
}
