# Architecture

Verso is a recommender for games and movies, fed by a ranking loop: a person places what they finished into a ranked list through a few head-to-head comparisons, and the engine reads that list to pick what to play or watch next. One rule organizes the system: the core data model is media-agnostic (`media_items`, `user_entries`, `ranking_entries`, `comparisons`), game and film specifics live in per-medium extension tables (`game_details`, `movie_details`, `tv_details`), and the app never calls a catalog API directly.

## The pieces

A pnpm monorepo, TypeScript throughout, with Supabase as the whole backend.

| Path | Owns |
|---|---|
| `apps/mobile` | The Expo Router app: one codebase for iOS, Android and web. Screens, navigation, the query cache, session storage. |
| `apps/site` | The marketing site, a static Next.js export. |
| `apps/holding` | A self-contained static placeholder page that loads nothing from any other host. |
| `packages/core` (`@verso/core`) | Pure logic with no I/O: the media-agnostic model types, the ranking engine, the batch session, the onboarding deck order, the comparison prompt. |
| `packages/api` (`@verso/api`) | The typed data layer: the supabase-js client factory, the generated `database.types.ts`, and thin wrappers over tables, RPCs and Edge Functions. |
| `packages/catalog` (`@verso/catalog`) | The catalog mirror: a Node CLI (`src/cli.ts`) that writes IGDB, TMDB and enrichment data into Postgres over a direct `pg` connection. |
| `packages/tokens` (`@verso/tokens`) | Design tokens exported from Figma variables (`tokens.json`) and the `theme.css` generated from them. |
| `supabase/` | Migrations, pgTAP tests (`supabase/tests`), the four Deno Edge Functions, local stack config. |

## How data flows

```
external sources        packages/catalog         Supabase                Edge Functions
IGDB, TMDB, Steam,  --> Node CLI on GitHub   --> Postgres + RLS,    <--> steam-link
OpenCritic, Wikidata,   Actions schedules        SQL functions,          steam-import
availability lists                               pg_cron                 steam-player-counts
                                                    ^                    suggest
                                                    | supabase-js (anon key + user JWT)
                                                 packages/api, typed over database.types.ts
                                                    ^
                                                 apps/mobile: iOS, Android, web
```

The app invokes `steam-link` and `steam-import` through supabase-js, pg_cron invokes `steam-player-counts`, and `suggest` accepts only a signed-in user's JWT.

### The catalog

- **IGDB** is pulled daily by `pnpm catalog:sync`: a 26-hour delta, or a full pull by hand. Access is a Twitch app token from the client-credentials flow. One request per page of 500 games expands genres, platforms, companies and alternative names; follow-up requests fetch time to beat and Steam app ids. Rows land in `media_items`, `game_details`, `media_aliases` and `external_scores`.
- **The trim rule** (`packages/catalog/src/trim.ts`) keeps a game only if it is a main game or a remake (no DLC, bundles, ports or remasters; remakes since 2026-10-12, see `docs/design/igdb-setup.md`), has a cover, and has at least one rating or came out in the last two years. The same rule is both the IGDB `where` clause and a local check on every returned row, because IGDB's search index can lag the record. It keeps the mirror sized for a 500 MB database.
- **TMDB** is pulled daily by the `tmdb-sync` command, for films and series. Discovery reads TMDB's daily id exports above a popularity threshold; a keep rule then requires a poster, a title, and a vote or a recent release. Four nightly passes share one request budget: the provider directory, the changes feed, new entrants, and a staleness pass that re-fetches any row older than 150 days to respect TMDB's six-month cache limit. Streaming offers (JustWatch data relayed by TMDB) land in `watch_availability`.
- **Enrichment** runs as separate commands on their own daily schedules, staggered so they never overlap: `steam-scores` (Steam review summaries and Valve's Metacritic block, keyed by Steam app id), `opencritic-scores` (OpenCritic ids read from Wikidata by `wikidata-ids`, then OpenCritic's API, so no request is spent on search) and `availability` (GeForce NOW, Game Pass and IsThereAnyDeal into `game_availability`). Concurrent player counts come from an Edge Function, below.
- **The mirror never deletes a `media_items` row.** User data references `media_items.id`, an internal UUID, and rankings cascade from it, so a title that stops matching a source's rules stays. External ids are borrowed facts; nothing a user owns depends on them staying stable.
- **Images are ids, not files.** The mirror stores image ids and paths, never URLs or bytes; `packages/api/src/covers.ts` builds IGDB and Steam CDN URLs at render time.

