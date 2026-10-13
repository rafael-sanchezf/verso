# Docs

The index of `docs/`, one line per document, with its date. Decided designs are under `design/`, the research they came from under `research/`, the screen specs under `design/specs/`, and how the repo is run under `process/`. The roadmap is [../ROADMAP.md](../ROADMAP.md), the data-flow map is [../ARCHITECTURE.md](../ARCHITECTURE.md). Anything personal or venture-side lives in `private/`, which is not part of the public mirror ([process/public-mirror.md](process/public-mirror.md)).

## Design

- [design/ranking-algorithm.md](design/ranking-algorithm.md) (2026-09-07, batch session added 2026-10-06): the ranking options with a worked example, and the chosen design, Option A.
- [design/recommendation-engine.md](design/recommendation-engine.md) (2026-09-24): how the personal and group engines work layer by layer, where the model sits, the first batch built before any data, the schema.
- [design/tech-stack.md](design/tech-stack.md) (2026-09-08): Expo, Supabase, Vercel; costs, what the alternatives would have cost, the risks to manage.
- [design/dev-toolchain.md](design/dev-toolchain.md) (2026-09-08, updated since): the tools and accounts, the Claude Code integrations, what carries over from Xcode and Python.
- [design/figma-workflow.md](design/figma-workflow.md) (2026-09-07, a log since): how UI design happens in Figma and how the file is organized, round by round.
- [design/ui-principles.md](design/ui-principles.md) (running): the numbered rules for how the interface feels and behaves, and their sources.
- [design/ui-brief.md](design/ui-brief.md) (2026-09-15): screen-by-screen decisions from the structure, direction and fidelity rounds.
- [design/onboarding-guidelines.md](design/onboarding-guidelines.md) (2026-10-06, living): the two users, the principles, what was borrowed and refused.
- [design/onboarding-brief.md](design/onboarding-brief.md) (2026-10-01): the questionnaire, the bulk-entry deck and the first pick.
- [design/media-brief.md](design/media-brief.md) (2026-09-16): the structure round for movies, TV and books, where each medium differs.
- [design/movies-brief.md](design/movies-brief.md) (2026-09-22, Home reframed 2026-10-06, the site as source of truth 2026-10-12): the film product designed from the medium outward.
- [design/profile-brief.md](design/profile-brief.md) (2026-10-12): one profile across media, the identity a person chooses, the page shaped by the media they track.
- [design/web-brief.md](design/web-brief.md) (2026-10-07): the web app at parity with V0, the two-width layout, the web waves.
- [design/film-tv-catalog.md](design/film-tv-catalog.md) (2026-09-16): the TMDB mirror, its scope, requests, schema and schedule.
- [design/igdb-setup.md](design/igdb-setup.md) (2026-09-08): registering the Twitch application that grants IGDB access.
- [design/tmdb-setup.md](design/tmdb-setup.md) (2026-09-16): the TMDB credential and its terms.
- [design/brand-identity.md](design/brand-identity.md) (2026-10-08): the mark, the app icon, the wordmark and lockup, the colors on each ground, the approved words.
- [design/brand-build.md](design/brand-build.md) (2026-10-08, executed): the plan that put the mark in the app and on the site.
- [design/naming.md](design/naming.md) (2026-09-15): the name shortlist with store, domain and trademark collision checks.
- [design/usability-test-plan.md](design/usability-test-plan.md) (2026-09-16): the tasks for the three-friends test.
- `design/assets/brand/`: the mark (SVG, both grounds), the 1024 px app icon master, the brand board.

## Screen specs

One document per screen, written from the approved Figma frames; [design/specs/README.md](design/specs/README.md) (2026-09-16, updated 2026-10-07) comes first.

- [design/specs/shell.md](design/specs/shell.md): tab bar, theme, primitives.
- [design/specs/signed-out.md](design/specs/signed-out.md): the signed-out screen and the sign-in flow.
- [design/specs/home.md](design/specs/home.md), [design/specs/search.md](design/specs/search.md), [design/specs/ranking.md](design/specs/ranking.md), [design/specs/next.md](design/specs/next.md), [design/specs/profile.md](design/specs/profile.md): the five tabs.
- [design/specs/game-page.md](design/specs/game-page.md) and [design/specs/log-flow.md](design/specs/log-flow.md): the detail page, and the tier sheet, comparisons and confirm step.
- [design/specs/onboarding.md](design/specs/onboarding.md) and [design/specs/batch-session.md](design/specs/batch-session.md) (2026-10-07): the questionnaire, the deck, and the batch ranking session with its review.
- [design/specs/steam.md](design/specs/steam.md) (2026-10-07): the Steam link screens, coded from conventions.

