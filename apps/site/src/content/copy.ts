/**
 * Every string on the site, in one place.
 *
 * The copy rules say Rafa's sentences are never drafted for him:
 * he gives the angle and the words. So every entry marked `Slot` is plain
 * product copy standing in for his line, drafted from docs/private/reframe.md, the
 * roadmap's decision 21, the facts in docs/private/design/site-brief.md, his own
 * sentences in the brief's "The thesis, in Rafa's words" and, since round
 * three, the options in docs/private/research/site-notes/copy-options.md; he replaces
 * or signs it. The drafts keep the rules his lines should keep too: no
 * "AI-powered", "personalized" or "for you" (onboarding guidelines, principle
 * 13; site brief, inference e), no "this one or that one", no "tonight" as a
 * brand word (Movik, the nearest neighbor, owns it), no number that is not
 * real (ui-principles rule 9), the vision in the tense of intent and the beta
 * in the tense of fact. Wherever the engine is described, it is the subject
 * of a working verb (learns, reads, picks) and the source is named (the games
 * and movies you rank, your own list), and the claim is the join: ranking in,
 * picks with a reason from your own list out (similar-sites.md: BEST already
 * ships the ranking alone).
 *
 * Since decision 31 (2026-10-08, docs/design/brand-identity.md) his two
 * corrections hold for every line: lead with what the AI does for the
 * person, not with the ranking mechanic, and never "two at a time"; and a
 * surface that shows recommendations is labelled as recommendations, never
 * in words that read like the person's own list. The words on his brand
 * board are his and final, the tagline among them.
 *
 * Entries marked `Fact` are not his voice: names, credits, link targets and
 * labels the rules require. They change when the fact does.
 */

/**
 * Fact: the site's own address, the root of the domain (decision 30:
 * `rankverso.com`, the site at the root and the web app at `app.`). It makes
 * the share image's address absolute, as link previews need (`og:image`),
 * and gives each page its canonical link and `og:url` (layout.tsx). The
 * pages stay `noindex` while this is a prototype.
 */
export const SITE_URL = 'https://rankverso.com';

/**
 * Fact: Rafa's tagline, from his brand board, his and final (decision 31;
 * brand-identity.md, "Voice and key message"). The hero's headline and the
 * share image (public/og-image.png, cut by `pnpm --filter @verso/site logo`).
 */
export const TAGLINE = "See if it's worth it before you press play.";

/**
 * Fact: where the nav's "Log in" goes (finalize round, 2026-10-08, Rafa: "the
 * Log in doesn't need to be functional; let people try to log in and fail").
 * It is the site's own static page, `/login/`, which sends nothing anywhere
 * (app/login/page.tsx). When the web app is hosted at
 * `https://app.rankverso.com` (decision 30; site brief, inference a), this
 * becomes that address and the page goes. The old `APP_URL` constant, Expo's
 * dev server on localhost, had no other reader and is gone.
 */
export const LOGIN_HREF = '/login/';

/**
 * Fact: the site's one address, at the domain (decision 30): where every
 * "Request access" writes, and the contact line in the footer. It is the
 * only place the address is written. It delivers once Rafa's forwarding
 * at Porkbun is set up (runbook section 11, before the switch). No form and
 * no third-party service: a request is an email, answered by hand with an
 * invite (site brief, the access channel).
 */
export const CONTACT_EMAIL = 'hello@rankverso.com';

/** Fact: the subject every "Request access" email opens with. It carries nothing about the reader. */
export const ACCESS_SUBJECT = 'Verso access request';

