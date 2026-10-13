/**
 * Wave 5: Ranking, Next, Watchlist and Calendar, the ask sheet (screens/ranking, next, watchlist, ask).
 *
 * Grouped by screen, in the order each screen shows its words. A count that
 * reads differently for one has two keys, `one` and `other`, and the screen
 * chooses (spanish-build.md, rule 3). The pure modules the node suite loads
 * (`next/row-text.ts`, `next/backlog-sort.ts`, `watchlist/filters.ts`,
 * `watchlist/calendar.ts`, `ask/trace.ts`) return these keys rather than the
 * sentences, and the component says them.
 */

export const lists = {
  /** One sentence two screens say after a write that did not land. */
  checkConnection: 'Check your connection and try again.',

  ranking: {
    title: 'Ranking',
    filmsToRank: {
      one: '1 watched film to rank',
      other: '{count} watched films to rank',
    },
    fromYourDiary: 'From your diary',
    all: 'All',
    genre: 'Genre',
    platform: 'Platform',
    listView: 'List view',
    gridView: 'Grid view',
    loading: 'Loading your ranking',
    couldNotLoad: "Couldn't load your ranking.",
    nothingRankedYet: 'Nothing ranked yet',
    twoWaysToStart: 'Two ways to start.',
    rankPopularGames: 'Rank popular games',
    iKnowWhatIPlayed: 'I know what I played',
    rankYourFilms: "Rank the films you've watched.",
    rankFilms: {
      one: 'Rank 1 film',
      other: 'Rank {count} films',
    },
    addAFilm: 'Add a film',
    noFilmsMatch: 'No films match',
    noGamesMatch: 'No games match',
    nothingFits: 'Nothing you have ranked fits that filter.',
    clearFilters: 'Clear filters',
    moveDidNotSave: 'That move did not save',
  },

  next: {
    title: 'Up next',
    backlog: 'Backlog',
    upcoming: 'Upcoming',
    games: {
      one: '1 game',
      other: '{count} games',
    },
    /** The sub row's trailing words, after the count. */
    sortLabel: {
      yourOrder: 'your order',
      dateAdded: 'by date added',
      releaseDate: 'by release date',
      timeToBeat: 'by time to beat',
    },
    sort: 'Sort ▾',
    /** The native menu's rows. */
    sortMenu: {
      yourOrder: 'Your order',
      dateAdded: 'Date added',
      releaseDate: 'Release date',
      timeToBeat: 'Time to beat',
    },
    started: 'Started {date}',
    added: 'Added {date}',
    startPlaying: 'Start playing',
    backlogEmptyTitle: 'Your backlog is empty',
    backlogEmptyBody: 'Add games you want to play from Search.',
    searchGames: 'Search games',
    byReleaseDate: 'by release date',
    upcomingEmptyTitle: 'Nothing upcoming',
    upcomingEmptyBody: 'Unreleased games you add land here.',
    couldNotLoad: 'Something went wrong loading this list.',
  },

  watchlist: {
    title: 'Watchlist',
    watchlist: 'Watchlist',
    calendar: 'Calendar',
    couldNotLoad: "Couldn't load your watchlist.",
    emptyTitle: 'Add films you want to watch',
    emptyBody: 'Find one in Search and tap Want to watch.',
    search: 'Search',
    scopeOnServicesHint: 'On your services. Show everywhere',
    scopeEverywhereHint: 'Everywhere. Show on your services',
    films: {
      one: '1 film',
      other: '{count} films',
    },
    onYourServices: 'On your services',
    everywhere: 'Everywhere',
    filtersSet: 'Filters, {count} set',
    filters: 'Filters',
    remove: 'Remove {label}',
    pickServices: "Pick your services in Settings to see what's on them. Until then, tap the scope for everywhere.",
    couldNotFilter: "Couldn't filter your watchlist.",
    noFilmsMatch: 'No films match',
    nothingOnServices: 'Nothing on your services fits. Try everywhere, or fewer filters.',
    nothingFits: 'Nothing on your watchlist fits those filters.',
    clearFilters: 'Clear filters',
  },

  filterSheet: {
    title: 'Filters',
    reset: 'Reset',
    length: 'Length',
    /** Over the slider's knob: "Under 2 h". */
    under: 'Under {length}',
    anyLength: 'Any length',
    /** The last stop's tick. */
    any: 'Any',
    runtimeByTmdb: 'Runtime, by TMDB',
    genre: 'Genre',
    more: 'More',
    director: 'Director',
    anyDirector: 'Any director',
    clearDirector: 'Clear director',
    decade: 'Decade',
    decades: {
      '2020s': '2020s',
      '2010s': '2010s',
      '2000s': '2000s',
      '1990s': '1990s',
      older: 'Older',
    },
    sort: 'Sort',
    sorts: {
      added: 'Added',
      runtime: 'Runtime',
      year: 'Year',
      rating: 'Rating',
    },
    show: {
      one: 'Show 1 film',
      other: 'Show {count} films',
    },
  },

  calendar: {
    couldNotLoad: "Couldn't load your calendar.",
    emptyTitle: 'Nothing coming up',
    emptyBody: 'Films you want to watch that are in theaters or not out yet land here, with the day they stream.',
    now: 'NOW',
    later: 'LATER',
    inTheatersSince: 'In theaters since {date}',
    going: 'Going',
    inTheaters: 'In theaters',
    streamingOn: 'Streaming on {service}',
    streamingOnDate: 'Streaming {date}',
    releaseDate: 'Release date',
    goingQuestion: 'Going? ›',
    change: 'Change',
  },

  going: {
    couldNotSave: "Couldn't save that day",
    title: 'When are you going?',
    day: 'Day',
    pickTodayOrAhead: 'Pick today or a day ahead.',
    notGoing: 'Not going',
  },

  ask: {
    /** The browser tab's title. */
    title: 'Ask',
    close: 'Close',
    chip: {
      movie: 'Movies',
      game: 'Games',
    },
    question: {
      movie: 'What do you want to watch?',
      game: 'What do you feel like playing?',
    },
    placeholder: {
      movie: 'something for the whole family',
      game: 'something to play with a friend',
    },
    send: 'Ask',
    trace: {
      reading: 'Reading your ranked list',
      leavingOutSeen: "Leaving out what you've seen",
      leavingOutPlayed: "Leaving out what you've played",
      watchlistFirst: 'Keeping your watchlist first',
      backlogFirst: 'Keeping your backlog first',
      everyAge: 'Keeping it for every age',
      coop: 'Keeping the co-op games',
      group: 'Keeping it for a group',
      scary: 'Keeping it scary',
      light: 'Keeping it light',
      short: 'Keeping it short',
      classics: 'Keeping to the classics',
      recent: 'Keeping it recent',
      underMinutes: 'Keeping it under {minutes} minutes',
      underHour: 'Keeping it under {hours} hour',
      underHours: 'Keeping it under {hours} hours',
      underHoursMinutes: 'Keeping it under {hours} h {minutes}',
    },
    couldNotGet: "Couldn't get recommendations.",
    anything: 'Anything',
    change: 'Change',
    empty: 'Nothing on your list fits that yet. Try other words.',
    limitTitle: "That's all for today",
    limitBody: "You've asked as many times as a day allows. These are the engine's top three, with plain reasons.",
    picksLabel: 'Our recommendations, with the reason',
    findingMore: 'Finding three more…',
    noMore: 'No more picks for this',
    anotherThree: 'Another three',
    couldNotGetMore: "Couldn't get three more.",
    caption: {
      movieServices: "From your watchlist and what's on your services",
      movie: 'From your watchlist and the catalog',
      game: 'From your backlog and the catalog',
    },
    consentTitle: 'Before your first recommendation',
    consentBody:
      'To write the reason behind each pick, Verso sends your question, your ranked list and your notes to an AI model. Not now still shows picks, with plainer reasons.',
    allow: 'Allow',
    notNow: 'Not now',
  },
} as const;
