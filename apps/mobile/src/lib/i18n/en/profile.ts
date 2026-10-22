/**
 * Wave 6: Profile, Activity, Edit profile, the Steam and Letterboxd imports (screens/profile, steam, letterboxd).
 *
 * Grouped by screen in the order each screen shows its sentences. The pure
 * modules the node suite loads (profile/model.ts, profile/identity.ts, the
 * Steam outcome and link modules, letterboxd/model.ts) never import the
 * binding: they return a key, or take the screen's `t` as an argument, so the
 * sentences live here and nowhere else.
 *
 * The month and weekday names Activity and the joined line need are not here:
 * they are `lib/format.ts`'s tables (`dateTables`, `monthYear`), the one copy.
 */

export const profile = {
  /** The joint Profile (screens/profile/profile-screen.tsx and pieces.tsx). */
  page: {
    title: 'Profile',
    settings: 'Settings',
    setYourName: 'Set your name',
    somethingWentWrong: 'Something went wrong.',
    /** The identity row's second line, after the handle: `joined Sep 2026`. */
    joined: 'joined {date}',
    editProfile: 'Edit profile',
    edit: 'Edit',
    all: 'All',
    couldNotLoadNumbers: "Couldn't load your numbers.",
    tiles: {
      watched: 'Watched',
      played: 'Played',
      ranked: 'Ranked',
      /** The Top tile's value; its label is `ofRankers`. */
      topPercent: 'Top {percent}%',
      ofRankers: 'of rankers',
      hours: 'Hours',
    },
    friends: {
      title: 'Friends',
      noneYet: 'Friends, none yet',
      find: 'Find friends',
      comingTitle: 'Friends are coming',
      comingBody: 'Following friends and seeing what they rank comes with the next release.',
    },
    /** A medium's section on All: `48 ranked · 12 backlog`. */
    sectionCounts: {
      game: '{ranked} ranked · {list} backlog',
      movie: '{ranked} ranked · {list} watchlist',
    },
    topTitle: {
      game: 'Your top games',
      movie: 'Your top films',
    },
    seeAll: 'See all',
    seeAllRanked: {
      game: 'See all ranked games',
      movie: 'See all ranked movies',
    },
    noneRanked: {
      game: 'No games ranked yet.',
      movie: 'No films ranked yet.',
    },
    shareProfile: 'Share my profile',
    shareTop: 'Share my top 10',
    copied: 'Copied',
    copiedBody: 'Paste it wherever you want to share it.',
    couldNotCopy: 'Could not copy it',
    couldNotCopyBody: 'Your browser did not allow it.',
    recent: 'Recent',
    seeAllLink: 'See all ›',
    seeAllActivity: 'See all activity',
    nothingYet: 'Nothing yet',
    nothingYetBody: {
      movie: 'Log or rank a film and it shows up here.',
      game: 'Rank a game from its page and it shows up here.',
      all: 'What you rank, watch and finish shows up here.',
    },
    /** Recent's trailing time: `Today`, `4d`, `2w`, then the day. */
    ago: {
      today: 'Today',
      days: '{count}d',
      weeks: '{count}w',
    },
    /** The plain-text top tens on the share sheet. */
    share: {
      heading: {
        game: 'My top games',
        movie: 'My top movies',
      },
      signature: 'Ranked with Verso',
      signatureWithHandle: 'Ranked with Verso · @{handle}',
    },
    photo: 'Your profile photo',
  },

  /** The medium words Profile, Activity and Edit profile show beside each other. */
  media: {
    game: 'Games',
    movie: 'Movies',
  },

  /** One line of activity: the verb, the title, the score when ranked. */
  activityLine: {
    ranked: 'Ranked {title}',
    watched: 'Watched {title}',
    finished: 'Finished {title}',
    rankedScored: 'Ranked {title} · {score}',
    watchedScored: 'Watched {title} · {score}',
    finishedScored: 'Finished {title} · {score}',
  },

  /** Activity, the month calendar (screens/profile/activity-screen.tsx). */
  activity: {
    title: 'Activity',
    back: 'Profile',
    /** The header: `October 2026`. */
    monthTitle: '{month} {year}',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    somethingWentWrong: 'Something went wrong.',
    nothingThisMonth: 'Nothing this month',
    nothingThisMonthBody: 'What you rank, watch and finish lands on its day.',
    day: 'Day {day}: {title}',
    dayAndMore: 'Day {day}: {title} and {count} more',
  },

  /** Edit profile (screens/profile/edit-profile-screen.tsx). */
  edit: {
    title: 'Edit profile',
    back: 'Profile',
    couldNotSave: "Couldn't save",
    checkConnection: 'Check your connection and try again.',
    couldNotChangePhoto: "Couldn't change your photo",
    couldNotChangePhotoBody: 'Try a different photo, or check your connection.',
    somethingWentWrong: 'Something went wrong.',
    uploading: 'Uploading…',
    changePhoto: 'Change photo',
    name: 'Name',
    namePlaceholder: 'Your name',
    username: 'Username',
    usernamePlaceholder: '@handle',
    /** `UsernameError`'s two kinds, worded as @verso/api words them. */
    usernameTaken: 'That username is taken',
    usernameInvalid: 'A username is 3 to 24 characters: lowercase letters, numbers, and underscores',
    usernameHint: 'Letters, numbers and underscores, 3 to 24. Friends find you by it.',
    mediaYouTrack: 'MEDIA YOU TRACK',
    atLeastOne: 'You track at least one',
    tv: 'TV',
    books: 'Books',
    coming: 'Coming',
    publicProfile: 'Public profile',
    publicHint:
      'Off: only you see this page. On: anyone with your link sees your rankings, never your notes or your diary.',
  },

  /** Settings → Data's messages (screens/profile/export-import.ts). */
  data: {
    notValidJson: 'the file is not valid JSON',
    somethingWentWrong: 'Something went wrong. Try again.',
  },

  /** Settings → Steam and its two pushed screens (screens/steam). */
  steam: {
    title: 'Steam',
    couldNotLoadLink: "Couldn't load your Steam link.",
    loading: 'Loading',
    notLinkedLead: 'We read your games and hours played. Steam needs Game details set to Public; we show you how.',
    notLinkedNever: 'We never read friends, messages or purchases. Unlink any time here.',
    unlinkTitle: 'Unlink Steam?',
    unlinkMessage:
      'Verso stops reading your Steam account and deletes the copy of your library it stored. Hours already imported stay on your games.',
    unlink: 'Unlink',
    couldNotUnlink: "Couldn't unlink Steam",
    checkConnection: 'Check your connection and try again.',
    account: 'Steam account',
    steamId: 'Steam ID',
    openProfile: 'Open profile on Steam',
    library: 'Library',
    lastImport: 'Last import',
    importLibrary: 'Import library',
    gamesToAdd: 'Games to add from Steam',
    importNote: 'Reads your Steam games and hours played. Nothing is added to your lists until you add it.',
    /** The "Last import" value. */
    lastImportValue: {
      inProgress: 'In progress',
      never: 'Never',
      private: '{when} · Private profile',
      failed: '{when} · Failed',
    },
    /** An import's answer that stays on the screen as one line. */
    lines: {
      stillPrivate: "Steam still isn't sharing your games. Check the three settings above, then try again.",
      rateLimited: 'Imports are ten minutes apart. Try again {when}.',
      notLinked: "Steam isn't linked to this account any more.",
    },
    retryAfter: {
      now: 'now',
      aboutAMinute: 'in about a minute',
      aboutMinutes: 'in about {minutes} minutes',
    },
    /** A thrown function call (screens/steam/errors.ts). */
    errors: {
      linkNotSetUp: "Linking Steam isn't set up on our server yet.",
      couldNotOpenSignIn: "Couldn't open Steam's sign-in page. Check your connection and try again.",
      importNotSetUp: "Importing from Steam isn't set up on our server yet.",
      notAnswering: "Steam isn't answering. Try again in a few minutes.",
      couldNotImport: "Couldn't import from Steam. Check your connection and try again.",
    },
    /** The link's round trip (link-flow.ts, link-return.ts, use-steam-link.ts). */
    link: {
      button: 'Link Steam',
      opening: 'Opening Steam…',
      waiting: 'Waiting for Steam…',
      checking: 'Checking the link…',
      webOnly: 'Linking Steam works in the phone app for now.',
      couldNotCheck: "Couldn't check whether the link worked. Check your connection and try again.",
      didNotSave: "Steam signed you in, but the link didn't save. Please try again.",
      couldNotOpenSignIn: "Couldn't open Steam's sign-in page. Please try again.",
      linkedElsewhere: 'That Steam account is linked to another Verso account. Unlink it there first, then try again.',
      expired: 'That link attempt expired. Tap Link Steam to start a new one.',
      notSetUp: "Linking Steam isn't set up on our server yet.",
      notConfirmed: "Steam didn't confirm the link. Please try again.",
    },
    /** Valve's attribution (attribution.tsx). */
    attribution: {
      poweredBy: 'Powered by Steam',
      poweredByLabel: 'Powered by Steam. Opens the Steam store.',
      trademark: 'Steam and the Steam logo are trademarks of Valve Corporation.',
    },
    /** The games an import found (candidates-screen.tsx). */
    candidates: {
      title: 'From Steam',
      loading: 'Loading',
      couldNotLoad: "Couldn't load your Steam games.",
      nothingToAdd: 'Nothing to add',
      nothingToAddBody: 'Every game from your Steam library that we could match is already in your lists.',
      done: 'Done',
      /** The header, whole: one, several, or the first 200. */
      headerOne: "1 game in your Steam library that aren't in your lists yet, least played first. Tap + to add one.",
      headerMany:
        "{count} games in your Steam library that aren't in your lists yet, least played first. Tap + to add one.",
      headerCapped:
        "The first {count} games in your Steam library that aren't in your lists yet, least played first. Tap + to add one.",
      playtimeHidden:
        'Steam reported no hours for any game. If “Always keep my total playtime private” is ticked on Steam, untick it and import again.',
      openPrivacy: 'Open Privacy Settings on Steam',
      openPrivacyLabel: 'Open Privacy Settings on Steam. Opens Steam.',
      noHours: 'No hours on Steam',
      hours: '{hours} on Steam',
    },
    /** The privacy checklist (privacy-screen.tsx). */
    privacy: {
      title: 'Steam privacy',
      heading: "Steam didn't share your games",
      lead: 'Steam only shares a library whose Game details are Public. Change three settings on Steam, then try again.',
      step1: 'On Steam, open your Profile, then Edit Profile, then Privacy Settings.',
      step2: "Set Game details to Public. My profile has to be Public too, or Steam won't allow it.",
      step3: 'Untick “Always keep my total playtime private”, so your hours come with your games.',
      stepLabel: 'Step {number}. {text}',
      tryingAgain: 'Trying again…',
      tryAgain: 'Try again',
      notNow: 'Not now',
    },
  },

  /** Import from Letterboxd (screens/letterboxd). */
  letterboxd: {
    pick: {
      title: 'Bring your films over',
      lead: 'Every film you logged on Letterboxd is marked watched, with each date in your diary. Watched is not ranked: you rank them when you like. If you want, your star ratings can place them as a first draft you check before anything is saved.',
      step1: 'In Letterboxd, open Settings, then Import & Export, then Export your data.',
      step2: 'Letterboxd emails you a zip. Open it in Files; it unzips with a tap.',
      step3: 'Choose ratings.csv and diary.csv from inside it. Both at once is best.',
      reading: 'Reading your files',
      matching: 'Matching your films to the catalog…',
      chooseFiles: 'Choose files',
      nothingSaved: 'Nothing is saved until you confirm on the next screen.',
    },
    /** `1 film` / `42 films`, inside a sentence that does not agree with it. */
    films: {
      one: '1 film',
      other: '{count} films',
    },
    /** The last state. Each count has a sentence for one and for several. */
    done: {
      rankedOne: '1 film ranked',
      rankedMany: '{count} films ranked',
      markedWatchedOne: '1 film marked watched',
      markedWatchedMany: '{count} films marked watched',
      button: 'Done',
      watchedWaitingOne: '1 film marked watched, waiting to be ranked.',
      watchedWaitingMany: '{count} films marked watched, waiting to be ranked.',
      watchedNotRanked: 'Watched, not ranked: they wait to be ranked whenever you like.',
      diaryOne: '1 watch added to your diary.',
      diaryMany: '{count} watches added to your diary.',
      notFoundOne: '1 film not found in the catalog.',
      notFoundMany: '{count} films not found in the catalog.',
    },
    review: {
      discardTitle: 'Discard this import?',
      discardMessage: 'Nothing has been saved, and the films you moved go back to where the stars put them.',
      keepReviewing: 'Keep reviewing',
      discard: 'Discard',
      title: 'Look right?',
      diaryOne: '1 watch goes into your diary with the day you logged it.',
      diaryMany: '{count} watches go into your diary with the day you logged them.',
      modeWatched: 'Mark watched',
      modeRank: 'Rank from my stars',
      rankHint:
        'A star rating is not a comparison, so this is a draft: ratings set it, ties are in the order you watched them. Hold ≡ and drag to move a film, across a tier line to change its tier.',
      fuzzyOne: '1 film was matched by a close title and shows the name from your file underneath.',
      fuzzyMany: '{count} films were matched by a close title and show the name from your file underneath.',
      watchedHintOne:
        '1 film has a star rating. They are marked watched and wait to be ranked; turn on Rank from my stars to place them from the ratings instead.',
      watchedHintMany:
        '{count} films have a star rating. They are marked watched and wait to be ranked; turn on Rank from my stars to place them from the ratings instead.',
      watchedNotRanked: 'Watched, not ranked ({count})',
      watchedNotRankedHint: 'No rating on Letterboxd. They are marked watched and wait to be ranked.',
      markedWatched: 'Marked watched ({count})',
      markedWatchedHint: 'Watched is not ranked: these wait to be ranked, whenever you like.',
      notInCatalog: 'Not in the catalog ({count})',
      notInCatalogHint: 'Nothing will be written for these. The catalog grows; try again later or add them by search.',
      alreadyRanked: 'Already in your ranking ({count})',
      alreadyRankedHint: "Your own placement stays; the file's rating is ignored.",
      andMore: 'and {count} more',
      importing: 'Importing…',
      confirmRank: 'Confirm ranking and import {films}',
      confirmWatchedOne: 'Mark 1 film watched',
      confirmWatchedMany: 'Mark {count} films watched',
      cancel: 'Cancel',
    },
    /** The line above the list (`reviewHeadline`), its parts joined with ` · `. */
    headline: {
      toRank: '{films} to rank',
      watchedUnratedOne: '1 watched, unrated',
      watchedUnratedMany: '{count} watched, unrated',
      toMarkWatchedOne: '1 film to mark watched',
      toMarkWatchedMany: '{count} films to mark watched',
      notFoundOne: '1 not found',
      notFoundMany: '{count} not found',
    },
    /** The draft list's rows (review-list.tsx). */
    row: {
      alreadyRanked: 'already ranked',
      fromLetterboxd: 'from Letterboxd',
      placedFromStars: 'placed from your stars, about {score}',
      inYourFile: 'In your file as “{title}”',
      moveUp: 'Move up',
      moveDown: 'Move down',
      drag: 'Drag {title}',
    },
    /** One line per picked file (files.ts). */
    files: {
      rowsOne: '{name}: 1 row',
      rowsMany: '{name}: {count} rows',
      rowsOneUnreadable: '{name}: 1 row, {malformed} unreadable',
      rowsManyUnreadable: '{name}: {count} rows, {malformed} unreadable',
      watchlist: '{name}: skipped, a watchlist is not watched',
      ambiguous: '{name}: skipped, could not tell watched from watchlist by its name',
      unknown: '{name}: not a Letterboxd file',
    },
    errors: {
      notAnExport:
        'None of those files is a Letterboxd export. Pick ratings.csv or diary.csv from the zip Letterboxd sent you.',
      noFilms: 'No films to import.\n{notes}',
      somethingWentWrong: 'Something went wrong. Try again.',
    },
  },
} as const;
