import type { EntryRow } from '@verso/api';

/**
 * A minimal, fully-populated `EntryRow`, for the Next tab's pure-logic tests.
 * Every field has a harmless default so a test only has to override what it
 * is actually exercising.
 */
export function makeEntryRow(overrides: Partial<EntryRow> = {}): EntryRow {
  return {
    mediaItemId: 'media-1',
    title: 'Hollow Knight: Silksong',
    year: 2026,
    coverImageId: 'co1r7f',
    releaseDate: '2026-09-04',
    externalIds: {},
    genres: ['Metroidvania'],
    platforms: ['PC', 'PS5', 'Switch 2'],
    timeToBeat: { hastilySeconds: null, normallySeconds: null, completelySeconds: null },
    entry: {
      id: 'entry-1',
      mediaItemId: 'media-1',
      status: 'backlog',
      addedAt: '2026-09-01T12:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      purchasedAt: null,
      notes: null,
      playtimeMinutes: null,
      playtimeSource: null,
      playedPlatforms: [],
      backlogPosition: 0,
      plannedOn: null,
    },
    ...overrides,
  };
}
