/**
 * The writes at the end of a session, as a hook: the review's Done and "Rank
 * more", and the seeds' session, whose review is skipped.
 *
 * `runWrites` (writes.ts) does the bookkeeping; this adds the client, the
 * invalidation, the `ten_ranked` event, and the state a button needs. The
 * games already written are kept across attempts, so a retry writes only what
 * is left (specs/batch-session.md: "retries only the failed items").
 *
 * Invalidation: `invalidateRanking` once, which refetches every list a ranked
 * game can enter or leave, plus each written game's own page; that is what one
 * `invalidateRanking` per game covers, without restarting the shared lists
 * once per game. The drain, the deck and the guesses come with it:
 * `invalidateRanking` calls `invalidateOnboarding` (src/lib/invalidate.ts).
 */

import { useQueryClient } from '@tanstack/react-query';
import { finishInsertion } from '@verso/api';
import type { BatchFinishArgs } from '@verso/core';
import { useRef, useState } from 'react';

import { invalidateRanking } from '@/lib/invalidate';
import { logAppEvent } from '@/lib/log-event';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { runWrites } from './writes';

export interface BatchWrites {
  /** Write what is not written yet. Resolves true once every game has landed. */
  save: (args: readonly BatchFinishArgs[], options: { tenRanked: boolean }) => Promise<boolean>;
  saving: boolean;
  /** How many games the last attempt left unwritten; 0 when it landed or has not run. */
  pending: number;
  /** Whether any write has been tried. The review stops moving rows from then on. */
  started: boolean;
}

export function useBatchWrites(): BatchWrites {
  const queryClient = useQueryClient();
  const written = useRef<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);
  const [started, setStarted] = useState(false);

  const save: BatchWrites['save'] = async (args, { tenRanked }) => {
    setSaving(true);
    setStarted(true);
    setPending(0);

    const before = written.current;
    const outcome = await runWrites(args, before, (call) => finishInsertion(supabase, call));
    written.current = outcome.written;

    const landed = [...outcome.written].filter((id) => !before.has(id));
    if (landed.length > 0) {
      invalidateRanking(queryClient, landed[0]!);
      for (const id of landed.slice(1)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.game(id), refetchType: 'all' });
      }
    }

    setSaving(false);
    if (outcome.pending.length > 0) {
      setPending(outcome.pending.length);
      return false;
    }

    // Once, when the count first reaches ten (onboarding.md, "Events"). An
    // event that does not land is a lost data point, never a reason to hold
    // the user (events.ts), so it is neither awaited nor reported.
    if (tenRanked) logAppEvent('ten_ranked').catch(() => undefined);
    return true;
  };

  return { save, saving, pending, started };
}
