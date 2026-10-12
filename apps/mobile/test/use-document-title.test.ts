import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hook is one `useFocusEffect` around an assignment. The router's hook is
// replaced by a stand-in that keeps the effect and its cleanup, so the test can
// play a screen coming into focus and going out, and `useCallback` is the
// identity so the hook can be called outside a component.
const focus = vi.hoisted(() => ({
  effect: undefined as undefined | (() => void | (() => void)),
}));

vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    focus.effect = effect;
  },
}));
vi.mock('react', () => ({ useCallback: (fn: unknown) => fn }));

import { useDocumentTitle as useWebTitle } from '../src/lib/use-document-title.web';
import { useDocumentTitle as useNativeTitle } from '../src/lib/use-document-title';

const doc = { title: 'Verso' };

beforeEach(() => {
  doc.title = 'Verso';
  focus.effect = undefined;
  vi.stubGlobal('document', doc);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Render the hook for `page` and bring the screen into focus; returns the blur. */
function focusScreen(page?: string | null): () => void {
  useWebTitle(page);
  const cleanup = focus.effect?.();
  return typeof cleanup === 'function' ? cleanup : () => undefined;
}

describe('useDocumentTitle on web', () => {
  it('sets the tab title when the screen comes into focus', () => {
    focusScreen('Ranking');
    expect(doc.title).toBe('Ranking · Verso');
  });

  it('puts the plain app name back when the screen goes out of focus', () => {
    const blur = focusScreen('Settings');
    blur();
    expect(doc.title).toBe('Verso');
  });

  it('ends on the second screen when one named screen replaces another', () => {
    // React Navigation emits the blur before the focus.
    const blurHome = focusScreen('Home');
    blurHome();
    focusScreen('Search');
    expect(doc.title).toBe('Search · Verso');
  });

  it('says just "Verso" for a screen with no page name', () => {
    doc.title = 'Ranking · Verso';
    focusScreen();
    expect(doc.title).toBe('Verso');
  });

  it('does nothing where there is no document', () => {
    vi.stubGlobal('document', undefined);
    expect(() => focusScreen('Home')).not.toThrow();
  });
});

describe('useDocumentTitle on native', () => {
  it('is a no-op: it touches no document and registers no effect', () => {
    useNativeTitle('Home');
    expect(doc.title).toBe('Verso');
    expect(focus.effect).toBeUndefined();
  });
});
