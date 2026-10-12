import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the app's pure modules.
 *
 * Deliberately narrow: `test/` only, so this never tries to load a component
 * and never needs a React Native environment or a renderer. Anything that
 * imports from `react-native` is tested on the simulator instead, which is
 * where its behaviour actually lives. `src/lib/format.ts` is the kind of thing
 * that belongs here — all rules, no rendering, and wrong in ways nobody notices
 * by looking at a screen.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
