# Verso

In an age of AI, the most valuable resource is human time. An AI can read an entire book with your perspective and see if you would like it, so why not go ahead and do it and maximize your free time? Verso is built on that idea: a recommendation engine across media that learns your taste the most natural way, one pick at a time, by having you place what you played or watched in a ranked list through a few head-to-head comparisons, and then tells you what to spend tonight on and why, with the reason drawn from your own list. Games and movies first; the tracker, the backlog and the social layer are free and are how the engine learns; nothing about you is ever sold.

**Status:** private beta, invite only, through TestFlight on iOS, with Android and the web build from the same codebase; games and movies.

<p align="center">
  <img src="docs/assets/screenshots/home.webp" width="230" alt="Home: what you are playing, what is up next, and what is coming up">
  <img src="docs/assets/screenshots/compare.webp" width="230" alt="The compare step: which of the two was better">
  <img src="docs/assets/screenshots/ranking.webp" width="230" alt="Ranking: four tiers, with the score read off the position">
</p>

*The app's web build at phone size, with a demo library on a local catalog.*

## The repo

A pnpm monorepo, TypeScript throughout. [ARCHITECTURE.md](ARCHITECTURE.md) is the map of how data flows and why.

```
apps/mobile       the Expo Router app: iOS, Android and the web from one codebase
apps/site         the marketing site, a static Next.js export
apps/holding      the one-page holding site the domain showed first
packages/core     the media-agnostic model and the ranking engine, pure TypeScript
packages/api      the typed data layer over supabase-js and the generated database types
packages/catalog  the IGDB and TMDB mirror and the enrichment jobs that run on a schedule
packages/tokens   design tokens exported from Figma, built into the app's theme
supabase/         migrations, pgTAP suites, four Deno Edge Functions, local config
docs/             design, specs, research, process; docs/README.md is the index
```

## Decisions

Each choice links to the document that explains it; the dated record of every decision is in [ROADMAP.md](ROADMAP.md#decisions).

- **Ranking is tiers plus binary insertion**, not star ratings or Elo: four tiers, binary-search insertion within a tier, a genre-preferring pivot, "too close" and "can't compare" escape hatches, and a confirm step. Every comparison is stored as an event. [docs/design/ranking-algorithm.md](docs/design/ranking-algorithm.md), from [the Beli research](docs/research/beli-ranking-algorithm.md).
- **The recommender works from one person's list first.** Candidates come from SQL, scored by a community prior and the person's own tiers; a model picks among them and writes the reason, and never scores. Neighbor predictions wait until a harness shows them beating that baseline. [docs/design/recommendation-engine.md](docs/design/recommendation-engine.md), from [the engine research](docs/research/recommendation-engine.md).
- **The data model is media-agnostic.** One set of tables for every medium (items, entries, rankings, comparisons), with game and film specifics in extension tables, so adding films left rankings and comparisons untouched. [ROADMAP.md, Data model](ROADMAP.md#data-model).
- **Supabase is the whole backend**, reached directly from the app: Postgres, Auth, pg_cron and Edge Functions, with Row Level Security on every user table from its first migration and a pgTAP policy test for each. [docs/design/tech-stack.md](docs/design/tech-stack.md), [docs/research/backend-and-hosting.md](docs/research/backend-and-hosting.md).
- **One Expo codebase for three platforms**, mobile first. [docs/research/app-framework.md](docs/research/app-framework.md); the web build is in [docs/design/web-brief.md](docs/design/web-brief.md).
- **IGDB and TMDB are mirrored into Postgres** by scheduled jobs, under each source's terms; the app never calls a catalog API. [docs/research/game-data-sources.md](docs/research/game-data-sources.md), [docs/design/film-tv-catalog.md](docs/design/film-tv-catalog.md), [docs/design/igdb-setup.md](docs/design/igdb-setup.md).
- **Screens are designed in Figma before they are coded**, against one running file of rules. [docs/design/figma-workflow.md](docs/design/figma-workflow.md), [docs/design/ui-principles.md](docs/design/ui-principles.md).

## Run it

Against the local Supabase stack; no hosted project is needed. [docs/process/local-development.md](docs/process/local-development.md) has every step and every script.

```bash
pnpm install
supabase start                                 # Postgres, Auth and the API gateway in Docker; applies the migrations
cp apps/mobile/.env.example apps/mobile/.env   # then set the URL and anon key that `supabase status -o env` prints
pnpm ios                                       # or pnpm web, or pnpm android
```

The catalog starts empty. `pnpm catalog:sync:full` fills it from IGDB with a Twitch application's credentials in `.env` ([docs/design/igdb-setup.md](docs/design/igdb-setup.md)); `pnpm catalog:tmdb-sync:full` adds films and series once a TMDB token is there.

## Testing

| Suite | Runs with | Covers |
|---|---|---|
| vitest, 1,679 tests in 107 files | `pnpm test` | `packages/core` (160: the ranking engine, the batch session, the deck), `packages/catalog` (630: the mappers, the trim rule, every sync command against fixtures), `packages/api` (331: the data layer, live against the local stack, with two-user isolation on every read), `apps/mobile` (558: the screen rules, formatting, navigation, the stores) |
| pgTAP, 25 suites, 1,348 assertions | `pnpm db:test` | The schema, the Row Level Security policies with two users, and every SQL function the app calls |
| Deno, 103 tests | `deno test supabase/functions/<name>` | The four Edge Functions against fixtures with an injected `fetch`; nothing reaches Steam or the model |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of it on every pull request against a fresh local stack, plus the web export, the site build and the token check.

## Credits

- Game data from [IGDB](https://www.igdb.com), through the Twitch API.
- Film and TV data from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability is JustWatch data as TMDB relays it.
- Steam review scores, concurrent player counts and library imports from the [Steam Web API](https://steamcommunity.com/dev) and the storefront. Steam is a trademark of Valve Corporation.
- Critic scores from [OpenCritic](https://opencritic.com), through its official API.
- Cross-linking ids from [Wikidata](https://www.wikidata.org) (CC0).
- Platform glyphs from [Simple Icons](https://simpleicons.org) (CC0); interface icons from [Lucide](https://lucide.dev) (ISC); the typeface is [Inter](https://rsms.me/inter/) (SIL Open Font License).
- Subscription availability from Game Pass, GeForce NOW and [IsThereAnyDeal](https://isthereanydeal.com).

## License

All rights reserved. The code is published to be read, not reused: no license is granted to copy, modify or distribute it. Third-party data and assets stay under their own terms, listed above.

## How it is built

Verso is built by one person with Claude Code: screens are designed in Figma first, the code lands as small pull requests reviewed by diff before they merge, every change runs the pgTAP and vitest suites in CI, and this README was written the same way.
