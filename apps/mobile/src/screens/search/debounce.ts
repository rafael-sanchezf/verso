/**
 * Waiting for the typing to stop.
 *
 * `searchGames` is a trigram query over the whole catalog and every keystroke
 * would be one of them: "hollow knight" is thirteen round trips, twelve of whose
 * answers are thrown away before they arrive, and the twelfth can land after the
 * thirteenth and show the wrong list. 250 ms is the figure specs/search.md
 * gives; it is about the gap between two letters typed at speed, so a fluent
 * typist makes one request and a hunt-and-peck typist makes a few.
 *
 * The timer is a plain function rather than a hook so it can be tested with fake
 * timers and no renderer (`apps/mobile/test/debounce.test.ts`); the hook under it
 * is four lines of React around the same object.
 */

import { useEffect, useMemo, useState } from 'react';

/** The delay specs/search.md sets for the search field. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface Debouncer<T> {
  /** Offer a value. It settles `delay` ms from now unless another arrives first. */
  push(value: T): void;
  /** Drop a pending value. Nothing settles until the next `push`. */
  cancel(): void;
}

/**
 * A timer that keeps only the last value offered to it.
 *
 * Trailing edge only: nothing settles until the pushes stop, which is what a
 * search field wants. A leading-edge version would fire on the first letter of
 * every word, which is the request least likely to be worth making.
 */
export function debounce<T>(delay: number, settle: (value: T) => void): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    push(value: T) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        settle(value);
      }, delay);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * The field's text, 250 ms behind it, and the thing the query key is built from.
 *
 * Clearing is not debounced. An empty field means "show Recent and Popular", and
 * a quarter of a second of the previous results still sitting there after the
 * field has visibly emptied reads as a stuck screen rather than as a fast one.
 * Going the other way — typing the first letter — is a request, and requests
 * wait.
 */
export function useDebouncedQuery(query: string, delay: number = SEARCH_DEBOUNCE_MS): string {
  const [settled, setSettled] = useState(query);
  const debouncer = useMemo(() => debounce<string>(delay, setSettled), [delay]);

  useEffect(() => {
    if (query === '') {
      debouncer.cancel();
      setSettled('');
      return;
    }
    debouncer.push(query);
  }, [query, debouncer]);

  // A pending timer holding a setState after the screen is gone is a warning in
  // development and a wasted request in production.
  useEffect(() => () => debouncer.cancel(), [debouncer]);

  return settled;
}
