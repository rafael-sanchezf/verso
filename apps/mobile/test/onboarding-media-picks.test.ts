import { describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import {
  MEDIA_TILES,
  afterMedia,
  canContinue,
  mediaToStore,
  tapHeld,
  toggleMedium,
  type HeldMedium,
  type LiveMedium,
} from '../src/screens/onboarding/media-picks';

const none = new Set<LiveMedium>();

describe('the tiles', () => {
  it('draws Games and Movies live, TV and Books held, in that order', () => {
    expect(MEDIA_TILES.map((tile) => [translate('en', tile.name), tile.live])).toEqual([
      ['Games', true],
      ['Movies', true],
      ['TV', false],
      ['Books', false],
    ]);
  });
});

describe('the live tiles', () => {
  it('toggle', () => {
    const picked = toggleMedium(none, 'game');
    expect([...picked]).toEqual(['game']);
    expect([...toggleMedium(picked, 'game')]).toEqual([]);
  });

  it('let Continue through once one is picked, and there is no skip', () => {
    expect(canContinue(none)).toBe(false);
    expect(canContinue(new Set(['movie']))).toBe(true);
  });

  it('store the media in the grid order', () => {
    expect(mediaToStore(new Set<LiveMedium>(['movie', 'game']))).toEqual(['game', 'movie']);
  });

  it('go to the platforms when games is picked, and to the services for movies alone', () => {
    expect(afterMedia(new Set(['game']))).toBe('platforms');
    expect(afterMedia(new Set<LiveMedium>(['game', 'movie']))).toBe('platforms');
    expect(afterMedia(new Set(['movie']))).toBe('services');
  });
});

describe('the held tiles', () => {
  it('log interest on the first tap only', () => {
    const first = tapHeld(new Set<HeldMedium>(), 'tv');
    expect(first.log).toBe(true);
    expect([...first.notified]).toEqual(['tv']);

    const second = tapHeld(first.notified, 'tv');
    expect(second.log).toBe(false);
    expect([...second.notified]).toEqual(['tv']);
  });

  it('keep each medium apart', () => {
    const tv = tapHeld(new Set<HeldMedium>(), 'tv');
    const books = tapHeld(tv.notified, 'books');
    expect(books.log).toBe(true);
    expect([...books.notified].sort()).toEqual(['books', 'tv']);
  });
});
