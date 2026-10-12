/**
 * The root layout's onboarding gate as a hook: the signed-in user's profile,
 * read under the shell's `['profile', 'me']` key, turned into "routed yet?"
 * and "new user?" by `onboardingGate` (gate.ts has the rule and its reasons).
 *
 * It takes the query client because the root layout is the component that
 * renders the `QueryClientProvider`, so it cannot read the client from
 * context; TanStack's `useQuery` accepts the client as its second argument for
 * exactly this. Same key, same cache: when Media's Continue writes the stored
 * profile into the key, the gate sees the media in the same render.
 */

import { getMyProfile } from '@verso/api';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { onboardingGate, type OnboardingGate } from './gate';

export function useOnboardingGate(queryClient: QueryClient, signedIn: boolean): OnboardingGate {
  const profile = useQuery(
    {
      queryKey: queryKeys.profileMe(),
      queryFn: () => getMyProfile(supabase),
      enabled: signedIn,
    },
    queryClient,
  );
  if (!signedIn) return { routed: false, newUser: false };
  return onboardingGate(profile.data, profile.isError);
}
