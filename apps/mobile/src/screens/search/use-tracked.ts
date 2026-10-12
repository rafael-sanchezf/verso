/**
 * Which of the games on screen the user already tracks.
 *
 * specs/search.md: "A game the user already tracks shows a `check` in place of
 * the plus (not drawn; convention) and the sheet still opens so the status can
 * change."
 *
 * This used to be assembled from `['playing']`, `['backlog']` and
 * `['upcoming']`, because nothing in `@verso/api` could answer the question.
 * Three full list reads for a yes-or-no about twenty ids, and it still could
 * not see a game whose status is `played` or `dropped` — a game you finished
 * last week but have not ranked showed the plus. `trackedMediaItemIds` in
 * `views.ts` answers it directly, for every status, in one indexed query.
 *
 * Still decorative: a failed read means no checks, never an error state. The
 * rows are the user's own and the answer is cheap to fetch again.
 */

import { trackedMediaItemIds } from '@verso/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

/**
 * The subset of `mediaItemIds` that is in the caller's library.
 *
 * The argument may be a fresh array on every render — it is built from two
 * query results — so the list is reduced to one sorted, de-duplicated string
 * first and everything downstream depends on that. Depending on the array
 * itself would rebuild the query key every render and refetch forever.
 */
export function useTrackedIds(mediaItemIds: readonly string[]): Set<string> {
  const joined = [...new Set(mediaItemIds)].sort().join(',');

  const ids = useMemo(() => (joined === '' ? [] : joined.split(',')), [joined]);

  const query = useQuery({
    queryKey: queryKeys.tracked(ids),
    queryFn: () => trackedMediaItemIds(supabase, ids),
    enabled: ids.length > 0,
  });

  const data = query.data;
  return useMemo(() => new Set(data ?? []), [data]);
}
