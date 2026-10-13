/**
 * The one language store the app reads.
 *
 * Its own module, with no React and no native import, because two kinds of
 * code share it: the screens, through the hooks in `index.ts`, and the pure
 * helpers (`lib/format.ts`) that print a date or an hour count and have to
 * know which language to print it in without rendering anything. The binding
 * to the device and to storage happens once, in `index.ts`; the node tests
 * set the preference directly.
 */

import { createLanguageStore } from './model';

export const languageStore = createLanguageStore();
