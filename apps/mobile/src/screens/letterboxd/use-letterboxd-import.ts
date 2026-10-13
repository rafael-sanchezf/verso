/**
 * The import's state, from "choose files" to "done", and its two conversations
 * with the database.
 *
 * Reading the files, folding them into films and matching them are all reads;
 * nothing is written until `confirm`, which is one RPC. So a user who backs
 * out of the review has imported nothing, and the component can be unmounted
 * at any step without leaving a half-import behind.
 *
 * The review carries the user's choice (rule 35, decision 35): `rank` is off
 * until they turn on "Rank from my stars", and `moved` collects the films they
 * drag in the draft, which are written as their own placement rather than the
 * stars' guess.
 */

import { useQueryClient } from '@tanstack/react-query';
import { applyLetterboxdImport, matchLetterboxdFilms, tierList, type LetterboxdImportResult } from '@verso/api';
import { foldFilms, TIERS, type LetterboxdFilm } from '@verso/core';
import { useCallback, useState } from 'react';

import { t } from '@/lib/i18n';
import { invalidateAllEntries } from '@/lib/invalidate';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

import { fileNote, pickLetterboxdFiles, readPickedFiles } from './files';
import { applyArgs, buildReview, type ImportChoice, type MovieTiers, type Review, type ReviewListItem } from './model';

export type ImportStep =
  | { kind: 'pick' }
  | { kind: 'reading' }
  | ({ kind: 'review' } & ReviewState)
  | ({ kind: 'saving' } & ReviewState)
  | { kind: 'done'; result: LetterboxdImportResult; ranked: boolean };

interface ReviewState {
  review: Review;
  /** The draft as the user has dragged it; starts as `review.list`. */
  list: ReviewListItem[];
  /** Off until the user turns on "Rank from my stars"; the dragged films. */
  choice: ImportChoice;
  fileNames: string[];
  /** One line per file picked. */
  notes: string[];
}

export interface LetterboxdImport {
  step: ImportStep;
  /** The last failure, cleared by the next action. */
  error: string | null;
  /** Open the picker, read and match the files, and move to the review. */
  choose: () => Promise<void>;
  /** The drag's result, and the film that moved. */
  setList: (list: ReviewListItem[], movedKey: string | null) => void;
  /** Turn "Rank from my stars" on or off. Off forgets nothing: the draft stays as dragged. */
  setRank: (rank: boolean) => void;
  /** The one write. */
  confirm: () => Promise<void>;
  /** Back to the start, nothing written. */
  reset: () => void;
}

async function readMovieTiers(): Promise<MovieTiers> {
  const lists = await Promise.all(TIERS.map((tier) => tierList(supabase, 'movie', tier)));
  return { loved: lists[0] ?? [], liked: lists[1] ?? [], fine: lists[2] ?? [], disliked: lists[3] ?? [] };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : t('profile.letterboxd.errors.somethingWentWrong');
}

export function useLetterboxdImport(): LetterboxdImport {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ImportStep>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(async () => {
    setError(null);
    const picked = await pickLetterboxdFiles();
    if (!picked) return;

    setStep({ kind: 'reading' });
    try {
      const files = await readPickedFiles(picked);
      const notes = files.map(fileNote);
      const films: LetterboxdFilm[] = foldFilms(files);

      if (films.length === 0) {
        setStep({ kind: 'pick' });
        setError(
          files.every((file) => file.kind === 'unknown')
            ? t('profile.letterboxd.errors.notAnExport')
            : t('profile.letterboxd.errors.noFilms', { notes: notes.join('\n') }),
        );
        return;
      }

      const [matches, existing] = await Promise.all([
        matchLetterboxdFilms(
          supabase,
          films.map((film) => ({ key: film.key, title: film.title, year: film.year, tmdbId: film.tmdbId })),
        ),
        readMovieTiers(),
      ]);

      const review = buildReview(films, matches, existing);
      setStep({
        kind: 'review',
        review,
        list: review.list,
        choice: { rank: false, moved: new Set() },
        fileNames: picked.map((file) => file.name),
        notes,
      });
    } catch (cause) {
      setStep({ kind: 'pick' });
      setError(messageOf(cause));
    }
  }, []);

  const setList = useCallback((list: ReviewListItem[], movedKey: string | null) => {
    setStep((current) => {
      if (current.kind !== 'review') return current;
      const moved = new Set(current.choice.moved);
      if (movedKey !== null) moved.add(movedKey);
      return { ...current, list, choice: { ...current.choice, moved } };
    });
  }, []);

  const setRank = useCallback((rank: boolean) => {
    setStep((current) => (current.kind === 'review' ? { ...current, choice: { ...current.choice, rank } } : current));
  }, []);

  const confirm = useCallback(async () => {
    if (step.kind !== 'review') return;
    setError(null);
    const { kind: _kind, ...state } = step;
    setStep({ kind: 'saving', ...state });

    try {
      const result = await applyLetterboxdImport(
        supabase,
        applyArgs(state.review, state.list, state.fileNames, state.choice),
      );

      // Many entries, and maybe the whole movie ranking, changed at once: the
      // bulk helper for the entries (and the drain they now wait in), then the
      // ranking and the per-tier lists.
      invalidateAllEntries(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ranking(), refetchType: 'all' });
      void queryClient.invalidateQueries({ queryKey: ['tier'], refetchType: 'all' });

      setStep({ kind: 'done', result, ranked: state.choice.rank });
    } catch (cause) {
      setStep({ kind: 'review', ...state });
      setError(messageOf(cause));
    }
  }, [step, queryClient]);

  const reset = useCallback(() => {
    setError(null);
    setStep({ kind: 'pick' });
  }, []);

  return { step, error, choose, setList, setRank, confirm, reset };
}
