/**
 * Recent searches, on the device.
 *
 * AsyncStorage rather than the database: a search history is the one thing on
 * this screen that is nobody else's business and that nothing else in the app
 * reads. It is also the one list that should not survive onto another device —
 * "own the user's data" (ROADMAP principles) is about what they tracked, not
 * about what they typed.
 *
 * The rules live in `recent.ts`, pure and tested. This is the storage around
 * them: read once on mount, write on every change, and keep the list in state so
 * a new search shows up without a reload. A read or a write that fails is
 * swallowed — an unavailable history is an empty section, never an error on a
 * screen whose job is to search.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { parseRecent, RECENT_KEY, withRecent } from './recent';

export interface RecentSearches {
  /** Newest first, at most ten. Empty until the first read finishes. */
  queries: string[];
  /**
   * Remember a query. Called when a result is opened or a game is added —
   * never on a keystroke, because a history of every prefix of every word is
   * not a history (specs/search.md).
   */
  remember: (query: string) => void;
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

export function useRecentSearches(): RecentSearches {
  const [queries, setQueries] = useState<string[]>([]);

  // The list as it stands, readable from `remember` without making the callback
  // depend on it. The write is a side effect and belongs outside a state
  // updater, which React is free to run twice.
  const latest = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (cancelled) return;
        const stored = parseRecent(raw);
        latest.current = stored;
        setQueries(stored);
      })
      .catch(() => {
        // No history is a fine state to be in; it is one empty section.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((query: string) => {
    const next = withRecent(latest.current, query);
    // A blank query, or the same search twice running: nothing to write and
    // nothing to redraw.
    if (same(next, latest.current)) return;

    latest.current = next;
    setQueries(next);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {
      // The list stays correct in memory for this session either way.
    });
  }, []);

  return { queries, remember };
}
