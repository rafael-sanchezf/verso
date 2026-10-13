/**
 * Wave 2: the shell. Tab labels (`ui/tab-bar`), the medium's words (`state/medium-model`), screen headers, the medium switcher, empty states and the error line, the dialog's buttons, the native stack titles in `app/_layout.tsx`.
 *
 * Grouped by component in the order each shows its words. The dialog's OK and
 * Cancel, and the sheet frame's Cancel and Save, are `common`'s, which already
 * holds the buttons every dialog has. Steam and Letterboxd as stack titles are
 * names and stay out of the dictionary; the dev-only Primitives title reads
 * Settings' own row (`settings.primitives`).
 */

export const shell = {
  /** The tab bar, left to right (`ui/tab-bar.tsx`; rule 8: a tab and its page share a word). */
  tabs: {
    home: 'Home',
    search: 'Search',
    ranking: 'Ranking',
    next: 'Next',
    profile: 'Profile',
  },
  /** Each live medium's words (`MEDIUM_WORDS` in `state/medium-model.ts`). */
  medium: {
    game: {
      /** The switcher's and the chip's word. */
      plural: 'Games',
      /** Inside a sentence. */
      noun: 'game',
      /** The fourth tab's word. */
      listTab: 'Next',
    },
    movie: {
      plural: 'Movies',
      noun: 'film',
      listTab: 'Watchlist',
    },
  },
  /** Home's medium switcher and its "add a medium" sheet (`screens/home/media-switcher.tsx`). */
  mediaSwitcher: {
    switchTo: 'Switch to {medium}',
    addMedium: 'Add a medium',
    addMessage: 'Track it beside what you track now. Each one keeps its own list.',
    couldNotAdd: "Couldn't add it",
    checkConnection: 'Check your connection and try again.',
  },
  /** The tier chip's words (`ui/tier-chip.tsx`): decided in ui-principles.md, never paraphrased. */
  tiers: {
    loved: 'Loved it',
    liked: 'Liked it',
    fine: 'It was fine',
    disliked: "Didn't like it",
  },
  /** The filter chip and its sheet (`ui/filter-chip.tsx`). */
  filterChip: {
    hint: 'Opens a list to choose from',
    any: 'Any',
  },
  /** The date row (`ui/date-field.tsx`, `date-field.web.tsx`). */
  dateField: {
    clear: 'Clear',
    add: 'Add',
  },
  /** `ui/error-line.tsx`. */
  errorLine: {
    retry: 'Retry',
  },
  /** The backdrop of a sheet that is not a route (`ui/sheet.tsx`). */
  sheet: {
    close: 'Close',
  },
  /** The placeholder route (`ui/not-built-yet.tsx`). */
  notBuiltYet: {
    notBuiltYet: 'not built yet',
  },
  /** The native stack titles (`app/_layout.tsx`). */
  stack: {
    steamPrivacy: 'Steam privacy',
    fromSteam: 'From Steam',
  },
} as const;
