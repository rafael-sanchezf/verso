/**
 * Movies Home's two reads, shared by Home and the row page (`app/home/row.tsx`)
 * so the row page draws from the rows Home already loaded: one key, one cache,
 * no second call to `movie_home_rows`.
 *
 * - The rows (`movieHomeRows`), with the films of an empty row skipped.
 *   An entry write only marks them stale (`invalidateEntry`), so they are
 *   refetched here when the screen comes into focus and the cache says they
 *   were invalidated.
 * - The services' names for the caller's region, which the service pill reads
 *   by id. Catalog data, kept a day.
 */

import { movieHomeRows, todayLocal, watchProviders, type HomeRow } from '@verso/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/state/medium';

const NO_NAMES: ReadonlyMap<number, string> = new Map();
const DAY = 24 * 60 * 60 * 1000;

/** The rows with films in them, in the database's order. Module scope so the reference is stable. */
const withFilms = (rows: HomeRow[]): HomeRow[] => rows.filter((row) => row.candidates.length > 0);

export function useMovieHomeRows() {
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: queryKeys.movieHomeRows(),
    // The region is the caller's own, which the database reads from the
    // profile when it is not passed.
    queryFn: () => movieHomeRows(supabase, { today: todayLocal() }),
    select: withFilms,
  });

  const { refetch } = rows;
  useFocusEffect(
    useCallback(() => {
      if (queryClient.getQueryState(queryKeys.movieHomeRows())?.isInvalidated) void refetch();
    }, [queryClient, refetch]),
  );

  return rows;
}

export function useProviderNames(): ReadonlyMap<number, string> {
  const profile = useMyProfile();
  const region = profile.data?.watchRegion ?? 'US';
  const providers = useQuery({
    queryKey: queryKeys.watchProviders(region),
    queryFn: () => watchProviders(supabase, region),
    enabled: profile.isSuccess,
    staleTime: DAY,
  });
  return useMemo(
    () => (providers.data ? new Map(providers.data.map((p) => [p.providerId, p.name])) : NO_NAMES),
    [providers.data],
  );
}