/** The `mailto:` behind every "Request access" (the nav, the hero, the closing panel). */
export const ACCESS_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(ACCESS_SUBJECT)}`;

/**
 * The two media the page switches between (decision 23: games and movies
 * ship together). Since round four the switch at the top drives the whole
 * page, so every string below that names the medium comes in a `games` and
 * a `movies` version; the headline and subline say "games and movies" and
 * stay one string.
 */
export type Medium = 'games' | 'movies';

export const copy = {
  meta: {
    // Fact: the working name, adopted 2026-09-15 and not final.
    title: 'Verso',
    // Slot: the one-line description search results and link previews show,
    // from the hero's two lines and the join (ranking in, picks with a reason out).
    description:
      'Verso is a recommendation engine on your side. It learns your taste from the games and movies you rank and answers with three picks from your own list, each with a reason.',
    // Fact: what the share image shows (public/og-image.png, cut by `pnpm
    // --filter @verso/site logo` from Rafa's mark): his board's billboard.
    shareImageAlt: `The Verso mark and wordmark in white on the brand green, beside the tagline "${TAGLINE}"`,
  },

  nav: {
    // Fact: the wordmark, set beside Rafa's mark in the lockup (decision 31;
    // components/verso-mark.tsx) in the nav and the footer.
    wordmark: 'Verso',
    // Slot: nav label.
    howItWorks: 'How it works',
    // Slot: nav label for the log-in page (LOGIN_HREF), and that page's title.
    logIn: 'Log in',
    // Slot: the one filled button, in the nav, the hero and the closing panel.
    requestAccess: 'Request access',
    // Fact: the keyboard's skip link, before the nav.
    skipToContent: 'Skip to content',
  },

  /*
   * Fact: the four tiers' words, as the app's TierChip writes them
   * (apps/mobile/src/ui/tier-chip.tsx, `TIER_LABELS`; decided in
   * ui-principles.md and never paraphrased). Every chip in a mocked screen
   * says one of these (components/tier.tsx).
   */
  tiers: {
    loved: 'Loved it',
    liked: 'Liked it',
    fine: 'It was fine',
    disliked: "Didn't like it",
  },

  /*
   * The hero says the promise in Rafa's tagline (decision 31) and the subline
   * names the engine; the thesis strip under it
   * carries the problem ("In an age of AI, your time is the scarce thing"),
   * which Rafa moved out of the header in his reaction to round two.
   */
  hero: {
    // Rafa's tagline from his brand board (decision 31 calls the board's words
    // his and final), live since 2026-10-08: the one copy change for him to
    // confirm. Round six's headline, option 1 of copy-options.md, is the
    // alternative:
    // title: 'Verso is a recommendation engine on your side.',
    // Since the finalize round the last word follows the switch (Rafa,
    // 2026-10-08: on the games side "press play" is "press start", with an
    // animation as it changes; globals.css, "The tagline's last word"). The
    // movies side, the default, reads exactly as `TAGLINE`, which the share
    // image and the description keep.
    titleLead: "See if it's worth it before you press",
    titleEnd: { movies: 'play.', games: 'start.' },
    // Slot: option 1's subline, as written in copy-options.md. "Nobody pays it"
    // is his premise, not yet a recorded decision (copy-options flag 5). Kept
    // under the tagline; its opening "It" no longer has "Verso" in the
    // headline to point back to, a question for Rafa.
    subtitle:
      'Verso learns your taste from the games and movies you rank, and nobody pays it to put a pick in front of you.',
    // Slot: option 1's subline with the join said outright, if he wants the
    // picks in the subline rather than only on the phone beside it.
    // subtitle: 'It learns your taste from the games and movies you rank and answers with three picks from your own list, each with a reason.',
    /*
     * The alternatives, for Rafa to swap in: uncomment one pair and delete
     * the live pair above. Each is a headline and its subline.
     *
     * Option 2 (the mechanism, both halves of the thesis; its subline leads
     * with the ranking mechanic, against decision 31's first rule):
     * title: "Rank what you finish, and Verso finds what's next.",
     * subtitle: 'Every time you choose between two, its recommendation engine learns your taste, and each pick comes with a reason from your own list.',
     *
     * Option 3 (the outcome, his problem statement turned around), whose
     * headline is now the live one; its subline:
     * subtitle: "Verso's recommendation engine learns your taste from what you rank and tells you which game or movie is worth your evening, and why.",
     *
     * Option 9 (the time thesis said as a consequence, the shape of
     * StoryGraph's "Because life's too short for a book you're not in the
     * mood for", similar-sites.md):
     * title: 'Free time is too short for the wrong movie.',
     * subtitle: "Verso's recommendation engine learns your taste from the games and movies you rank, then picks three from your own list with a reason each.",
     */
    // Slot: the quiet second action, an anchor to How it works.
    secondary: 'See how it works',
  },

  /*
   * The medium switch at the top of the page (round four): a radio group of
   * two, which writes `?medium=` to the address and drives every section.
   */
  switch: {
    // Fact: what a screen reader hears for the group.
    label: 'Show the page for',
    // Fact: the two segments, the app's medium names.
    games: 'Games',
    movies: 'Movies',
    // Fact: the two media that come in V1 (Rafa's reaction to round four),
    // shown after the two live ones as disabled segments.
    tv: 'TV',
    books: 'Books',
    // Fact: the small tag on each, and what a screen reader hears after the
    // name ("TV, coming"); the tag itself is hidden from it.
    soon: 'soon',
    coming: 'coming',
    // Fact: what a screen reader hears once the page has changed.
    announce: { games: 'The page now shows games.', movies: 'The page now shows movies.' },
  },

  /*
   * The hero's phone: a live illustration of the vision's ask in plain words
   * (the finder), on the games side and the movies side. It is not the app's
   * design: the finder's design is wave C's, drawn in Figma later. Every
   * reason cites a title the person ranked in Loved or Liked, as the beta's
   * reasons must (decision 24), and the trace says where the picks come from.
   *
   * Round six (Rafa's reaction to round five, 2 and 5): the typed asks are
   * ones a stranger would type, the picks are well-known titles, and each
   * reason cites the list as speech in the second person ("you told me you
   * loved", "you keep going back to", "you said you liked"), under 20 words.
   */
  ask: {
    games: {
      // Fact: the medium chip the app's screens carry, and the switch's label.
      chip: 'Games',
      // Slot: the ask, from Rafa's direction, without "tonight".
      question: 'What do you feel like playing?',
      // Slot: the answer, typed in the person's own words (round six: an ask
      // a stranger would type; the other was "a game I can finish this weekend").
      answer: 'something to play with a friend',
      // Slot: the thinking state, a trace that names its source.
      trace: ['Reading your ranked list', "Leaving out what you've finished", 'Keeping the co-op games'],
      // Slot: the label over the picks (round six follow-up: the engine's
      // picks, not a queue the person wrote; since decision 31's second rule,
      // labelled as recommendations, was "Our picks, with the reason").
      from: 'Our recommendations, with the reason',
      picks: [
        {
          // Slot: sample pick and reason. Outer Wilds is in Loved (scene 2,
          // the Ranking shot); Portal 2 is on the list in scene 3.
          title: 'Portal 2',
          art: 'portal2',
          reason: 'A co-op campaign built for two, and you told me you loved the puzzles in Outer Wilds.',
        },
        {
          // Slot: sample pick and reason. Hades is first in Loved (scene 2).
          title: 'Stardew Valley',
          art: 'stardewValley',
          reason: 'One more day on a shared farm, and you keep going back to Hades for one more run.',
        },
        {
          // Slot: sample pick and reason. Elden Ring is in Loved (scene 2).
          title: 'Terraria',
          art: 'terraria',
          reason: 'Dig, build and take on bosses together, and you told me you loved Elden Ring.',
        },
      ],
      // Fact: what a screen reader hears for the whole phone, which is drawn, not a screenshot.
      label:
        'An illustration of asking Verso in plain words. The question "What do you feel like playing?" is answered "something to play with a friend". Verso reads the ranked list and answers with three picks from the person\'s own list, each with a one-line reason: Portal 2, Stardew Valley and Terraria.',
    },
    movies: {
      // Fact.
      chip: 'Movies',
      // Slot: copy-options.md section 5, without "tonight".
      question: 'What do you want to watch?',
      // Slot: the answer (round six: an ask a stranger would type; the other
      // was "a movie for a Friday night with friends", too long for the field).
      answer: 'something for the whole family',
      // Slot: the thinking state.
      trace: ['Reading your ranked list', "Leaving out what you've seen", 'Keeping it for every age'],
      // Slot: the label over the picks, as on the games side (round six follow-up; decision 31).
      from: 'Our recommendations, with the reason',
      picks: [
        {
          // Slot: sample pick and reason. The Dark Knight is first in Loved (scene 2).
          title: 'Spider-Man: Into the Spider-Verse',
          art: 'spiderVerse',
          reason: 'A superhero movie for every age, and you told me you loved The Dark Knight.',
        },
        {
          // Slot: sample pick and reason. Finding Nemo is in Liked on the strip's movies Ranking phone (since the finalize round; was a Loved title off screen).
          title: 'Toy Story',
          art: 'toyStory',
          reason: 'Funny for the kids, clever for the grown-ups, and you keep going back to Finding Nemo.',
        },
        {
          // Slot: sample pick and reason. Paul King directed both; Wonka is in Liked on the strip's movies Ranking phone.
          title: 'Paddington 2',
          art: 'paddington2',
          reason: "Funny at any age, and it's from the director of Wonka, which you said you liked.",
        },
      ],
      // Fact.
      label:
        'An illustration of asking Verso in plain words. The question "What do you want to watch?" is answered "something for the whole family". Verso reads the ranked list and answers with three picks from the person\'s watchlist, each with a one-line reason: Spider-Man: Into the Spider-Verse, Toy Story and Paddington 2.',
    },
  },

  /*
   * How it works describes the beta as it is, in the tense of fact. Each
   * step's sentence narrates its scene frame by frame (copy-options.md,
   * section 4, the A lines; 3A without "tonight"). Since round four each
   * sentence names the medium the switch shows; the titles name neither.
   */
  how: {
    // Slot: section heading.
    title: 'How it works',
    steps: [
      {
        // Slot: step 1 title (copy-options 1A).
        title: 'Pick the one you liked more',
        // Slot: step 1 sentence (copy-options 1A), and its movies version.
        body: {
          games: "Two games you've played appear side by side, and you tap the one you enjoyed more.",
          movies: "Two movies you've watched appear side by side, and you tap the one you enjoyed more.",
        },
      },
      {
        // Slot: step 2 title (copy-options 2A).
        title: 'It finds its place',
        // Slot: step 2 sentence (copy-options 2A), and its movies version.
        body: {
          games:
            'Each answer narrows the search until the game slides into its spot on your ranked list, and the engine learns from where it lands.',
          movies:
            'Each answer narrows the search until the movie slides into its spot on your ranked list, and the engine learns from where it lands.',
        },
      },
      {
        // Slot: step 3 title, in place of 3A's "Ask what tonight".
        title: 'Ask in your own words',
        // Slot: step 3 sentence (copy-options 3A without "tonight"), one
        // medium each since round four; round three's read "what to play or
        // watch". For movies the picks come from the watchlist, the movies
        // pool (decision 18). The finder ships with the private beta by
        // mid-December (decisions 22 and 24), so this is intent until then
        // (copy-options flag 3). Round six addresses the ask to the engine,
        // as the scene's question now does (Rafa's reaction to round five, 4).
        // Games since the finalize round: a genre and the hours to beat it,
        // the way a player asks (Rafa, 2026-10-08: nobody beats a game in one
        // sitting, so nobody asks for "a short game").
        body: {
          games:
            'You ask the engine for a genre and the hours you can give it, and it answers with three picks from your list, each with a reason.',
          movies:
            'You ask the engine what to watch and how long you have, and it answers with three picks from your watchlist, each with a reason.',
        },
      },
    ],
    /*
     * The three scenes, one story per medium: the pick in scene 1 is the
     * title that slots in at scene 2, and scene 3 asks of the same person's
     * list. The reasons cite titles the person ranked in Loved, as the beta's
     * must (decision 24), and the hero's reasons cite the same people's
     * lists (Outer Wilds, Hades and Elden Ring in Loved; The Dark Knight in
     * Loved). The scores re-spread when a title is added, as
     * the ranking does (ranking-algorithm.md, "The score"). The art is
     * Steam's and TMDB's, served from the site (art.ts).
     *
     * Games: round three's Clair Obscur (from the compare shot) became
     * Baldur's Gate 3, from the Steam list; the strip's compare shot still
     * shows Clair Obscur. Scene 3 asks for a genre under a number of hours
     * to beat (finalize round, Rafa: a player asks "genre X under Y hours",
     * never "a short game"), and 20 hours for an RPG, since most RPGs run
     * long and a tighter ceiling leaves almost nothing to pick. The hours
     * are IGDB's `normally`, the figure the app shows (Elden Ring's ~119 h on
     * Home), read 2026-10-08: Transistor 7.5, Undertale 8.3 and South Park:
     * The Stick of Truth 12.5, all RPGs; left out are two RPGs that run long,
     * The Witcher 3 (70.8) and Persona 5 Royal (117.9), and Inside (3.5),
     * short but a puzzle platformer.
     *
     * Movies, since round six with films a stranger knows: Dune: Part Two
     * against Interstellar, both sci-fi; Dune slots into Loved at 2, under
     * The Dark Knight and over Interstellar and Inception; six on the
     * watchlist narrow to the three under two hours (Get Out 104 minutes,
     * Barbie 114, Arrival 116; Oppenheimer, Everything Everywhere All at Once
     * and Top Gun: Maverick run longer). No runtime is shown, so no number is
     * on the screen. Scene 3's question is addressed to the engine on both
     * sides (Rafa's reaction to round five, 4).
     */
    scenes: {
      games: {
        pick: {
          // Fact: the ranking's one fixed prompt, with the pair's genre.
          prompt: 'Which RPG did you enjoy more?',
          // Slot: the pair, the second one's rank and score as the compare screen shows them.
          chosen: { title: "Baldur's Gate 3", note: 'just finished', cover: 'baldursGate3' },
          other: { title: 'Elden Ring', note: 'ranked #2 · 9.6', cover: 'eldenRing' },
          // Fact.
          label:
            'Two game covers side by side under "Which RPG did you enjoy more?": Baldur\'s Gate 3 and Elden Ring. Baldur\'s Gate 3 gets tapped, and Elden Ring steps back.',
        },
        slot: {
          // Fact: the tier the divider names, drawn as the app's chip (copy.tiers).
          tier: 'loved',
          // Fact: the Ranking shot's Loved tier, with Baldur's Gate 3 slotted in at 2.
          rows: [
            { title: 'Hades', meta: '2020 · Roguelike', cover: 'hades', score: '9.8' },
            { title: "Baldur's Gate 3", meta: '2023 · RPG', cover: 'baldursGate3', score: '9.6', isNew: true },
            { title: 'Elden Ring', meta: '2022 · Action RPG', cover: 'eldenRing', score: '9.4', was: { rank: 2, score: '9.6' } },
            { title: 'Outer Wilds', meta: '2019 · Exploration', cover: 'outerWilds', score: '9.2', was: { rank: 3, score: '9.3' } },
          ],
          // Fact.
          label:
            "The Loved tier of a ranked list. Baldur's Gate 3 slides in at number 2, between Hades and Elden Ring, and the rows under it move down a place as their scores re-spread.",
        },
        ask: {
          // Slot: the question, typed in the person's words and asked of the engine.
          question: 'What RPG can I beat in under 20 hours?',
          // Slot: the label over the list (round six follow-up: the engine's
          // picks; labelled as recommendations since decision 31, was "Our picks").
          from: 'Our recommendations',
          // Slot: six games on the list; `pick` numbers the three picks, the
          // RPGs under 20 hours to beat (the hours in the comment above).
          covers: [
            { cover: 'witcher3', title: 'The Witcher 3: Wild Hunt' },
            { cover: 'transistor', title: 'Transistor', pick: 1 },
            { cover: 'inside', title: 'Inside' },
            { cover: 'undertale', title: 'Undertale', pick: 2 },
            { cover: 'persona5Royal', title: 'Persona 5 Royal' },
            { cover: 'southPark', title: 'South Park: The Stick of Truth', pick: 3 },
          ],
          // Slot: the first pick's reason, citing a Loved title in scene 2 by
          // what the two share, as the engine would, never by who made them
          // (Rafa, 2026-10-08: "from the studio behind" is not a reason):
          // Transistor's combat is built by combining Functions, as a Hades
          // run is built from boons; IGDB's time to beat is 7.5 hours.
          reasonTitle: 'Transistor',
          reason: 'has the mix-and-match combat you loved in Hades, and takes about 8 hours to beat.',
          // Fact.
          label:
            'The question "What RPG can I beat in under 20 hours?" is typed. Of six games on the person\'s list, three are picked and numbered, Transistor, Undertale and South Park: The Stick of Truth, and the first comes with its reason: the mix-and-match combat the person loved in Hades, and about 8 hours to beat.',
        },
      },
      movies: {
        pick: {
          // Fact: the ranking's one fixed prompt, with the pair's genre.
          prompt: 'Which sci-fi movie did you enjoy more?',
          // Slot: the pair.
          chosen: { title: 'Dune: Part Two', note: 'just watched', cover: 'duneTwo' },
          other: { title: 'Interstellar', note: 'ranked #2 · 9.6', cover: 'interstellar' },
          // Fact.
          label:
            'Two movie posters side by side under "Which sci-fi movie did you enjoy more?": Dune: Part Two and Interstellar. Dune: Part Two gets tapped, and Interstellar steps back.',
        },
        slot: {
          // Fact: the tier the divider names, drawn as the app's chip (copy.tiers).
          tier: 'loved',
          // Slot: a Loved tier, with Dune: Part Two slotted in at 2.
          rows: [
            { title: 'The Dark Knight', meta: '2008 · Action', cover: 'darkKnight', score: '9.8' },
            { title: 'Dune: Part Two', meta: '2024 · Sci-fi', cover: 'duneTwo', score: '9.6', isNew: true },
            { title: 'Interstellar', meta: '2014 · Sci-fi', cover: 'interstellar', score: '9.4', was: { rank: 2, score: '9.6' } },
            { title: 'Inception', meta: '2010 · Sci-fi', cover: 'inception', score: '9.2', was: { rank: 3, score: '9.3' } },
          ],
          // Fact.
          label:
            'The Loved tier of a ranked list of movies. Dune: Part Two slides in at number 2, between The Dark Knight and Interstellar, and the rows under it move down a place as their scores re-spread.',
        },
        ask: {
          // Slot: the question, typed in the person's words and asked of the engine.
          question: 'What short movie would you recommend?',
          // Slot: the label over the list (round six follow-up: the engine's
          // picks; the watchlist is still the movies pool, decision 18; labelled
          // as recommendations since decision 31, was "Our picks").
          from: 'Our recommendations',
          // Slot: six films on the watchlist; `pick` numbers the three under two hours.
          covers: [
            { cover: 'oppenheimer', title: 'Oppenheimer' },
            { cover: 'arrival', title: 'Arrival', pick: 1 },
            { cover: 'everythingEverywhere', title: 'Everything Everywhere All at Once' },
            { cover: 'getOut', title: 'Get Out', pick: 2 },
            { cover: 'topGunMaverick', title: 'Top Gun: Maverick' },
            { cover: 'barbie', title: 'Barbie', pick: 3 },
          ],
          // Slot: the first pick's reason, citing a Loved title in scene 2.
          reasonTitle: 'Arrival',
          reason: 'is short, smart sci-fi, and you told me you loved Interstellar.',
          // Fact.
          label:
            'The question "What short movie would you recommend?" is typed. Of six movies on the person\'s watchlist, three are picked and numbered, Arrival, Get Out and Barbie, and the first comes with its reason: short, smart sci-fi, and the person loved Interstellar.',
        },
      },
    },
  },

  vision: {
    // Slot: the strip's heading. It names the tense: the cards are what
    // Verso is built to do, not what the beta does today.
    title: 'What Verso is built to do',
    points: [
      {
        id: 'scarce-time',
        // Slot: Rafa's problem statement, moved here from the hero header in
        // his reaction to round two ("In an age of AI, the most valuable
        // resource is human time").
        title: 'In an age of AI, your time is the scarce thing',
        // Slot: copy-options card 1, without its repeated first clause; since
        // round four it names the medium the switch shows.
        body: {
          games: "The hours you get to yourself are the most valuable thing you have, and they shouldn't go to a bad game.",
          movies: "The hours you get to yourself are the most valuable thing you have, and they shouldn't go to a bad movie.",
        },
      },
      {
        id: 'sit-through-it',
        // Slot: from "An AI can read an entire book with your perspective and
        // see if you would like it". The alternative: 'Let the AI watch it first'.
        title: 'Let the AI sit through the bad one',
        // Slot: copy-options card 2's rewrite ("your evening" for "ninety minutes").
        // One sentence for both media: it names what an AI can do with a book
        // or a film, his own example, not the medium on the page; a games
        // version would have to claim an AI plays the game through.
        body: 'An AI can read the whole book or watch the whole film with your taste in mind, before you give it your evening.',
      },
      {
        id: 'most-natural-way',
        // Slot: from "ingests data in the way that's most natural to you". The
        // alternative: 'Taught the way you\'d tell a friend' (copy-options card 3).
        title: 'Taught the most natural way',
        // Slot: copy-options card 3's rewrite, extended to the join (the
        // ranking in, the reason out; decision 24's reasons cite ranked titles).
        // Since decision 31's first rule it leads with the engine, not the
        // mechanic; it opened "You say which of two you enjoyed more, and the
        // engine learns from that ranking."
        body: 'The engine learns your taste from your rankings, and every pick it makes comes with a reason that names what you ranked.',
      },
      {
        id: 'list-is-yours',
        // Slot: copy-options "never sold" rewrite B, recommended. Read app-wide,
        // it retires decision 21's door for labeled slots in Search and Popular
        // (copy-options flag 1); "nothing it picks is ever an ad" keeps the door open.
        title: 'Your list is yours',
        // Slot: rewrite B.
        body: 'The recommendation engine answers to you and nobody else, and nothing inside Verso is an ad.',
      },
    ],
  },

  product: {
    // Slot: section heading.
    title: 'Inside the app',
    // Fact: the strip's caption, one per medium. Since 2026-10-08 the games
    // shots are the app's own web build at phone size, real games from IGDB
    // in a demo library (shots.ts has how); since the finalize round the games
    // row is those four alone, with no movies phone (Rafa, 2026-10-08). No
    // movie screen is built yet (wave B), so the movies side draws four
    // screens live on the tokens: Home and the compare step from their movie
    // designs, Search and Ranking from the app's own screens with films in
    // place of games. The caption says both (rule 9).
    caption: {
      games: "The app's web build at phone size: real games, a demo library.",
      movies: "Drawn from the app's designs with films in place. The movie screens ship with the beta.",
    },
    // Fact: the label on the strip, which scrolls sideways at phone width.
    rowLabel: { games: 'iPhone screens for games', movies: 'iPhone screens for movies' },
    /*
     * The strip's four phones per medium, in each row's order (interactive
     * strip, 2026-10-08; Rafa: "Home is bigger than the rest in this section
     * for movies, but the other phones should expand once they are clicked
     * on"). From tablet width one phone is the large one, Home first, and a
     * click on another makes it the large one (components/feature-strip.tsx).
     *
     * `expand` is a Fact: the name a screen reader gives the button over each
     * phone; the phone keeps its own label for what it shows. `caption` is
     * the one line under the phone while it is the large one, saying plainly
     * what the screen shows and why it matters, in the rules at the top of
     * this file: recommendations named as recommendations, the person's own
     * list never dressed as picks, no number that is not on the screen. The
     * movies Home's line is round five's, unchanged; the other seven are new.
     */
    screens: {
      games: [
        {
          expand: 'Show Home larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Home',
        },
        {
          expand: 'Show Search larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Search',
        },
        {
          expand: 'Show Compare larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Compare',
        },
        {
          expand: 'Show Ranking larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Ranking',
        },
      ],
      movies: [
        {
          expand: 'Show Home larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Home',
        },
        {
          expand: 'Show Search larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Search',
        },
        {
          expand: 'Show Compare larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Compare',
        },
        {
          expand: 'Show Ranking larger',
          // Fact: the screen's name alone (Rafa, 2026-10-08: no line after it).
          caption: 'Ranking',
        },
      ],
    },
    /*
     * The movies Home, drawn live in the strip (round five; Rafa: "Inside
     * the app is still raw", and the rows must read as recommendations).
     * It is decision 28 and rule 36 as approved in frame 143:173: one filled
     * button that opens the question, then rows of picks where every row
     * title is the reason, the watchlist first and larger, a genre row
     * titled by the genre word alone, a "Because you loved" row with the
     * film in italics; each card the poster alone with four facts on its
     * foot (service, genre, year, duration) and no title. Services never
     * title a row.
     *
     * The films keep the page's one story: nothing in scene 2's Loved tier
     * appears here, and the "Because you loved" film is Inception from it.
     * Round six: films a stranger knows, and the first row is "Our
     * recommendations" (Rafa's reaction to round five, 3; the app's Home
     * keeps decision 28's watchlist first).
     *
     * The facts were checked on 2026-10-08 against each film's US page on
     * TMDB (themoviedb.org/movie/<id>/watch?locale=US, JustWatch's data): the
     * service is one the film streams on by subscription that day, and the
     * year and running time are TMDB's. The genre is the one a viewer would
     * name, chosen from TMDB's own genres for the film, never simply its
     * first (Rafa, 2026-10-08: "Parasite is NOT a comedy"; a wrong genre on
     * the demo raises flags). Services change; recheck before a launch.
     * Swaps from the checks: Mad Max: Fury Road (76341) streamed on no US
     * subscription service, so The Prestige (1124), Nolan's like Inception,
     * took its card; Paddington 2 (346648) left the Comedy row for Home Alone
     * (771); and Knives Out (a mystery) and La La Land (a musical romance)
     * left it for Superbad (8363) and Bridesmaids (55721), comedies by any
     * reading, so every film in the row is one a viewer calls a comedy.
     */
    moviesHome: {
      // Fact: the medium chip, the app's MediumChip.
      chip: 'Movies',
      // Slot: the one button, the ask (decision 28).
      ask: 'What do you want to watch?',
      // Fact: the label on every row header, as the frame draws it.
      seeAll: 'See all',
      rows: [
        {
          id: 'ours',
          // Slot: the first row (round six, Rafa's words): what a stranger
          // needs to hear, in place of the app's watchlist row.
          title: 'Our recommendations',
          size: 'large',
          // Fact, each card (checked 2026-10-08): Top Gun: Maverick 361743 on
          // Paramount+ (also Netflix), Action; Parasite 496243 on Paramount+,
          // Thriller (TMDB: Comedy, Thriller, Drama).
          films: [
            { art: 'topGunMaverick', facts: ['Paramount+', 'Action', '2022', '2 h 11'] },
            { art: 'parasite', facts: ['Paramount+', 'Thriller', '2019', '2 h 13'] },
          ],
        },
        {
          id: 'genre',
          // Slot: a genre row, the genre word alone (decision 28, Rafa's round
          // seven). Every film in it is a comedy to any viewer, and Comedy is
          // among its TMDB genres.
          title: 'Comedy',
          size: 'small',
          // Fact, each card (checked 2026-10-08): Superbad 8363 on Paramount+;
          // Barbie 346698 on HBO Max; Home Alone 771 on Disney+; Bridesmaids
          // 55721 on Prime Video.
          films: [
            { art: 'superbad', facts: ['Paramount+', 'Comedy', '2007', '1 h 53'] },
            { art: 'barbie', facts: ['HBO Max', 'Comedy', '2023', '1 h 54'] },
            { art: 'homeAlone', facts: ['Disney+', 'Comedy', '1990', '1 h 43'] },
            { art: 'bridesmaids', facts: ['Prime Video', 'Comedy', '2011', '2 h 5'] },
          ],
        },
        {
          id: 'because',
          // Slot: a "Because you loved" row; the film, in italics for now
          // (decision 28), is one of scene 2's Loved tier.
          title: 'Because you loved',
          film: 'Inception',
          size: 'small',
          // Fact, each card (checked 2026-10-08): Oppenheimer 872585 on
          // Peacock, Drama; Arrival 329865 on Paramount+ (also Peacock),
          // Sci-fi; Everything Everywhere All at Once 545611 on Hulu, Sci-fi;
          // The Prestige 1124 on Netflix, Mystery.
          films: [
            { art: 'oppenheimer', facts: ['Peacock', 'Drama', '2023', '3 h 1'] },
            { art: 'arrival', facts: ['Paramount+', 'Sci-fi', '2016', '1 h 56'] },
            { art: 'everythingEverywhere', facts: ['Hulu', 'Sci-fi', '2022', '2 h 20'] },
            { art: 'thePrestige', facts: ['Netflix', 'Mystery', '2006', '2 h 10'] },
          ],
        },
      ],
      // Fact: the movies tab bar (movies-round.md, `tabbarMovies`), Home active.
      tabs: ['Home', 'Search', 'Ranking', 'Watchlist', 'Profile'],
      // The caption under the phone moved to `product.screens.movies` (interactive strip, 2026-10-08).
      // Fact: what a screen reader hears for the whole phone, which is drawn, not a screenshot.
      label:
        'The movies Home on iPhone, drawn from its design. At the top a "Movies" chip and a filled button, "What do you want to watch?". Under it, rows of posters, each row titled by its reason: "Our recommendations" with Top Gun: Maverick and Parasite as large posters, both on Paramount+; "Comedy" with Superbad on Paramount+, Barbie on HBO Max and Home Alone on Disney+; and "Because you loved Inception" with Oppenheimer on Peacock, Arrival on Paramount+ and Everything Everywhere All at Once on Hulu. Each poster carries the subscription service it streams on, its genre, year and running time, and no title.',
    },
    /*
     * The compare step for movies, drawn live (round five): the games side's
     * compare frame (26:385) with scene 1's films, Dune: Part Two just
     * watched against Interstellar at #2 (round six). The tier is the app's
     * chip on option A of decision 29 (round seven, components/tier.tsx).
     */
    moviesCompare: {
      // Fact: the tier being placed into, drawn as the app's chip (copy.tiers), and the step count.
      tier: 'loved',
      progress: '1 of ~3',
      // Fact: the two escape hatches (ranking-algorithm.md, Option A).
      tooClose: 'Too close to call',
      cantCompare: "Can't compare these",
      // Fact: the genre chip on both cards.
      genre: 'Sci-fi',
      // Fact.
      label:
        'The compare screen on iPhone for movies, drawn from its design: "Which sci-fi movie did you enjoy more?" over Dune: Part Two, just watched, and Interstellar, ranked #2 with 9.6, with "Too close to call" and "Can\'t compare these" under them.',
    },
    /*
     * Search for movies, drawn live (finalize round, 2026-10-08, in place of
     * round four's "Coming with the beta" slot): the app's Search screen
     * (apps/mobile/src/screens/search, the games shot in public/shots) with
     * films in place of games. A typed query, then result rows of poster,
     * title and "year · director", as the movies brief draws the row
     * (movies-brief.md, "Search"), each with the add pill; a title already on
     * the person's list carries the app's check instead of the plus. The
     * story holds: Dune: Part Two is scene 2's Loved film, so it is tracked.
     * Years and directors are TMDB's (438631, 841).
     */
    moviesSearch: {
      // Fact: the screen's title, the medium chip and the field's typed query.
      title: 'Search',
      chip: 'Movies',
      query: 'Dune',
      // Fact: the field's trailing button, as the app's.
      cancel: 'Cancel',
      results: [
        { title: 'Dune: Part Two', meta: '2024 · Denis Villeneuve', cover: 'duneTwo', tracked: true },
        { title: 'Dune', meta: '2021 · Denis Villeneuve', cover: 'dune', tracked: false },
        { title: 'Dune', meta: '1984 · David Lynch', cover: 'duneLynch', tracked: false },
      ],
      // Fact: what a screen reader hears for the whole phone, which is drawn, not a screenshot.
      label:
        'The Search screen on iPhone for movies, drawn from the app\'s Search screen with films in place of games: "Dune" typed in the field and three results, Dune: Part Two from 2024 by Denis Villeneuve with a check because it is already on the person\'s list, then Dune from 2021 by Denis Villeneuve and Dune from 1984 by David Lynch, each with an add button.',
    },
    /*
     * Ranking for movies, drawn live (finalize round, in place of the slot):
     * the app's Ranking screen (ranking-list.tsx, the games shot in
     * public/shots) with films in place of games. The tier dividers are the
     * app's (a rule in the tier's solid either side of its chip, copy.tiers),
     * and each row has its rank, poster, title, "year · genre" and the score
     * badge. The Loved tier is scene 2's, after Dune: Part Two slots in (the
     * page's one story, so its rows are read from `how.scenes.movies.slot`);
     * Liked holds the two titles the hero's movie reasons cite (Finding Nemo,
     * Wonka); It was fine opens on Jurassic World, running on under the tab
     * bar, so all three tier colors show, as in the games shot. Years and
     * genres are TMDB's first (12, 787699, 135397). The tools
     * row keeps "All" and "Genre" and leaves out the games' Platform filter,
     * which films do not have.
     */
    moviesRanking: {
      // Fact: the screen's title and the medium chip.
      title: 'Ranking',
      chip: 'Movies',
      // Fact: the tools row's filters.
      filters: ['All', 'Genre'],
      // Slot: the tiers under Loved, with their rows.
      tiers: [
        {
          tier: 'liked',
          rows: [
            { title: 'Finding Nemo', meta: '2003 · Animation', cover: 'findingNemo', score: '8.3' },
            { title: 'Wonka', meta: '2023 · Family', cover: 'wonka', score: '7.6' },
          ],
        },
        {
          tier: 'fine',
          rows: [{ title: 'Jurassic World', meta: '2015 · Adventure', cover: 'jurassicWorld', score: '5.8' }],
        },
      ],
      // Fact: what a screen reader hears for the whole phone.
      label:
        "The Ranking screen on iPhone for movies, drawn from the app's Ranking screen with films in place of games: The Dark Knight, Dune: Part Two, Interstellar and Inception under the Loved it divider, Finding Nemo and Wonka under Liked it, and Jurassic World under It was fine, each with its year, its genre and its score in a badge.",
    },
  },

  /*
   * The answers are Rafa's to write (his reaction to round three). An item
   * with an `answer` shows it: since round five the first one, his draft
   * from his reaction to round four. The others show `pending`; round three's
   * drafts sit in the comments beside their questions, for him to start from
   * or ignore.
   */
  faq: {
    // Slot: section heading, Rafa's "Frequently asked questions".
    title: 'Frequently asked questions',
    // Fact: the placeholder under a question with no answer yet (none since 2026-10-08).
    pending: "Rafa's answer, to come.",
    /*
     * Rewritten and locked 2026-10-08 from Rafa's two sets of notes: six
     * questions in a professional register, each answer built from his points.
     * Still slots in the sense that he may reword any line; the set and the
     * order are his. Earlier questions and drafts are in git history.
     */
    items: [
      {
        // Slot: question. Locked 2026-10-08 (Rafa: "good to lock it in").
        question: 'How does Verso decide what to recommend?',
        // Slot: answer, Rafa's points of 2026-10-08: the head-to-head picks and the notes you add when you rank
        // (decision 24 lists notes among the engine's inputs), then the two layers he described as where it goes,
        // matching people with similar taste and an AI persona that consumes the book or film first. The last
        // sentence is the vision, in the tense of intent: the beta does the first two sentences.
        answer:
          "Verso learns from your rankings. Every time you choose between two titles, and every note you add when you rank one, it gets a clearer picture of your taste. When you ask for a recommendation, it weighs what you've ranked, what you've finished and how much time you have, and explains each pick with a reason drawn from your list. As Verso grows, two more layers join in: matching you with people whose taste runs close to yours, and an AI persona built from your likes that reads the book or watches the film first and makes the call on whether you'd enjoy it.",
      },
      {
        // Slot: question.
        question: 'What does Verso cost?',
        // Slot: answer, Rafa's point (decision 21).
        answer:
          'Ranking, your lists and everything you track are free, and always will be. AI recommendations are free during the beta and may become part of a paid plan in the future.',
      },
      {
        // Slot: question.
        question: 'Is my data private?',
        // Slot: answer, Rafa's point: never sold. The ads line moved to its own question at his word.
        answer:
          "Yes. Your rankings, lists and notes are private to your account, and we never sell your data. When you ask for a recommendation, only the parts of your list needed to explain the picks are sent to our AI provider, and only after you've said yes.",
      },
      {
        // Slot: question, new at Rafa's word 2026-10-08.
        question: 'Does Verso have ads?',
        // Slot: answer, his words: a recommendation engine that works for you and in your best interest, so never ads;
        // it shows what is truly recommended to you, not what anyone else is pushing. Recorded as an amendment to decision 21.
        answer:
          "No, and it never will. Verso is a recommendation engine that works for you and in your interest: everything it shows you is there because it fits your taste, not because someone paid to put it in front of you.",
      },
      {
        // Slot: question.
        question: 'Which media does Verso cover, and what comes next?',
        // Slot: answer, Rafa's list in a professional register; "next" because the launch scope (decision 23) is games and movies.
        answer:
          "Verso starts with video games and movies, with TV shows and books next. Beyond that, we're exploring podcasts and YouTube channels, and over time, recommendations for anything you choose to spend your free time on, from travel destinations to the things you buy.",
      },
      {
        // Slot: question.
        question: 'How do I get access?',
        // Slot: answer, the platform facts.
        answer:
          "Verso is in a private beta on iPhone. Request access and we'll send you an invite. A web version is available on request, and Android will follow after launch.",
      },
    ],
  },

  access: {
    // Slot: the closing call to action's heading.
    title: 'Request access',
    // Slot: the line under it (brief, inference 3: requests answered by hand with an invite).
    body: "Verso is invite-only while it's in beta. Write in and Rafa replies with an invite.",
  },

  footer: {
    // Slot: footer label.
    contact: 'Contact',
    // Fact: link label, and the Privacy page's title. Terms left the footer in
    // the finalize round: a site with nothing to sign up for has no terms to
    // agree to, and the app's terms come with the beta (drafts in docs/legal/).
    privacy: 'Privacy',
    // Fact: IGDB's credit.
    igdb: 'Game data from IGDB.',
    // Fact: the credit for the Steam library art in the hero and the scenes (art.ts).
    steam: 'Game art from Steam.',
    // Fact: the sentence TMDB's terms require, word for word.
    tmdb: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    // Slot: the one line that stands in for the About section, removed in round two.
    builtBy: 'Built by Rafael Sanchez',
    // Fact.
    copyright: '© 2026 Verso',
  },

  /*
   * The log-in page (finalize round, 2026-10-08; Rafa: "let people try to log
   * in and fail because they don't have an account"). It mirrors the app's
   * signed-out front door (apps/mobile/src/screens/sign-in/sign-in-screen.tsx):
   * the lockup, one email field and "Continue with email". Continue sends
   * nothing anywhere and asks for no password; it shows the notice below.
   * Rafa's wording (2026-10-08): it says the address has no registered
   * account, so the page reads as if accounts are live, and points to the
   * contact address for access.
   */
  login: {
    // Fact: what a screen reader hears as the page's heading; the lockup beside it is drawn.
    heading: 'Log in to Verso',
    // Slot: the line under the lockup, where the app's sheet says "Your games, ranked by you."
    intro: 'Log in with your email.',
    // Fact: the field's label and placeholder, as the app's.
    email: 'Email',
    // Fact: the button, as the app's.
    continue: 'Continue with email',
    // Rafa's words (2026-10-08): the notice after Continue, its first line.
    noticeTitle: "This email doesn't have a registered account.",
    // Rafa's words (2026-10-08): the second line, over the Request access
    // button; the address in it is a link to the same access email.
    noticeBody: `Verso is invite-only during the beta. Email us at ${CONTACT_EMAIL} for access.`,
  },

  /*
   * The privacy notice for this website alone (finalize round, 2026-10-08),
   * in place of "Coming before launch." Every sentence is a fact checked in
   * the repo or the built export that day: the export loads nothing from
   * another host (fonts self-hosted by next/font, the art and the shots in
   * public/), no cookies, no browser storage, no analytics and no fetch
   * anywhere in src/, and Request access is a mailto: link. The log-in page
   * makes no request on submit (checked in Chromium), but the notice does not
   * say so (Rafa, 2026-10-08: it should not tell readers that Log in does
   * not work). Two hold from the
   * switch on, before which the site is not public: the host is Vercel
   * (vercel.json, runbook section 11) and the address forwards through
   * Porkbun, the registrar (runbook section 11, a checkbox before go-live).
   * The app's own policy comes with the beta (drafts in docs/legal/).
   */
  privacy: {
    // Signed off by Rafa, 2026-10-08.
    updated: 'Last updated October 8, 2026',
    // Signed off by Rafa, 2026-10-08.
    intro: 'This notice covers this website, rankverso.com. The Verso app will have its own privacy policy, which comes with the beta.',
    sections: [
      {
        // Signed off by Rafa, 2026-10-08.
        heading: 'What the site loads',
        // Signed off by Rafa, 2026-10-08.
        body: 'Everything on these pages, from the fonts to the images, is served from rankverso.com itself. While you read it, your browser asks no other website for anything.',
      },
      {
        // Signed off by Rafa, 2026-10-08.
        heading: 'No cookies, no analytics',
        // Signed off by Rafa, 2026-10-08.
        body: "The site sets no cookies, saves nothing in your browser's storage and runs no analytics or tracking.",
      },
      {
        // Signed off by Rafa, 2026-10-08.
        heading: 'Hosting',
        // Signed off by Rafa, 2026-10-08.
        body: "The site is hosted on Vercel. Vercel's servers log the requests they receive, including the IP address each one comes from.",
      },
      {
        // Signed off by Rafa, 2026-10-08.
        heading: 'Requesting access',
        // Signed off by Rafa, 2026-10-08.
        body: `Request access opens your own email app with a message to ${CONTACT_EMAIL}, and nothing is sent unless you send it. The domain's registrar forwards that address to Verso's inbox, and we keep your email so we can reply and send you an invite.`,
      },
      {
        // Signed off by Rafa, 2026-10-08.
        heading: 'Contact',
        // Signed off by Rafa, 2026-10-08.
        body: `Questions about this notice go to ${CONTACT_EMAIL}.`,
      },
    ],
  },

  legal: {
    // Fact: link label back to the home page, under the Privacy notice.
    back: 'Back to Verso',
  },
} as const;
