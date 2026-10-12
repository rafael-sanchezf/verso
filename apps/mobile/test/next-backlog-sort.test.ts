import { describe, expect, it } from 'vitest';

import { sortBacklogEntries } from '../src/screens/next/backlog-sort';
import { makeEntryRow } from './fixtures';

describe('sortBacklogEntries', () => {
  it('leaves "your order" exactly as given', () => {
    const entries = [
      makeEntryRow({ mediaItemId: 'c', title: 'C' }),
      makeEntryRow({ mediaItemId: 'a', title: 'A' }),
      makeEntryRow({ mediaItemId: 'b', title: 'B' }),
    ];
    expect(sortBacklogEntries(entries, 'your-order').map((e) => e.title)).toEqual(['C', 'A', 'B']);
    // A copy, not the same array: a screen may hand it straight to state.
    expect(sortBacklogEntries(entries, 'your-order')).not.toBe(entries);
  });

  it('sorts by date added, newest first', () => {
    const entries = [
      makeEntryRow({ title: 'Oldest', entry: { ...makeEntryRow().entry, addedAt: '2026-01-01' } }),
      makeEntryRow({ title: 'Newest', entry: { ...makeEntryRow().entry, addedAt: '2026-09-01' } }),
      makeEntryRow({ title: 'Middle', entry: { ...makeEntryRow().entry, addedAt: '2026-05-01' } }),
    ];
    expect(sortBacklogEntries(entries, 'date-added').map((e) => e.title)).toEqual([
      'Newest',
      'Middle',
      'Oldest',
    ]);
  });

  it('sorts by release date, newest first, with undated games last', () => {
    const entries = [
      makeEntryRow({ title: 'Undated', releaseDate: null }),
      makeEntryRow({ title: 'Old release', releaseDate: '2010-01-01' }),
      makeEntryRow({ title: 'New release', releaseDate: '2026-06-01' }),
    ];
    expect(sortBacklogEntries(entries, 'release-date').map((e) => e.title)).toEqual([
      'New release',
      'Old release',
      'Undated',
    ]);
  });

  it('sorts by time to beat, shortest first, with unknown figures last', () => {
    const entries = [
      makeEntryRow({
        title: 'Unknown',
        timeToBeat: { hastilySeconds: null, normallySeconds: null, completelySeconds: null },
      }),
      makeEntryRow({
        title: 'Long',
        timeToBeat: { hastilySeconds: null, normallySeconds: 80 * 3600, completelySeconds: null },
      }),
      makeEntryRow({
        title: 'Short',
        timeToBeat: { hastilySeconds: null, normallySeconds: 5 * 3600, completelySeconds: null },
      }),
    ];
    expect(sortBacklogEntries(entries, 'time-to-beat').map((e) => e.title)).toEqual([
      'Short',
      'Long',
      'Unknown',
    ]);
  });

  it('does not mutate the array it was given', () => {
    const entries = [
      makeEntryRow({ title: 'B', entry: { ...makeEntryRow().entry, addedAt: '2026-01-01' } }),
      makeEntryRow({ title: 'A', entry: { ...makeEntryRow().entry, addedAt: '2026-09-01' } }),
    ];
    const original = [...entries];
    sortBacklogEntries(entries, 'date-added');
    expect(entries).toEqual(original);
  });
});
