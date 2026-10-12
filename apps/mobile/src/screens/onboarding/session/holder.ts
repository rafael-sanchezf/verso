/**
 * A value outside React that screens can read and be told about: a variable
 * plus a subscribe, the "tiny zustand-free holder" the hand-off asks for
 * (specs/batch-session.md, "Two builds, one stack").
 *
 * Two of them live in this folder. `session-store.ts` holds the request the
 * onboarding's screens hand the session (which games, from where, where to go
 * after), and `run-store.ts` holds the finished session the review picks up.
 * Neither belongs in the router's params: a request carries ten catalog rows,
 * and a finished run carries the engine's whole state with every answer in it.
 *
 * No React and no `react-native` import, so it runs in the Vitest node
 * environment (`apps/mobile/test/session-store.test.ts`).
 */

export interface Holder<T> {
  get(): T;
  set(value: T): void;
  /** Called after every `set`, whatever the value. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createHolder<T>(initial: T): Holder<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set(next) {
      value = next;
      // A copy, so a listener that unsubscribes itself does not skip the next one.
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
