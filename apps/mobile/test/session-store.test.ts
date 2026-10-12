/**
 * The holder behind the session's two stores (`session-store.ts`, the seam
 * with the onboarding screens, and `run-store.ts`, the hand-over to the
 * review). The React hook on top is `useSyncExternalStore` over exactly these
 * three functions.
 */

import { describe, expect, it, vi } from 'vitest';

import { createHolder } from '../src/screens/onboarding/session/holder';
import { clearFinishedRun, getFinishedRun, setFinishedRun, type FinishedRun } from '../src/screens/onboarding/session/run-store';

describe('createHolder', () => {
  it('holds a value and tells every subscriber when it is set', () => {
    const holder = createHolder<number | null>(null);
    const a = vi.fn();
    const b = vi.fn();
    holder.subscribe(a);
    const offB = holder.subscribe(b);

    holder.set(3);
    expect(holder.get()).toBe(3);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offB();
    holder.set(null);
    expect(holder.get()).toBeNull();
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not skip a listener when another unsubscribes itself while being told', () => {
    const holder = createHolder(0);
    const second = vi.fn();
    const off = holder.subscribe(() => off());
    holder.subscribe(second);
    holder.set(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('the run store', () => {
  it('hands the finished run to the review and forgets it after Done', () => {
    const run = { request: { source: 'deck', items: [], onDone: 'back' } } as unknown as FinishedRun;
    expect(getFinishedRun()).toBeNull();
    setFinishedRun(run);
    expect(getFinishedRun()).toBe(run);
    clearFinishedRun();
    expect(getFinishedRun()).toBeNull();
  });
});
