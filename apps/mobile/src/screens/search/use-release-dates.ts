/**
 * The release dates of the games on screen, for Search's two intents.
 *
 * Search's two RPCs return no date, and neither intent's pill may mark a game
 * that is not out Playing or played (phone feedback entry 10;
 * `playingIntentControl` in `intent.ts`, `addManyPill` in `add-many.ts`). One
 * read for every row, shaped like `useTrackedIds`, and only while an intent is
 * on: plain Search's pill opens the add sheet, which checks for itself.
 *
 * Decorative in the same way: a failed or pending read leaves the map without
 * the row, the pill stays as it was, and the write behind it checks the date
 * again first (`lib/when-released.ts`).
 */

import { releaseDates } from '@verso/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/** A catalog date moves only when the nightly mirror moves it. */
const STALE_MS = 60 * 60 * 1000;

/** `mediaItemId` to `YYYY-MM-DD` or null, for the ids the read has answered. */
export function useReleaseDates(
  mediaItemIds: readonly string[],
  enabled: boolean,
): ReadonlyMap<string, string | null> {
  // The same reduction `useTrackedIds` makes, for the same reason: the array
  // is new on every render, the joined string is not.
  const joined = [...new Set(mediaItemIds)].sort().join(',');
  const ids = useMemo(() => (joined === '' ? [] : joined.split(',')), [joined]);

  const query = useQuery({
    queryKey: queryKeys.releaseDates(ids),
    queryFn: () => releaseDates(supabase, ids),
    enabled: enabled && ids.length > 0,
    staleTime: STALE_MS,
  });

  const data = query.data;
  return useMemo(() => new Map((data ?? []).map((row) => [row.mediaItemId, row.releaseDate])), [data]);
}