Why mirror instead of calling live: the IGDB credentials are a server secret that cannot ship in an app; a full pull runs longer than an Edge Function's 150-second limit; search becomes a trigram query in Postgres; and recommendation SQL must join the catalog with each person's list in one query. Catalog tables are written only by the service role and readable by signed-in users.

### The ranking loop

- **Four tiers** (loved, liked, fine, disliked) each own a fixed band of the 0 to 10 scale. A new item is placed inside its tier by binary-search insertion, so a tier of n items costs about log2(n) questions.
- **Genre-preferring pivot.** Once the tier holds enough genre peers of the new item, the engine asks about a same-genre item near the midpoint instead of the midpoint itself. Genre steers which question is asked, never where the item may land: it is still one list.
- **Escape hatches.** "Too close" places the item directly below the pivot. "Can't compare" swaps in another pivot, and two in a row end the search at the middle of the current range.
- **Pure engine.** `packages/core/src/ranking.ts` is a state machine with no storage, network or clock, tested in Node with vitest and run unchanged on the device. The app's log flow (`apps/mobile/src/screens/log/machine.ts`) wraps it in three steps: tier, comparisons, and a confirm step that shows the item between its new neighbors, with one-position nudges, before anything is written.
- **One write.** `insertionToFinishArgs` turns the finished state into arguments for the `finish_insertion` RPC, which appends every answer to `comparisons` and places the item in one transaction. The ranking functions are `security invoker` and act on `auth.uid()`; none takes a user id, and `packages/api` writes rankings only through them.
- **Every comparison is an event.** `comparisons` has insert and select policies and no update or delete, so the log is append-only and the order can be rebuilt, or re-fit by another algorithm, later.
- **Scores are derived, never stored**, from tier, position and tier size: `scoreForPosition` in TypeScript and `ranking_score` in SQL, written to agree exactly.
- **Logging is not ranking.** The backlog is its own ordered list on `user_entries` and never touches ranking. Films keep a diary in `watch_log`, one row per viewing; a trigger marks the entry played, and ranking stays a separate step.
- **The batch session** (`packages/core/src/batch.ts`) is the first-run path. A person tiers many items from the onboarding deck, then answers one run of questions. Each item starts at a slot predicted from the recommendation scores (`batch_predictions`) and is checked against its predicted neighbors; when an answer disagrees, the search widens outward and then bisects. "Place the rest for me" leaves unresolved items at their predicted slot with `placed_by = 'prior'`. Only real answers enter the log, and each item is still written with its own `finish_insertion` call.

### The recommendation engine

- **Retrieval is SQL.** `suggestion_candidates` returns the caller's best unseen catalog items in one medium, filtered hard by genre, length, platform or streaming service, and scored against their own list.
- **The score** blends a community prior (`item_prior`: the Verso mean for an item shrunk toward its external score, refreshed nightly by pg_cron) with a content profile from the person's own tiers (genres, developer or director, decade, platform). The profile's weight grows with how much the person has ranked. Each candidate carries a confidence label and a `why` that names the features behind it.
- **Grants.** The scorer takes a user id so the harness can run it for anyone, which is why only the service role may execute it. `suggestion_candidates` is `security definer`, pins its `search_path`, and passes `auth.uid()`, so no caller can name another user.
- **The `suggest` Edge Function** checks the meter, fetches up to 30 candidates, builds a taste context from Loved and Liked, drops and recent notes (never the comparison log), and makes one Messages API call to a Claude model. Structured output limits each pick's label to an enum of the candidates sent and each citation to an enum of the person's own titles, so the model cannot name anything outside the list. The server validates the reply again and falls back to SQL's top three, with a template reason built from `why`, on any failure.
- **Instruments.** Each suggestion writes a `suggestion_requests` row with its token counts, and the function checks `count_suggestion_requests` over 24 hours against a daily limit, returning 429 past it. Each pick writes a `prediction_log` row, and a leave-one-out harness (`recommendation_loo`, service role only) measures prediction error against two baselines.
- **No neighbors yet.** Collaborative predictions need people who have ranked the same items, so they stay out until the harness shows them beating the content baseline. Nothing above needs a crowd: it works from one person's list and the catalog.

### Auth, RLS and the Edge Functions

