/**
 * "Add a medium" (VER-203): one tap on a choice switches at once, then
 * writes; the server's row replaces the guess; a failed write puts it back.
 */

import type { Profile } from '@verso/api';
import { describe, expect, it, vi } from 'vitest';

import { addMediumHandlers, mediaWith, withMediumAdded, type AddMediumDeps } from '../src/screens/home/add-medium';
import { resolveMedium, type LiveMedium } from '../src/state/medium-model';

function profile(media: Profile['media']): Profile {
  return { id: 'me', media } as Profile;
}

/** A cache, an active medium and a write the test controls. */
function harness(start: Profile | undefined, medium: LiveMedium = 'game') {
  const state = { cached: start, medium };
  let settle!: { resolve: (p: Profile) => void; reject: (e: unknown) => void };
  const deps: AddMediumDeps = {
    readProfile: () => state.cached,
    writeProfile: vi.fn((next: Profile | undefined) => {
      state.cached = next;
    }),
    cancelProfileReads: vi.fn(async () => undefined),
    currentMedium: () => state.medium,
    setMedium: vi.fn((next: LiveMedium) => {
      state.medium = next;
    }),
    save: vi.fn(
      () =>
        new Promise<Profile>((resolve, reject) => {
          settle = { resolve, reject };
        }),
    ),
    invalidate: vi.fn(),
    reportFailure: vi.fn(),
  };
  /** What the switcher shows: the stored medium resolved against the cached profile. */
  const shown = () => resolveMedium(state.medium, state.cached?.media);
  return { state, deps, shown, settle: () => settle };
}

/** TanStack's order for one `mutate`: onMutate, then the write, then the outcome, then onSettled. */
async function run(h: ReturnType<typeof harness>, next: LiveMedium, outcome: () => void) {
  const handlers = addMediumHandlers(h.deps);
  const context = await handlers.onMutate(next);
  const write = handlers.mutationFn(next);
  outcome();
  try {
    handlers.onSuccess(await write);
  } catch (error) {
    handlers.onError(error, next, context);
  }
  handlers.onSettled();
}

describe('mediaWith', () => {
  it('adds the choice once, in the switcher order', () => {
    expect(mediaWith(['game'], 'movie')).toEqual(['game', 'movie']);
    expect(mediaWith(['movie'], 'game')).toEqual(['game', 'movie']);
    expect(mediaWith(['game', 'movie'], 'movie')).toEqual(['game', 'movie']);
  });

  it('reads no media as games, as the switcher does', () => {
    expect(mediaWith(null, 'movie')).toEqual(['game', 'movie']);
    expect(mediaWith(undefined, 'movie')).toEqual(['game', 'movie']);
  });
});

describe('withMediumAdded', () => {
  it('keeps the rest of the profile', () => {
    const before = { ...profile(['game']), username: 'rafa' } as Profile;
    expect(withMediumAdded(before, 'movie')).toEqual({ ...before, media: ['game', 'movie'] });
  });
});

describe('addMediumHandlers', () => {
  it('switches on the tap itself, before the write has answered', async () => {
    const h = harness(profile(['game']));
    const handlers = addMediumHandlers(h.deps);

    const mutating = handlers.onMutate('movie');
    // Nothing awaited yet: the cache and the medium already moved.
    expect(h.state.cached?.media).toEqual(['game', 'movie']);
    expect(h.shown()).toBe('movie');
    await mutating;

    expect(h.deps.save).not.toHaveBeenCalled();
    void handlers.mutationFn('movie');
    expect(h.deps.save).toHaveBeenCalledWith(['game', 'movie']);
    expect(h.deps.cancelProfileReads).toHaveBeenCalledTimes(1);
  });

  it('needs the cache moved too: a stored medium the profile does not track yet never shows', () => {
    // Before VER-203 the medium was set on success while the cache still said
    // games only, and resolveMedium keeps you out of an untracked medium.
    expect(resolveMedium('movie', ['game'])).toBe('game');
  });

  it('takes the server row when the write answers, and refetches after', async () => {
    const h = harness(profile(['game']));
    const server = { ...profile(['game', 'movie']), username: 'from_server' } as Profile;
    await run(h, 'movie', () => h.settle().resolve(server));

    expect(h.state.cached).toBe(server);
    expect(h.shown()).toBe('movie');
    expect(h.deps.reportFailure).not.toHaveBeenCalled();
    expect(h.deps.invalidate).toHaveBeenCalledTimes(1);
  });

  it('puts the profile and the medium back when the write fails, and says so', async () => {
    const before = profile(['game']);
    const h = harness(before);
    await run(h, 'movie', () => h.settle().reject(new Error('offline')));

    expect(h.state.cached).toBe(before);
    expect(h.state.medium).toBe('game');
    expect(h.shown()).toBe('game');
    expect(h.deps.reportFailure).toHaveBeenCalledTimes(1);
    expect(h.deps.invalidate).toHaveBeenCalledTimes(1);
  });

  it('never writes fewer media than are tracked', async () => {
    const h = harness(profile(['movie']), 'movie');
    const handlers = addMediumHandlers(h.deps);
    await handlers.onMutate('game');
    void handlers.mutationFn('game');
    expect(h.deps.save).toHaveBeenCalledWith(['game', 'movie']);
  });
});
