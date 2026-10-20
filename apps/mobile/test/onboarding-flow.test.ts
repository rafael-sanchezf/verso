import { afterEach, describe, expect, it } from 'vitest';

import {
  addedMedia,
  afterPath,
  clearFlow,
  currentFlow,
  firstStep,
  flowMedia,
  startFlow,
} from '../src/screens/onboarding/flow';
import { afterMedia } from '../src/screens/onboarding/media-picks';

afterEach(() => clearFlow());

describe('the route after the media question', () => {
  it('starts games at the platforms and movies at the services', () => {
    expect(firstStep('game')).toBe('platforms');
    expect(firstStep('movie')).toBe('services');
  });

  it('runs games first when both were picked, whatever order they were tapped in', () => {
    expect(flowMedia(['movie', 'game'])).toEqual(['game', 'movie']);
    expect(afterMedia(new Set(['movie', 'game'] as const))).toBe('platforms');
    expect(afterMedia(new Set(['game'] as const))).toBe('platforms');
    expect(afterMedia(new Set(['movie'] as const))).toBe('services');
  });
});

describe('the end of a path', () => {
  it('goes on to the movies path when a new account picked both', () => {
    const flow = { media: ['game', 'movie'] as const, origin: 'new' as const };
    expect(afterPath(flow, 'game')).toEqual({ kind: 'step', step: 'services', medium: 'movie' });
    expect(afterPath(flow, 'movie')).toEqual({ kind: 'home', medium: 'movie', origin: 'new' });
  });

  it('lands on Home in the one medium a new account picked', () => {
    expect(afterPath({ media: ['movie'], origin: 'new' }, 'movie')).toEqual({ kind: 'home', medium: 'movie', origin: 'new' });
    expect(afterPath({ media: ['game'], origin: 'new' }, 'game')).toEqual({ kind: 'home', medium: 'game', origin: 'new' });
  });

  it("lands an added medium on that medium's Home, back over the tabs (VER-198)", () => {
    expect(afterPath({ media: ['movie'], origin: 'added' }, 'movie')).toEqual({
      kind: 'home',
      medium: 'movie',
      origin: 'added',
    });
  });

  it('goes Home in the medium that ended when no flow is running (a reload)', () => {
    expect(afterPath(null, 'game')).toEqual({ kind: 'home', medium: 'game', origin: 'new' });
    expect(afterPath(null, 'movie')).toEqual({ kind: 'home', medium: 'movie', origin: 'new' });
  });

  it('goes Home when a path ends that the flow did not list', () => {
    expect(afterPath({ media: ['movie'], origin: 'added' }, 'game')).toEqual({ kind: 'home', medium: 'game', origin: 'added' });
  });
});

describe('the holder', () => {
  it('keeps the run in games-first order until cleared', () => {
    expect(currentFlow()).toBeNull();
    startFlow({ media: ['movie', 'game'], origin: 'new' });
    expect(currentFlow()).toEqual({ media: ['game', 'movie'], origin: 'new' });
    clearFlow();
    expect(currentFlow()).toBeNull();
  });
});

describe('Edit profile’s check', () => {
  it('runs only the media the save added', () => {
    expect(addedMedia(['game'], ['game', 'movie'])).toEqual(['movie']);
    expect(addedMedia(['movie'], ['movie', 'game'])).toEqual(['game']);
    expect(addedMedia(['game', 'movie'], ['game'])).toEqual([]);
    expect(addedMedia(['game'], ['game'])).toEqual([]);
    expect(addedMedia(null, ['movie', 'game'])).toEqual(['game', 'movie']);
  });
});
