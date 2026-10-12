import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debounce, SEARCH_DEBOUNCE_MS } from '../src/screens/search/debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('settles nothing until the delay has passed', () => {
    const settle = vi.fn();
    debounce<string>(SEARCH_DEBOUNCE_MS, settle).push('h');

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(settle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(settle).toHaveBeenCalledExactlyOnceWith('h');
  });

  it('keeps only the last value when someone is typing', () => {
    const settle = vi.fn();
    const debouncer = debounce<string>(SEARCH_DEBOUNCE_MS, settle);

    for (const value of ['h', 'ha', 'had', 'hade', 'hades']) {
      debouncer.push(value);
      vi.advanceTimersByTime(80);
    }
    expect(settle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(settle).toHaveBeenCalledExactlyOnceWith('hades');
  });

  it('settles again once the typing stops and starts again', () => {
    const settle = vi.fn();
    const debouncer = debounce<string>(SEARCH_DEBOUNCE_MS, settle);

    debouncer.push('hades');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    debouncer.push('silksong');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(settle.mock.calls).toEqual([['hades'], ['silksong']]);
  });

  it('cancels a pending value', () => {
    const settle = vi.fn();
    const debouncer = debounce<string>(SEARCH_DEBOUNCE_MS, settle);

    debouncer.push('hades');
    debouncer.cancel();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 10);

    expect(settle).not.toHaveBeenCalled();
  });

  it('can be used again after a cancel', () => {
    const settle = vi.fn();
    const debouncer = debounce<string>(SEARCH_DEBOUNCE_MS, settle);

    debouncer.cancel();
    debouncer.push('hades');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(settle).toHaveBeenCalledExactlyOnceWith('hades');
  });

  it('waits the quarter second specs/search.md asks for', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(250);
  });
});
