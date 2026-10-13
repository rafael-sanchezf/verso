/**
 * The ask sheet's state: the question, the permission step, the trace, the
 * picks, and the daily limit.
 *
 * One request per send. The model path is `suggest` (the Edge Function); the
 * plain path is `plainSuggestions`, which sends nothing anywhere and is what
 * "Not now" and the daily limit show (decision 24: "Not now" still shows three
 * picks, with the engine's plain reasons).
 *
 * **"Another three" never calls the model.** The function takes no exclusion
 * list yet, so a second call would spend a model call and one of the twenty
 * daily slots to get the same three back. Until it does, "Another three" is
 * `plainSuggestions` with what was shown excluded: SQL's next best, with the
 * template reason.
 *
 * **The permission step is asked once per opening of the sheet.** Decision 24
 * wants it stored on the profile and enforced by the function; there is no
 * `profiles.ai_consent_at` on main and this PR adds no migration, so the
 * answer lives in this hook's state and the step comes back the next time the
 * sheet opens. When the column lands, `consent` starts from it.
 */

import { getMyProfile, plainSuggestions, suggest, type Profile, type SuggestOptions, type SuggestPick } from '@verso/api';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { languageStore } from '@/lib/i18n/store';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { buildTrace, readNote, type AskMedium, type TraceLine } from './trace';

export type Consent = 'unasked' | 'allowed' | 'declined';

/** What "Another three" left behind, on either answered phase. */
interface MoreState {
  /** "Another three" is running. */
  loadingMore: boolean;
  /** The last "Another three" found nothing new; the button says so. */
  exhausted: boolean;
  /** The last "Another three" failed; an error line with Retry sits under the button. */
  moreFailed: boolean;
}

export type AskPhase =
  | { kind: 'question' }
  /** The send is waiting on Allow or Not now. */
  | { kind: 'consent' }
  | { kind: 'thinking'; trace: [TraceLine, TraceLine, TraceLine] }
  | ({
      kind: 'picks';
      picks: SuggestPick[];
      /** The function's model, `sql-top3`, or `plain` for the path that sent nothing. */
      modelVersion: string;
      fallback: boolean;
    } & MoreState)
  /** Over the daily limit: the plain picks, under "That's all for today". */
  | ({ kind: 'limit'; picks: SuggestPick[] } & MoreState)
  | { kind: 'empty' }
  | { kind: 'error' };

const SETTLED: MoreState = { loadingMore: false, exhausted: false, moreFailed: false };

/** How long the trace runs at the least, so its three lines read even when the answer is quick. */
export const TRACE_MIN_MS = 1800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The request for this medium and these words, with the profile's services for films. */
function requestFor(medium: AskMedium, text: string, profile: Profile | null): SuggestOptions {
  const { maxMinutes } = readNote(text, medium);
  return {
    medium,
    note: text,
    maxMinutes,
    providerIds: medium === 'movie' ? (profile?.watchProviderIds ?? []) : [],
    region: medium === 'movie' ? (profile?.watchRegion ?? null) : null,
    // The person's own backlog or watchlist is the likeliest right answer
    // (decision 18), and `suggestion_candidates` leaves it out by default.
    includeBacklog: true,
    // The reasons, the model's and the template's, in the language the app is
    // in when the question is asked (spanish-build.md, wave 7).
    language: languageStore.language(),
  };
}

export function useAsk(medium: AskMedium) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<AskPhase>({ kind: 'question' });
  const [consent, setConsent] = useState<Consent>('unasked');
  // The request the picks on screen answer, for "Another three" and the caption.
  const [request, setRequest] = useState<SuggestOptions | null>(null);
  // Everything shown since the question was asked, for "Another three".
  const shown = useRef<string[]>([]);
  // A send that a later send or a Change has superseded must not land.
  const generation = useRef(0);

  const run = useCallback(
    async (text: string, allowed: boolean) => {
      const mine = ++generation.current;
      shown.current = [];
      setPhase({ kind: 'thinking', trace: buildTrace(medium, text) });
      try {
        // The profile carries the services and the region. A first send can
        // beat the profile read, so it waits for it (cached reads return at
        // once); a failed read sends no services rather than no request.
        const profile = await queryClient
          .ensureQueryData({ queryKey: queryKeys.profileMe(), queryFn: () => getMyProfile(supabase) })
          .catch(() => null);
        const options = requestFor(medium, text, profile);
        if (mine !== generation.current) return;
        setRequest(options);

        const [result] = await Promise.all([
          allowed
            ? suggest(supabase, options)
            : plainSuggestions(supabase, options).then((picks) => ({ status: 'plain' as const, picks })),
          sleep(TRACE_MIN_MS),
        ]);
        if (mine !== generation.current) return;

        if (result.status === 'limit') {
          const picks = await plainSuggestions(supabase, options);
          if (mine !== generation.current) return;
          shown.current = picks.map((pick) => pick.mediaItemId);
          setPhase({ kind: 'limit', picks, ...SETTLED });
          return;
        }
        if (result.picks.length === 0) {
          setPhase({ kind: 'empty' });
          return;
        }
        shown.current = result.picks.map((pick) => pick.mediaItemId);
        setPhase({
          kind: 'picks',
          picks: result.picks,
          modelVersion: result.status === 'ok' ? result.modelVersion : 'plain',
          fallback: result.status === 'ok' ? result.fallback : false,
          ...SETTLED,
        });
      } catch {
        if (mine === generation.current) setPhase({ kind: 'error' });
      }
    },
    [medium, queryClient],
  );

  /** The send button. Asks for permission first, once per opening. */
  const send = useCallback(() => {
    if (consent === 'unasked') {
      setPhase({ kind: 'consent' });
      return;
    }
    void run(note, consent === 'allowed');
  }, [consent, note, run]);

  const answerConsent = useCallback(
    (allowed: boolean) => {
      setConsent(allowed ? 'allowed' : 'declined');
      void run(note, allowed);
    },
    [note, run],
  );

  /** Back to the question, the words kept for editing. */
  const change = useCallback(() => {
    generation.current++;
    setPhase({ kind: 'question' });
  }, []);

  /** Three more: SQL's next best for the same request, what was shown excluded. */
  const anotherThree = useCallback(async () => {
    if (phase.kind !== 'picks' && phase.kind !== 'limit') return;
    if (phase.loadingMore || !request) return;
    const mine = generation.current;
    const current = phase;
    setPhase({ ...current, loadingMore: true, moreFailed: false });
    const seen = [...shown.current];
    try {
      const picks = await plainSuggestions(supabase, request, seen);
      if (mine !== generation.current) return;
      if (picks.length === 0) {
        setPhase({ ...current, ...SETTLED, exhausted: true });
        return;
      }
      shown.current = [...seen, ...picks.map((pick) => pick.mediaItemId)];
      // The phase stays what it was, its modelVersion and fallback included:
      // the caption and the limit's title describe the question, not this page.
      setPhase({ ...current, picks, ...SETTLED });
    } catch {
      if (mine === generation.current) setPhase({ ...current, ...SETTLED, moreFailed: true });
    }
  }, [phase, request]);

  const retry = useCallback(() => void run(note, consent === 'allowed'), [consent, note, run]);

  // What the request on screen carried, not what the profile says now.
  const onServices = medium === 'movie' && (request?.providerIds?.length ?? 0) > 0;

  return { note, setNote, phase, send, answerConsent, change, anotherThree, retry, onServices };
}
