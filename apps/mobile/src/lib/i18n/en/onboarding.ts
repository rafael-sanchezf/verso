/**
 * Wave 3: onboarding. The media questionnaire, the bulk-entry deck per medium, the session and its review (screens/onboarding).
 *
 * Grouped by screen in the order a new user meets them: media, platforms,
 * the three seeds, the deck page and its slider, the session, the review,
 * Link Steam, then Ranking's banner, which opens the session from the tabs.
 * The pure modules in screens/onboarding return these keys (or a key and its
 * variables) rather than sentences, so they stay free of the language store;
 * the screens call `t`.
 *
 * Where English says the same thing for one and for many ("1 new", "2 new"),
 * the pair is kept anyway (`One`, `Other`), because Spanish does not.
 */

export const onboarding = {
  media: {
    /** The browser tab's title. */
    documentTitle: 'Set up Verso',
    kicker: "Let's set up Verso",
    title: 'What do you want to keep track of?',
    subtitle: 'Pick one or more. You can add the rest later.',
    tiles: {
      game: 'Games',
      movie: 'Movies',
      tv: 'TV',
      books: 'Books',
    },
    /** A held tile's VoiceOver label: `Books, coming soon. We'll tell you`. */
    heldLabel: '{name}, coming soon. {line}',
    comingSoon: 'Coming soon',
    notify: 'Notify me when available',
    notified: "We'll tell you",
    couldNotSave: "Couldn't save that. Check your connection and try again.",
  },
  platforms: {
    /** Also the browser tab's title. */
    title: 'Where do you play?',
    kicker: "Let's set up your ranking",
    /** The title for a returning user, from the deck's "Add a platform". */
    editTitle: 'Add a platform',
    subtitle: 'Now or before. Tap every one.',
    couldNotLoad: "Couldn't load your platforms.",
    couldNotSave: "Couldn't save your platforms. Check your connection and try again.",
    skipForNow: 'Skip for now',
  },
  seeds: {
    /** Also the browser tab's title. */
    title: 'Three games you love',
    subtitle: 'They go straight into your ranking and tune what we ask about next.',
    /** Search's field, passed in: the same words as Search's own default. */
    searchPlaceholder: 'Search games',
    couldNotSearch: "Couldn't search just now.",
    noMatch: 'No games match “{query}”.',
    yourThree: 'YOUR THREE',
    remove: 'Remove {title}',
    slots: {
      first: 'Add a first',
      second: 'Add a second',
      third: 'Add a third',
    },
    couldNotSave: "Couldn't save these. Check your connection and try again.",
    rankThese: 'Rank these',
    footnote: 'Their genres tune the deck; you can always add more later.',
  },
  deck: {
    /** The browser tab's title. */
    documentTitle: 'Rank popular games',
    /** The header's `x`, for VoiceOver. */
    doneForNow: 'Done for now',
    /** The line under the header's bar: `4 of 10`. */
    progress: '{count} of {goal}',
    popularOnOne: 'Popular on {platform} · tap how it was',
    popularOnTwo: 'Popular on {first} and {second} · tap how it was',
    popularEverywhere: 'Popular everywhere · tap how it was',
    addPlatform: 'Add a platform',
    loading: 'Loading',
    empty: "That's every popular game on your platforms.",
    couldNotLoad: "Couldn't load these games.",
    showMore: 'Show {count} more',
    couldNotSave: "Couldn't save some of these. Check your connection and try again.",
    /** The button with nothing marked, when it is disabled. */
    rankThese: 'Rank these',
    rankTheseCount: 'Rank these {count}',
  },
  slider: {
    /** After the track, and over each stop on the axis, worst first. */
    tiers: {
      disliked: "Didn't like",
      fine: 'Fine',
      liked: 'Liked',
      loved: 'Loved',
    },
    /** What the word says while the row is untouched. */
    slide: 'Slide',
    /** The row's VoiceOver label. */
    howWas: 'How was {title}',
  },
  session: {
    nothingToRank: 'Nothing to rank here.',
    close: 'Close',
    /** The header's `x`, for VoiceOver. */
    stopHere: 'Stop here',
    couldNotSave: "Couldn't save your ranking.",
    saving: 'Saving',
    /** The tier pass's line under the bar: `3 of 8`. */
    passProgress: '{index} of {total}',
    /** The questions' line under the bar. The count is an estimate. */
    remaining: 'About {count} more to place everything',
    /** The bar's VoiceOver label while there is nothing to count yet. */
    progress: 'Progress',
    justPlayed: 'just played',
    justWatched: 'just watched',
    /** An opponent already ranked: `ranked #12 · 8.9`. */
    rankedPlace: 'ranked #{rank} · {score}',
    tooClose: 'Too close to call',
    cantCompare: "Can't compare these",
    placeRest: 'Place the rest for me',
    couldNotLoadComparison: "Couldn't load that comparison.",
    couldNotLoadRanking: "Couldn't load your ranking.",
    loading: 'Loading',
  },
  review: {
    nothingToReview: 'Nothing to review here.',
    close: 'Close',
    title: 'Look right?',
    /** The line under the title when this session reaches ten. */
    tenRanked: 'Ten ranked.',
    /** The line under the title otherwise, its parts joined by ` · `. */
    freshOne: '{count} new',
    freshOther: '{count} new',
    provisionalOne: '{count} placed by us',
    provisionalOther: '{count} placed by us',
    dragToFix: 'drag to fix',
    /** A row's VoiceOver label: `3. Hades, new, placed by us, about 8.9`. */
    rowLabel: '{rank}. {title}, {score}',
    rowLabelNew: '{rank}. {title}, new, {score}',
    placedAbout: 'placed by us, about {score}',
    moveUp: 'Move up',
    moveDown: 'Move down',
    drag: 'Drag {title}',
    /** The folded rows: `· · ·  4 more  · · ·`, and their VoiceOver label. */
    stretch: '· · ·  {count} more  · · ·',
    stretchLabel: '{count} more ranked games. Show them',
    done: 'Done',
    couldNotSaveOne: "Couldn't save one game. Done tries again.",
    couldNotSaveOther: "Couldn't save {count} games. Done tries again.",
    rankMore: 'Rank more',
  },
  steam: {
    /** The browser tab's title. */
    documentTitle: 'Link Steam',
    title: 'Play on PC?',
    body: 'Link Steam and we read your game list and hours played, so ranking is one tap per game.',
    weRead: 'We read: your games and hours. Steam needs Game details set to Public; we show you how.',
    weNeverRead: 'We never read friends, messages or purchases. Unlink any time in Settings.',
    reading: 'Reading your Steam library…',
    notNow: 'Not now',
    /** The title over the games the import found. */
    fromSteam: 'From Steam',
  },
  /** Ranking's banner over the games played and not ranked yet. */
  rankingBanner: {
    one: '1 played game to rank',
    other: '{count} played games to rank',
  },
} as const;