## Research

Each report is dated inside; the notes folders hold the raw, sourced notes the report was written from.

- [research/beli-ranking-algorithm.md](research/beli-ranking-algorithm.md) (2026-09-07): how Beli ranks, and what to borrow.
- [research/recommendation-engine.md](research/recommendation-engine.md) (2026-09-24): how Beli scores for you, what comparable products do, and the math. Notes: [beli-personalization](research/recommendation-engine-notes/beli-personalization.md), [comparable-products](research/recommendation-engine-notes/comparable-products.md), [group-recommendation](research/recommendation-engine-notes/group-recommendation.md), [llm-and-cross-domain](research/recommendation-engine-notes/llm-and-cross-domain.md), [personal-recommendation-math](research/recommendation-engine-notes/personal-recommendation-math.md).
- [research/game-data-sources.md](research/game-data-sources.md) (2026-09-07): what a developer can pull for games, and under which terms.
- [research/film-tv-data-sources.md](research/film-tv-data-sources.md) (2026-09-16) and [research/book-data-sources.md](research/book-data-sources.md) (2026-09-16): the same for film and TV, and for books.
- [research/app-framework.md](research/app-framework.md) (2026-09-08) and [research/backend-and-hosting.md](research/backend-and-hosting.md) (2026-09-08): the framework and the backend choices, with the alternatives.
- [research/brand-color.md](research/brand-color.md) (2026-10-07): one brand color instead of four, and how it was picked. Notes: [landscape](research/brand-color-notes/landscape.md), [theory](research/brand-color-notes/theory.md).
- Movies Home notes (2026-10-06): [choosing-what-to-watch](research/movies-home-notes/choosing-what-to-watch.md), [home-screens](research/movies-home-notes/home-screens.md).
- Onboarding notes (2026-10-01 and 2026-10-06), the inventory behind the onboarding brief: [preference-elicitation](research/onboarding-notes/preference-elicitation.md), [media-app-onboarding-video-music](research/onboarding-notes/media-app-onboarding-video-music.md), [media-app-onboarding-books-games](research/onboarding-notes/media-app-onboarding-books-games.md), [hims-hers-questionnaire](research/onboarding-notes/hims-hers-questionnaire.md), and the per-cluster flows: [games apps](research/onboarding-notes/cluster-games-apps.md), [Letterboxd, Criticker, Taste.io, MovieLens, Beli](research/onboarding-notes/cluster-letterboxd-criticker-tasteio-movielens-beli.md), [Netflix, Spotify, TikTok](research/onboarding-notes/cluster-netflix-spotify-tiktok.md), [Apple Music, YouTube Music, JustWatch](research/onboarding-notes/cluster-applemusic-youtubemusic-justwatch.md), [Pinterest, Trakt, Simkl](research/onboarding-notes/cluster-pinterest-trakt-simkl.md), [Reelgood, Goodreads, StoryGraph](research/onboarding-notes/cluster-reelgood-goodreads-storygraph.md), [Hardcover, Fable, Likewise](research/onboarding-notes/cluster-hardcover-fable-likewise.md), [Duolingo, Headspace, Stitch Fix, TasteRay](research/onboarding-notes/cluster-duolingo-headspace-stitchfix-tasteray.md).

## Product

- [feature-ideas.md](feature-ideas.md) (2026-09-16, updated as ideas are decided): the ideas captured but not yet scheduled, each with a sketch, a cost and open questions.
- [market-research.md](market-research.md) (2026-09-07): the competitor scan and the gap.
- [legal/privacy-draft.md](legal/privacy-draft.md) and [legal/terms-draft.md](legal/terms-draft.md) (2026-10-08): drafts for review before launch, every unverified claim marked.
- [bugs/crash-log.md](bugs/crash-log.md) (2026-09-16): the crashes worth keeping, with the diagnosis.

## Process

- [process/local-development.md](process/local-development.md) (2026-10-08): running the app against the local stack, and every script.
- [process/reviewing-prs.md](process/reviewing-prs.md) (2026-09-15): how pull requests are reviewed and merged, with worked examples.
- [process/hosted-setup.md](process/hosted-setup.md) (2026-09-16, running): the runbook for the hosted project, TestFlight, Vercel and the domain.
- [process/public-mirror.md](process/public-mirror.md) (2026-10-08): what syncs to the public repo, what never does, and the gate.
- [process/jira.md](process/jira.md) (2026-10-09): the Jira board: issue types, statuses, labels, the roles, the session protocols, the caps, and the plumbing.