- **Sign-in** is Supabase Auth with email and password or Google. On native, Google runs the PKCE flow through the system browser and back on the `verso://` scheme, so the callback carries a one-time code rather than tokens. The native session is AES-encrypted with a random key kept in the keychain (`apps/mobile/src/lib/secure-storage.ts`); the web build uses browser storage.
- **Profiles** are created by a trigger on `auth.users` and seeded with the provider's name and avatar. The email is never copied, because profiles are readable by every signed-in user.
- **RLS is enabled on every table.** Per-user tables are owner-only on `auth.uid()`, profiles aside; catalog tables are read-only to signed-in users. Functions that must read past RLS (`suggestion_candidates`, `deck_candidates`, `batch_predictions`) are `security definer`, pin `search_path`, and filter by the captured `auth.uid()` by hand. pgTAP suites in `supabase/tests` act as signed-in users through forged JWT claims and assert the policies, grants and functions.
- **`steam-link`** links a Steam account through OpenID 2.0. The app receives a Steam URL whose `return_to` carries a single-use, hashed, ten-minute state, so the user's JWT never enters a URL; the callback verifies the assertion with Valve before storing the SteamID64 in `platform_links`.
- **`steam-import`** imports the linked library with playtime into `steam_library`, on demand and at most once per ten minutes, using a Steam Web API key held only as a function secret. It never writes the backlog: owned-but-untracked games are a read the person accepts, and typed-in playtime is never overwritten.
- **`steam-player-counts`** is called by pg_cron through pg_net every 30 minutes, accepts only the service role key, and stores a `player_counts` row per tracked Steam game. Valve publishes only the current number, so keeping the rows is what builds the history.
- **`suggest`** runs as the caller (the anon key plus the request's Authorization header) and holds no service role key, so every read and both log writes happen as that person.

### The clients

- **`apps/mobile`** is Expo with Expo Router, built for iOS, Android and web from one codebase. It talks to Supabase directly through one supabase-js client (`apps/mobile/src/lib/supabase.ts`) on the anon key; RLS is the authorization boundary, and there is no custom API server.
- **`packages/api`** is typed against `database.types.ts`, generated from the schema by `supabase gen types`. The RPC wrappers stay thin: name the arguments, call, throw the `PostgrestError`. The logic lives in SQL, where it runs as one transaction.
- **TanStack Query** holds server state. All keys are built in `apps/mobile/src/lib/query-keys.ts`, so two screens reading the same data share one cache entry, and writes invalidate explicitly.
- **Styling** is Uniwind (Tailwind v4) over `@verso/tokens/theme.css`. Tokens change in Figma and are re-exported, never hand-edited; CI fails if the generated theme drifts from `tokens.json`.
- **The web build** is `expo export --platform web` with single-page output, served on Vercel behind a catch-all rewrite (`vercel.json`).
- **`apps/site`** is a static Next.js export. CI checks that the export loads no third-party scripts, runtime fonts or catalog images.

## Why these choices

- Ranking: tiers plus binary insertion over a latent-score model, for the fewest questions, a deterministic result and a place explainable as "between X and Y"; the comparison log keeps a later re-fit possible. [docs/design/ranking-algorithm.md](docs/design/ranking-algorithm.md)
- Recommendations: a prior and a content profile work from one list, so they come first; the model picks among SQL's candidates and writes the reason, it never scores. [docs/design/recommendation-engine.md](docs/design/recommendation-engine.md)
- Data model: one set of tables for every medium with per-medium extensions, so adding films left rankings and comparisons untouched. [ROADMAP.md#data-model](ROADMAP.md#data-model)
- Backend: Postgres, Auth, RLS and pg_cron in one service that the app reaches directly, which makes RLS the authorization layer and the thing to test. [docs/design/tech-stack.md](docs/design/tech-stack.md), [docs/research/backend-and-hosting.md](docs/research/backend-and-hosting.md)
- App framework: Expo gives both stores and the web from one TypeScript codebase that shares `packages/core` and `packages/api`. [docs/research/app-framework.md](docs/research/app-framework.md)
- Catalog: IGDB and TMDB, mirrored under each source's terms (server-side credentials for IGDB; attribution and a six-month cache ceiling for TMDB). [docs/research/game-data-sources.md](docs/research/game-data-sources.md), [docs/design/film-tv-catalog.md](docs/design/film-tv-catalog.md)

## Testing

- `pnpm test` runs vitest in `packages/core`, `packages/catalog`, `packages/api` and `apps/mobile`; CI runs it alongside `pnpm typecheck` and the token check.
- CI starts a fresh local Supabase stack, which applies every migration, runs the pgTAP suites with `supabase test db`, then runs the `packages/api` suites live against that stack.
- The Edge Functions have Deno tests that inject `fetch` and read fixtures, so no test reaches Steam or the Anthropic API.
- Separate CI jobs export the web build and build the static site, so a broken bundle fails before merge.
