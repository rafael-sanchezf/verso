/**
 * "Import library", and "Try again" on the privacy checklist: one call to the
 * `steam-import` function and what its answer means for the screen that asked.
 *
 * The answer is a value for everything the app can act on (import-outcome.ts
 * has the switch). Two of them move the user on -- the candidates, or the
 * checklist -- and the caller says how, because the Steam screen pushes and the
 * checklist replaces itself. The other two, and a throw, stay on the screen as
 * one line with a Retry, which is what `line` is.
 *
 * Every answer invalidates `['steam']`: the function moves the link's
 * `lastSyncedAt` and `syncStatus` whatever happened, so "Last import" should
 * say so. An import that changed playtime on entries also refreshes the lists
 * and game pages those hours appear on.
 */

import { importSteamLibrary } from '@verso/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useT } from '@/lib/i18n';
import { invalidateSteam } from '@/lib/invalidate';
import { supabase } from '@/lib/supabase';

import { importFailureMessage } from './errors';
import { importStep, type ImportAsker, type ImportStep } from './import-outcome';

/** The two answers that leave the screen. */
export type ImportMove = Exclude<ImportStep, { kind: 'line' }>;

export interface SteamImport {
  run: () => void;
  pending: boolean;
  /** The line for a rate limit, a lost link, or a failure, in the app's language; null otherwise. */
  line: string | null;
}

export function useSteamImport(asker: ImportAsker, onMove: (move: ImportMove) => void): SteamImport {
  const t = useT();
  const queryClient = useQueryClient();

  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  const mutation = useMutation({
    mutationFn: () => importSteamLibrary(supabase),
    onSuccess: (result) => {
      invalidateSteam(queryClient, {
        entriesChanged: result.status === 'imported' && result.entriesUpdated > 0,
      });
      const step = importStep(result, asker, t);
      if (step.kind !== 'line') onMoveRef.current(step);
    },
    // The function marks the link 'error' on its way out; refetch so the
    // linked screen's "Last import" says so.
    onError: () => invalidateSteam(queryClient),
  });

  const line = (() => {
    if (mutation.isError) return t(importFailureMessage(mutation.error));
    if (!mutation.data) return null;
    const step = importStep(mutation.data, asker, t);
    return step.kind === 'line' ? step.message : null;
  })();

  return {
    run: () => mutation.mutate(),
    pending: mutation.isPending,
    line,
  };
}
