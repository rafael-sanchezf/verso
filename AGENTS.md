# Verso

Read `docs/private/CONTEXT.md` first when it exists. Anything personal, venture, pricing, class or career material goes under `docs/private/`, which never leaves this repo ([docs/process/public-mirror.md](docs/process/public-mirror.md) says what the public mirror gets).

A recommender across media, fed by a Beli-style ranking loop: rank what you played or watched by head-to-head comparison, keep a backlog, share with friends, and get picks for the time you have, with the reason drawn from your own list. Games and movies first, TV and books later. Verso is the working name, adopted 2026-09-15 and not final; the repo, the folder, the code, and the hosted Supabase project's display name were renamed from the old placeholder gaming-beli on 2026-10-08.

## Where things are

- `ROADMAP.md` is the source of truth for scope, decisions, and what comes next. Read it before proposing work.
- `ARCHITECTURE.md` is the one-page map of how data flows and why; `docs/README.md` indexes every document in `docs/`.
- `docs/design/` holds decided designs: ranking algorithm, recommendation engine, tech stack, Figma workflow, toolchain, IGDB and TMDB setup, the screen specs.
- `docs/research/` holds the research those decisions came from. Cite, do not re-derive.
- `docs/feature-ideas.md` holds the product ideas that are captured but not yet scheduled or designed, each with a sketch and open questions. Read it before proposing a feature, and add to it rather than to chat when a new one is named.
- `supabase/` is the database project: config, migrations, seed, edge functions.
- `docs/design/onboarding-guidelines.md` is the living document on onboarding: the two users, the principles, what was borrowed and refused. Read it before proposing onboarding work; add to it, dated, when a thought about onboarding comes up.
- `docs/design/web-brief.md` is the proposal for the web app (2026-10-07): the same codebase in the browser at parity with V0, the two-width layout with its web-exclusive parts, what each screen waits on, and the web waves against the milestones. Read it before proposing web work.
- `docs/design/brand-identity.md` is the decided brand (2026-10-08, decision 31): the mark Rafa drew by hand, the app icon, the wordmark and lockup, the mark's colors on each ground, and his approved words with the two copy rules. Read it before any logo, icon, marketing or copy work. The mark's geometry is final: use `docs/design/assets/brand/verso-mark.svg` or the Figma component `Verso mark` (238:37), never redraw it.
- `docs/process/` holds how the repo is run: the hosted runbook, how pull requests are reviewed, local development, and the public mirror.

## Decisions already made (do not reopen without being asked)

- Ranking is Option A: four tiers, binary-search insertion within a tier, genre-preferring pivot choice, "too close" and "can't compare" escape hatches, confirm step. Every comparison is stored as an event.
- The backlog never touches ranking.
- Mobile-first, one Expo codebase (Expo Router universal app) in a pnpm monorepo. A separate Next.js site is added later only for public indexable pages.
- Supabase is the whole backend: Postgres, Auth, RLS, pg_cron plus Edge Functions. The app talks to Supabase directly. Next.js is not the data layer.
- The IGDB catalog is mirrored into Postgres by a scheduled script. The app never calls IGDB directly.
- Auth is email plus Sign in with Google (Google added 2026-09-16 at Rafa's request). App Store guideline 4.8 requires Sign in with Apple once Google is offered, so Apple ships before the first store submission; it needs the Apple Developer Program, deferred until TestFlight.
- Never sold, free or paid: no sale or cross-context sharing of personal data on any tier; data products for studios are aggregate and de-identified only (decision 21).
- Games and movies both ship in the beta and at launch; TV and books stay held until TV's ranking unit is decided (decision 23).
- The beta's recommender picks three unplayed candidates from the user's own list in SQL, and a model writes the reason; no neighbor predictions until the harness shows them beating the baseline, and a permission step precedes the first pick (decision 24).
- Onboarding starts with a questionnaire of which media to track, then the bulk-entry deck per chosen medium; the switcher shows only the chosen media (decision 25).

## How to work here

- UI is designed in Figma before it is coded. Do not build or mock up screens for approval; draft on the Figma canvas, let the developer edit, then read the approved frame back. See `docs/design/figma-workflow.md`.
- Never edit `ios/` or `android/` by hand. Expo prebuild owns them and they are not committed.
- Every user table gets Row Level Security from its first migration, with a policy test.
- The core data model is media-agnostic (MediaItem, UserEntry, Ranking, Comparison). Game-specific fields live in a per-medium extension table. See the data model sketch in `ROADMAP.md`.
- Secrets live in `.env` (ignored), GitHub Actions secrets, and Supabase secrets. Never in code, commits, or chat. `.env.example` lists the names.
- Prose docs are Markdown in `docs/`. Keep the roadmap updated when a decision is made, with the date.

## The board

Work is tracked on a Jira board, project key `VER`, with Rafa as the product manager and Claude as the team. The rules are in [docs/process/jira.md](docs/process/jira.md); every read and write goes through `scripts/jira/jira`, which takes `JIRA_SITE`, `JIRA_EMAIL` and `JIRA_API_TOKEN` from `.env`.

- At the start of every session, before anything else, run `scripts/jira/jira week` and `scripts/jira/jira inflight`, fetch, and reconcile In progress against `git log` and `git worktree list`, so a card with no live branch or a branch with no card is fixed first.
- Then report in at most five lines (what waits on Rafa, what is in flight, what is next) and take the top card of `scripts/jira/jira ready` unless Rafa names another.
- Branches are named `VER-123-short-name` and PR titles begin with `VER-123`. Move the card to In progress when work starts and to In review when the PR opens, and file the review in Rafa's lane with `scripts/jira/jira handoff VER-123 "Review PR #N: title (10 min)" --label review`.
- The caps are five open items in Rafa's lane, four In progress, ten in Ready. Past his five, file his item in Backlog assigned to him with no due date and say so.
- Never decide. A question only Rafa can answer becomes `scripts/jira/jira ask "question" --default "..." --due YYYY-MM-DD --blocks VER-123`. Never reorder Ready or change a priority.
- Never raise a follow-up in chat. Anything noticed in passing is a one-line card in Backlog, unassigned.
- At the end of every session, every card touched is in its true state with its PR linked, everything Rafa must do is a card in his lane with a verb and minutes, and the last message is his lane: up to five items, ranked, one line each.
