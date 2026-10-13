/**
 * The active medium (movies-build.md, PR 2, item 1): the rules in
 * `state/medium-model.ts` and the persisted holder `state/medium.ts` wraps.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  addableMedia,
  createMediumStore,
  MEDIUM_STORAGE_KEY,
  MEDIUM_WORDS,
  otherMedia,
  parseStoredMedium,
  resolveMedium,
  trackedMedia,
  type MediumStorage,
} from '../src/state/medium-model';

function memoryStorage(initial: Record<string, string> = {}): MediumStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: vi.fn(async (key: string) => data[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      data[key] = value;
    }),
  };
}

describe('parseStoredMedium', () => {
  it('reads the two live media and nothing else', () => {
    expect(parseStoredMedium('game')).toBe('game');
    expect(parseStoredMedium('movie')).toBe('movie');
    expect(parseStoredMedium('tv')).toBeNull();
    expect(parseStoredMedium('games')).toBeNull();
    expect(parseStoredMedium(null)).toBeNull();
  });
});

describe('resolveMedium', () => {
  it('keeps the stored medium while the profile tracks it', () => {
    expect(resolveMedium('movie', ['game', 'movie'])).toBe('movie');
  });

  it('opens on the first tracked medium when nothing is stored (default 1)', () => {
    expect(resolveMedium(null, ['movie'])).toBe('movie');
    expect(resolveMedium(null, ['game', 'movie'])).toBe('game');
  });

  it('never lands in a medium the profile stopped tracking', () => {
    expect(resolveMedium('game', ['movie'])).toBe('movie');
  });

  it('trusts the stored choice before the profile answers, games with none', () => {
    expect(resolveMedium('movie', undefined)).toBe('movie');
    expect(resolveMedium(null, undefined)).toBe('game');
  });

  it('treats held media in the profile as nothing', () => {
    expect(resolveMedium(null, ['tv'])).toBe('game');
  });
});

describe('the switcher lists', () => {
  it('offers the other tracked media as icons and the untracked live ones to add', () => {
    expect(trackedMedia(['movie', 'game'])).toEqual(['game', 'movie']);
    expect(otherMedia('game', ['game', 'movie'])).toEqual(['movie']);
    expect(otherMedia('game', ['game'])).toEqual([]);
    expect(addableMedia(['game'])).toEqual(['movie']);
    expect(addableMedia(['game', 'movie'])).toEqual([]);
  });

  it('names the fourth tab by the medium', () => {
    expect(MEDIUM_WORDS.game.listTab).toBe('Next');
    expect(MEDIUM_WORDS.movie.listTab).toBe('Watchlist');
    expect(MEDIUM_WORDS.movie.plural).toBe('Movies');
  });
});

describe('createMediumStore', () => {
  it('reads the stored choice on hydrate and tells subscribers', async () => {
    const storage = memoryStorage({ [MEDIUM_STORAGE_KEY]: 'movie' });
    const store = createMediumStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.get()).toBeNull();
    await store.hydrate();
    expect(store.get()).toBe('movie');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('writes a switch under verso.medium', () => {
    const storage = memoryStorage();
    const store = createMediumStore(storage);
    store.set('movie');
    expect(store.get()).toBe('movie');
    expect(storage.setItem).toHaveBeenCalledWith('verso.medium', 'movie');
  });

  it('keeps a choice made before the stored one answered', async () => {
    const storage = memoryStorage({ [MEDIUM_STORAGE_KEY]: 'game' });
    const store = createMediumStore(storage);
    const hydrating = store.hydrate();
    store.set('movie');
    await hydrating;
    expect(store.get()).toBe('movie');
  });

  it('survives a storage that fails both ways', async () => {
    const store = createMediumStore({
      getItem: () => Promise.reject(new Error('no storage')),
      setItem: () => Promise.reject(new Error('no storage')),
    });
    await store.hydrate();
    expect(store.get()).toBeNull();
    store.set('game');
    expect(store.get()).toBe('game');
  });

  it('ignores a stored value that is not a live medium', async () => {
    const store = createMediumStore(memoryStorage({ [MEDIUM_STORAGE_KEY]: 'books' }));
    await store.hydrate();
    expect(store.get()).toBeNull();
  });
});
