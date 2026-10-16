# Local development

Written 2026-10-08. How to run Verso on a laptop against the local Supabase stack, and what every script in the workspace does. The hosted project has its own runbook, [hosted-setup.md](hosted-setup.md); pull requests are reviewed as in [reviewing-prs.md](reviewing-prs.md).

## What you need

- Node 22 and pnpm 12 (`corepack enable` picks the version pinned in `package.json`).
- Docker, for the local Supabase stack, and the Supabase CLI (`brew install supabase/tap/supabase`; CI pins the version in `.github/workflows/ci.yml`).
- Xcode with an iOS simulator for `pnpm ios`; Android Studio for `pnpm android`. The web build needs neither.
- Deno 2, only to run the Edge Function tests.

## First run

```bash
pnpm install
supabase start
```

`supabase start` applies every migration in `supabase/migrations` to a fresh Postgres and prints the local URL and keys; `supabase status -o env` prints them again as shell variables. Then:

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the local stack's `API_URL` and `ANON_KEY`. These two are bundled into the app; nothing else is.
2. Copy `.env.example` to `.env` for the backend scripts. The local stack needs none of it to run the app; the catalog mirror needs `DATABASE_URL` (the local one is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) and a Twitch application's client id and secret ([../design/igdb-setup.md](../design/igdb-setup.md)).
3. `pnpm ios` for the simulator, `pnpm web` for the browser, `pnpm android` for an emulator.

An empty catalog shows empty screens. `pnpm catalog:sync:full` fills it from IGDB (about three minutes and 77 MB for the trimmed set of games); `pnpm catalog:tmdb-sync:full` adds films and series once a TMDB token is in `.env` ([../design/tmdb-setup.md](../design/tmdb-setup.md)).

## Scripts

Every script in the workspace, with what it does. The root scripts forward to the package they name.

| Script | What it does |
|---|---|
| `pnpm ios`, `pnpm android` | Build and run the Expo app on a simulator or emulator (`expo run:ios`, `expo run:android`); prebuild generates `ios/` and `android/`, which are never edited by hand |
| `pnpm web` | Serve the app in the browser with Metro (`expo start --web`) |
| `pnpm web:export`, `pnpm web:serve` | Export the single-page web build to `apps/mobile/dist`, then serve it on port 8090 |
| `pnpm mobile web:html` | Regenerate `apps/mobile/public/index.html` (the head tags) from its template |
| `pnpm mobile lint`, `pnpm mobile typegen` | Expo's lint, and the typed-routes generation `typecheck` runs first |
| `pnpm mobile prebuild` | `expo prebuild --clean`, when the native projects need regenerating |
| `pnpm site:dev`, `pnpm site:build` | The marketing site with Next's dev server on port 3000, or the static export to `apps/site/out` |
| `pnpm --filter @verso/site logo` | Build the site, then render its favicons, touch icon and share image from the mark |
| `pnpm catalog:sync`, `pnpm catalog:sync:full` | The IGDB mirror: the delta (games updated in the last 26 hours by default; the weekly workflow passes `-- --since <iso>` for eight days), or the full pull |
| `pnpm catalog:steam-scores` | Steam review scores and ids for games with a Steam app id |
| `pnpm catalog:wikidata-ids`, `pnpm catalog:opencritic-ids` | The weekly Wikidata pass that fills cross-linking ids (OpenCritic, Steam, Wikipedia) keyed by the IGDB id; the second name is an alias |
| `pnpm catalog:opencritic-scores` | OpenCritic critic scores for games with an OpenCritic id; skips when `OPENCRITIC_RAPIDAPI_KEY` is unset |
| `pnpm catalog:availability` | Subscription availability from Game Pass, GeForce NOW and IsThereAnyDeal |
| `pnpm catalog:tmdb-sync`, `pnpm catalog:tmdb-sync:full` | The TMDB mirror for films and series: the delta (26 hours by default; the weekly workflow passes `-- --since 194`), or the full pull |
| `pnpm tokens:build`, `pnpm tokens:check` | Build the app's theme from `packages/tokens/tokens.json`, or fail if the committed theme is out of step with it (CI runs the check) |
| `pnpm typecheck` | `tsc --noEmit` in every package; the app generates its typed routes first |
| `pnpm test` | The vitest suites in every package; the `packages/api` suites run live when `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` point at a stack, and skip otherwise |
| `pnpm db:test` | The pgTAP suites in `supabase/tests` against the local stack (`supabase test db`) |
| `pnpm db:push` | Apply the migrations to the linked hosted project ([hosted-setup.md](hosted-setup.md)) |
| `pnpm db:types` | Regenerate `packages/api/src/database.types.ts` from the linked project |

The Edge Functions are Deno, outside pnpm: `deno test supabase/functions/<name>` runs one function's tests, and `supabase functions serve` runs them locally against the stack.

## Tests, and what each layer covers

- **vitest** in `packages/core` (the ranking engine, the batch session, the deck, the prompts), `packages/catalog` (the mapper, the trim rule, rate limiting, every sync command against fixtures), `packages/api` (the data layer, live against the local stack: entries, ranking, backlog, onboarding, export, profiles, the two-user isolation each read must keep) and `apps/mobile` (the screen rules, formatting, navigation, the stores, identity).
- **pgTAP** in `supabase/tests`: one suite per migration that matters, each asserting the schema, the Row Level Security policies with two users, and the behavior of every SQL function the app calls.
- **Deno** tests in `supabase/functions/*`: the fetch logic of each Edge Function against fixtures with an injected `fetch`, so nothing reaches Steam or the model provider.
- **CI** (`.github/workflows/ci.yml`) runs five jobs on every pull request and push to `main`: `check` (the tokens check, typecheck, vitest), `web` (the web export and its bundle size), `site` (the static export and a check that it loads nothing third-party), `functions` (the Deno tests), `db` (a fresh local Supabase stack, pgTAP, then the `packages/api` suites live).

## Two stacks on one machine

`supabase start` runs one stack per project id. A second, isolated stack for a long-running job uses its own `project_id` and ports in a copy of `supabase/config.toml`; the default stack keeps the ports in the committed file.
