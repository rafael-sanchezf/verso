import { describe, expect, it } from 'vitest';

import type { EntryRow } from '@verso/api';

import { translate } from '../src/lib/i18n/dictionary';
import type { Language } from '../src/lib/i18n/model';
import {
  backlogDetail,
  backlogSubtitle,
  gameCountKey,
  upcomingSubtitle,
} from '../src/screens/next/row-text';
import { makeEntryRow } from './fixtures';

/** A fixed "now" so nothing here depends on the day the suite runs. */
const NOW = new Date(2026, 8, 16, 14, 30); // Wednesday 16 September 2026

/** Line three as the row says it. */
function detail(entry: EntryRow, language: Language = 'en'): string | null {
  const said = backlogDetail(entry, NOW);
  if (said === null) return null;
  return 'text' in said ? said.text : translate(language, said.key, { date: said.date });
}

/** The sub row's count as the row says it. */
function gameCount(count: number, language: Language = 'en'): string {
  return translate(language, gameCountKey(count), { count });
}

describe('backlogSubtitle', () => {
  it('joins the played-on platforms with the time to beat', () => {
    const entry = makeEntryRow({
      entry: { ...makeEntryRow().entry, playedPlatforms: ['PC', 'Switch 2'] },
      timeToBeat: { hastilySeconds: null, normallySeconds: 30 * 3600, completelySeconds: null },
    });
    expect(backlogSubtitle(entry)).toBe('PC · Switch 2 · ~30 h');
  });

  it('falls back to the catalog\'s first platform when nothing is recorded as played on', () => {
    const entry = makeEntryRow({ platforms: ['PC', 'PS5', 'Switch 2'] });
    expect(backlogSubtitle(entry)).toBe('PC');
  });

  it('drops the time to beat when the catalog has no figure', () => {
    const entry = makeEntryRow({
      entry: { ...makeEntryRow().entry, playedPlatforms: ['PC'] },
      timeToBeat: { hastilySeconds: null, normallySeconds: null, completelySeconds: null },
    });
    expect(backlogSubtitle(entry)).toBe('PC');
  });

  it('drops the platform half when nothing is recorded and there is no catalog platform', () => {
    const entry = makeEntryRow({
      platforms: [],
      timeToBeat: { hastilySeconds: null, normallySeconds: 5 * 3600, completelySeconds: null },
    });
    expect(backlogSubtitle(entry)).toBe('~5 h');
  });

  it('has nothing to say with neither half', () => {
    const entry = makeEntryRow({
      platforms: [],
      timeToBeat: { hastilySeconds: null, normallySeconds: null, completelySeconds: null },
    });
    expect(backlogSubtitle(entry)).toBeNull();
  });
});

describe('backlogDetail', () => {
  it('leads with a started date over everything else', () => {
    const entry = makeEntryRow({
      entry: {
        ...makeEntryRow().entry,
        startedAt: '2026-09-10T12:00:00.000Z',
        playtimeMinutes: 120,
        addedAt: '2026-09-01T00:00:00.000Z',
      },
    });
    // `personalDate` reads a timestamp in local time (format.test.ts does the
    // same tolerant match for the same reason): the 10th everywhere but the
    // few zones either side of the date line.
    expect(detail(entry)).toMatch(/^Started Sep (9|10|11)$/);
  });

  it('falls back to hours played without a started date', () => {
    const entry = makeEntryRow({
      entry: { ...makeEntryRow().entry, playtimeMinutes: 845, addedAt: '2026-09-01T00:00:00.000Z' },
    });
    expect(detail(entry)).toBe('14 h played');
  });

  it('falls back to the added date last', () => {
    const entry = makeEntryRow({
      entry: { ...makeEntryRow().entry, addedAt: '2026-09-01T12:00:00.000Z' },
    });
    // Local time, like format.test.ts's own timestamp case: midday UTC is the
    // 1st everywhere but the few zones either side of the date line.
    expect(detail(entry)).toMatch(/^Added (Aug 31|Sep 1|Sep 2)$/);
  });

  it('says the sentence in Spanish around the date', () => {
    const entry = makeEntryRow({
      entry: { ...makeEntryRow().entry, addedAt: '2026-09-01T12:00:00.000Z' },
    });
    // The date is `format.ts`'s, in the language the store holds (English
    // here); the sentence around it is the dictionary's.
    expect(detail(entry, 'es')).toMatch(/^Agregado el /);
  });

  it('has nothing to say without any of the three', () => {
    const entry = makeEntryRow({
      entry: { ...makeEntryRow().entry, addedAt: '', startedAt: null, playtimeMinutes: null },
    });
    expect(backlogDetail(entry, NOW)).toBeNull();
  });
});

describe('upcomingSubtitle', () => {
  it('shows the catalog list, never a played-on list, for a game that is not out', () => {
    const entry = makeEntryRow({
      platforms: ['PS5', 'PC'],
      entry: { ...makeEntryRow().entry, playedPlatforms: ['PC'] },
    });
    expect(upcomingSubtitle(entry)).toBe('PS5 · PC');
  });

  it('caps the catalog list at three', () => {
    const entry = makeEntryRow({ platforms: ['PC', 'PS5', 'Switch 2', 'Xbox'] });
    expect(upcomingSubtitle(entry)).toBe('PC · PS5 · Switch 2 +1');
  });

  it('has nothing to say without any platform', () => {
    const entry = makeEntryRow({ platforms: [] });
    expect(upcomingSubtitle(entry)).toBeNull();
  });
});


describe('gameCount', () => {
  it('says "1 game" for one, and "games" for everything else', () => {
    // next.md writes the line as "{n} games", which reads as "1 games" the
    // moment a two-item backlog loses one to the Start button.
    expect(gameCount(1)).toBe('1 game');
    expect(gameCount(0)).toBe('0 games');
    expect(gameCount(2)).toBe('2 games');
    expect(gameCount(12)).toBe('12 games');
    expect(gameCount(1, 'es')).toBe('1 juego');
    expect(gameCount(12, 'es')).toBe('12 juegos');
  });
});
