/**
 * Every sentence the app says, in English: the source of truth for the
 * dictionary's shape. Spanish (`es.ts`) is typed against it, so a key added
 * here without its translation does not compile.
 *
 * One module per wave under `en/` (spanish-build.md), each grouped by screen
 * in the order the screen shows them, so a wave that translates a screen
 * reads top to bottom beside it and edits no file another wave edits. `{name}`
 * is a variable (`interpolate` in model.ts). The words are the screens' own,
 * moved here unchanged; changing a sentence is a copy decision and goes
 * through Rafa.
 *
 * Dates, weekdays and hour counts are not here: `lib/format.ts` owns them.
 */

import { browse } from './en/browse';
import { common, language } from './en/common';
import { lists } from './en/lists';
import { onboarding } from './en/onboarding';
import { profile } from './en/profile';
import { settings } from './en/settings';
import { shell } from './en/shell';
import { signIn } from './en/sign-in';

export const en = { common, language, signIn, settings, shell, onboarding, browse, lists, profile } as const;
