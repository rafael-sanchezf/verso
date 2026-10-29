import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Ranking a game never writes a finished date (VER-224, feature-ideas item 13;
 * VER-281 for the rest). The screens that rank a game call `startRanking`;
 * only a finish said on purpose calls `markFinished` (the Details sheet's date
 * and Home's "Done playing").
 *
 * These callers are components, and this suite never loads a component, so the
 * rule is held at the source: each file below must call `startRanking` and must
 * not call or import `markFinished`. The behaviour behind both functions is
 * tested against the local stack in packages/api (entries.test.ts,
 * onboarding.test.ts).
 */

const src = join(__dirname, '..', 'src', 'screens');

/** The code of a file, with block comments and whole-line comments taken out. */
function code(path: string): string {
  return readFileSync(join(src, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const RANKS_A_GAME = [
  'game/game-page-screen.tsx',
  'search/add-sheet.tsx',
  'search/search-screen.tsx',
  'onboarding/deck-screen.tsx',
  'onboarding/seeds-screen.tsx',
];

const SAYS_FINISHED = ['game/details-sheet.tsx', 'home/use-home-data.ts'];

describe('the screens that rank a game', () => {
  it.each(RANKS_A_GAME)('%s calls startRanking and never markFinished', (path) => {
    const source = code(path);
    expect(source).toMatch(/\bstartRanking\b/);
    expect(source).not.toMatch(/\bmarkFinished\b/);
  });
});

describe('the screens that say a game was finished', () => {
  it.each(SAYS_FINISHED)('%s still calls markFinished', (path) => {
    expect(code(path)).toMatch(/\bmarkFinished\b/);
  });
});
