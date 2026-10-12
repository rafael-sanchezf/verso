# Backend, database, auth, and hosting for a "Beli for video games" app

Research date: 8 September 2026. Prices and limits below were checked against official pricing and docs pages on that date wherever the vendor's site allowed it; a few points come from vendor forums, changelogs, or third-party 2026 write-ups and are marked as such. Prices are USD and exclude tax.

## 0. The project in one paragraph, and what it actually demands from a backend

A mobile-first consumer app (Expo on iOS and Android, plus a website) where users track a game backlog, rank games inside tiers by head-to-head comparisons, and later follow friends, see a feed, and get a "match percentage" with other users. The backend must, from day one: mirror the IGDB catalog behind a server that holds the Twitch client secret; store per-user backlog rows, statuses, notes, an ordered ranking per tier, and an append-only comparison log; authenticate with email plus Sign in with Apple and Google (Steam OpenID linking later); and run scheduled work (nightly catalog delta refresh, a 15 to 30 minute Steam player-count poll for tracked games, a daily Steam review-summary cache). Scale is one user for months, then hundreds to low thousands. Budget is hobby-level with no surprise bills.

Three facts shape every recommendation below:

1. The ranking and comparison data is relational. An ordered list per tier, an append-only comparison log, and a "match percentage" between two users are exactly the shape SQL handles well (joins, window functions, aggregates). A document database can do it but you write the joins yourself and pay per read.
2. The catalog mirror is the biggest storage item. Wikipedia's most recent figure for IGDB is 428,000 entries as of March 2023, of which 196,500 are DLC and re-releases, so roughly 230,000 primary games in 2023 and plausibly 300,000 or more primary games by now (my estimate, not a vendor number). At about 1 KB per trimmed row (name, slug, summary, release date, cover image id, rating, genre and platform ids) plus indexes, a full mirror lands around 300 to 500 MB. That is right at the 0.5 GB database ceiling that Supabase Free, Neon Free, Convex Free, and Cloudflare D1 Free all share. Plan to either trim fields (skip storyline and long summaries at first, or fetch them on demand) or accept a paid database tier before the catalog is complete.
3. The 15-minute poll is the job that disqualifies several free tiers. Vercel Hobby cron runs once per day, Cloudflare Workers Free gives a cron only 10 ms of CPU, Render has no free cron, and EAS Hosting has no cron at all. Where this job lives is the first architectural decision.

## 1. Comparison table

Costs assume: Apple Developer Program ($99 per year) and Google Play ($25 once) are paid regardless and are excluded. "0 users" means the months before TestFlight when only the developer uses the app but the catalog mirror and Steam poll are already running. "1,000 users" assumes about 1,000 monthly active users, a few hundred tracked Steam games, a completed catalog mirror, and a modest social feed.

| Option | Monthly cost at 0 users | Monthly cost at ~1,000 users | Free tier gotchas | Cron and polling | Auth (email, Apple, Google, Steam link) | Lock-in | DX with Claude Code |
|---|---|---|---|---|---|---|---|
| A. Supabase (Postgres, Auth, RLS, Edge Functions, pg_cron, Storage) + Next.js site on Vercel Hobby | $0 on Free if you keep it active and trim the catalog; $25 if you go Pro early | $25 (Pro, includes $10 compute credit that covers a Micro instance); add $20 if the Vercel site must be on Pro for commercial use | Free project pauses after 7 days of insufficient user database activity, no opt-out; 500 MB database; Nano compute (0.5 GB RAM, shared CPU); Edge Functions capped at 150 s wall clock and 2 s CPU per request | pg_cron on every plan, seconds granularity, dashboard UI; invoke Edge Functions via pg_net; 2,880 runs per month of a 15-minute job is 0.6 percent of the free 500k invocations | Built in: email, Apple (native id-token flow), Google (native id-token via react-native-google-signin); Steam via your own Edge Function that verifies OpenID 2.0 and writes steam_id | Low: plain Postgres, exportable users, standard extensions | Very good: official remote MCP server, SQL migrations in repo, large training corpus; RLS policies need tests |
| B. Convex (reactive DB, TypeScript functions, crons, file storage) + Better Auth component or Clerk | $0 on Free; $0 to a few dollars on Starter if the catalog crosses 0.5 GB ($0.22 per extra GB) | $0 to about $10 on Starter (overage $2.20 per 1M function calls beyond 1M) or $25 Pro | Free plan hard-stops with HTTP errors if you exceed a limit for an extended period; 0.5 GB database; S16 tier (16 concurrent queries) on Free and Starter; no custom domain below Pro | Built-in crons.ts with seconds granularity; one run at a time per cron; cron runs count as function calls (trivial volume) | Not built in: Clerk (recommended by Convex), Better Auth component (Expo guide exists, some rough edges), Convex Auth is beta; Steam via an HTTP action | High: proprietary query and function model, no SQL; mitigated by open-source backend, self-hosting, and export/import | Excellent: official Claude Code plugin with skills, subagent, and MCP built into the CLI; end-to-end TypeScript types |
| C. Firebase (Firestore, Auth, Cloud Functions) | $0 but Blaze plan (card on file) is mandatory because Cloud Functions are not on Spark | Probably $0 to $10; Firestore bills per read, so a feed or ranking screen that reads hundreds of docs per open is the risk | No hard spend cap on Blaze, only budget alerts; Firestore free quota is per day (50k reads, 20k writes), so a nightly full catalog rewrite blows the write quota | Scheduled functions via Cloud Scheduler: 3 jobs free per account then $0.10 per job per month; needs Blaze | Firebase Auth free to 50k MAU, Apple and Google supported; Steam via a custom-token Cloud Function | High: Firestore data model and security rules | Fine, but Claude tends to write read-heavy Firestore patterns that cost money at scale; Firebase CLI has an MCP server |
| D1. Hono on Cloudflare Workers + D1 (or Neon via Hyperdrive) + Drizzle + Better Auth + Cron Triggers | $5 (Workers Paid is effectively required because Free crons get 10 ms CPU and 50 subrequests) | $5 to $6 on D1; $15 to $25 if Neon Launch instead of D1 | Free plan cron and subrequest caps make the Steam poll impossible on Free; D1 is SQLite (single writer, 500 MB Free, 10 GB Paid); Neon Free suspends compute for the rest of the month when 100 CU-hours are used, and a 15-minute poll keeps Neon awake much of the day | Cron Triggers: 5 per account Free, 250 Paid; Paid gives 30 s CPU for sub-hourly crons and 15 min for hourly or slower | Better Auth (MIT, free) with Expo plugin and id-token flows for Apple and Google; community better-auth-steam plugin for OpenID 2.0 | Medium: Workers are standard fetch handlers, Hono runs anywhere, D1 is SQLite; Durable Objects and KV are Cloudflare-only | Good but more assembly: wrangler config, bindings, per-request Drizzle instances for Better Auth |
| D2. Next.js route handlers on Vercel + Neon + Drizzle + Better Auth | $0 on Hobby (non-commercial only) | $0 on Hobby if still non-commercial, else $20 Vercel Pro; Neon Launch usage roughly $5 to $15 | Vercel Hobby cron is once per day with ±59 minute precision, so the Steam poll needs another home; Hobby is for non-commercial use per the fair-use policy | Vercel Cron: 100 jobs per project, once per day on Hobby, once per minute on Pro | Better Auth or Clerk | Low to medium | Very good, and it is the stack the developer already knows |
| D3. Expo API routes on EAS Hosting + Neon + Better Auth | $0 (Free: 100k requests per month, 1 GB storage, 1M CPU-ms, no custom domain) | About $6 to $10 in request overage ($2 per 1M requests beyond 100k) plus Neon; Starter $19 per month if you need a custom domain | Runs on Cloudflare Workers with partial Node compatibility; no dynamic imports, CommonJS only; no crons; native deployment flow is labeled alpha | None on EAS Hosting; use an external scheduler (GitHub Actions schedule, cron-job.org, or a Cloudflare cron) to hit an endpoint | Better Auth via Expo plugin | Medium | Good for the app code, thin for backend concerns |
| D4. Always-on Node worker on Railway or Fly + Postgres | Railway Hobby $5 (includes $5 usage) or Fly about $2 (256 MB machine) plus about $2 for single-node unmanaged Postgres | $5 to $15 | Railway Free gives $1 of credit per month, not enough for an always-on process; Fly has no free tier for new accounts; Render Free web services sleep after 15 minutes and Render cron has no free tier | node-cron or any scheduler inside the process, no platform limits | Better Auth or Clerk | Low | Very good, plain Node |

## 2. Supabase in detail

### Pricing and limits verified September 2026

Free: 2 active projects, 500 MB database, 1 GB file storage, 5 GB egress plus 5 GB cached egress, 50,000 MAU, 500,000 Edge Function invocations, Realtime 200 concurrent connections and 2 million messages per month, Nano compute (up to 0.5 GB RAM, shared CPU, 60 connections). Projects are paused after one week of low activity.

Pro: $25 per month per organization plus usage, with a $10 per month compute credit that covers one Micro instance (1 GB RAM, 2-core shared, 60 connections). Included: 8 GB database ($0.125 per GB after), 100 GB storage ($0.0213 per GB), 250 GB egress ($0.09 per GB), 100,000 MAU ($0.00325 per extra MAU), 2 million Edge Function invocations ($2 per million after), Realtime 500 connections and 5 million messages, daily backups, email support. Spend caps are on by default on Pro, which is the best "no surprise bills" story of any option here. A second project in the same Pro org costs its own compute (about $10 for Micro).

### The free-plan pause, precisely

Supabase's project pausing doc says a Free project is paused when it shows low activity over a 7-day period, measured by user database activity (API calls and queries); a few user requests per day is enough to stay alive. There is no opt-out on Free. Restore is one click from the dashboard; the doc's heading references a 90-day window and the body says a 1-year window (after which you restore from a downloaded backup into a new project). The doc does not say whether pg_cron or Edge Function activity counts as "user" activity, so do not rely on the Steam poll to keep the project awake. The cheap fix is a once-daily Vercel Hobby cron (free) that hits a Next.js route which runs a trivial query against Supabase; that is a legitimate reuse of the existing Vercel habit. The proper fix is Pro at $25 the month you go to TestFlight.

### Does it fit a mobile app?

Yes, and this is Supabase's mainstream use case. The Expo tutorial uses the same supabase-js library as the web, with the session persisted in AsyncStorage or an encrypted SecureStore wrapper (SecureStore caps values at 2,048 bytes, so the tutorial encrypts AsyncStorage with a key held in SecureStore). The mobile app talks to Postgres directly through PostgREST with Row Level Security enforcing per-user access; the publishable key is safe to ship because RLS is the security boundary. Realtime works from React Native for the later feed. Storage works for user avatars.

### Auth for Expo

Sign in with Apple: native flow via expo-apple-authentication, which returns an identity token; you pass it to supabase.auth.signInWithIdToken with a hashed nonce. You must register every bundle id variant (production, dev, preview, and host.exp.Exponent if you test in Expo Go) under Client IDs in the Supabase Apple provider settings. Native-only setups do not need the 6-month secret-key rotation that the web OAuth flow needs. Apple only returns the user's name on the first sign-in, so capture it and save it with updateUser. Apple sign-in is not native on Android, so on Android use the web OAuth flow or hide the Apple button.

Google: native id-token flow using @react-native-google-signin/google-signin (requires a development build, not Expo Go), then signInWithIdToken with the Web Client ID configured; SHA-1 fingerprints registered for Android.

Email: built in, with email verification on by default (turn it off for local testing, keep it on in production and handle the deep link).

Steam linking later: Supabase now supports custom OAuth2 and OIDC providers, but Steam speaks OpenID 2.0, which is neither. A Supabase discussion documents the workaround: your own endpoint (Edge Function or Next.js route) runs the Steam OpenID 2.0 redirect and verification, then writes the returned 64-bit steam_id to the user's profile row. Because this is account linking rather than primary login, that is all you need; you never mint a Supabase session from Steam.

### Edge Functions as the IGDB proxy and job runner

Limits: 256 MB memory, 150 s wall clock on Free (400 s on paid), 2 s of CPU time per request (async I/O does not count), 100 functions on Free, 1,000 on Pro. They run in the region closest to the caller by default; for database-heavy work you should pin the function to the database region with the x-region header or the region option, at the cost of automatic failover. Community measurements of cold starts vary widely (tens of milliseconds to several hundred), which is acceptable for a proxy and irrelevant for cron work.

Verdict for this project: good for the Steam poll (a few hundred sequential HTTP calls in well under 150 s, negligible CPU), the daily review-summary cache, and any on-demand IGDB lookups. Marginal for the initial full catalog import, where 500-record pages at 4 requests per second across hundreds of thousands of rows will exceed 150 s and stress the 2 s CPU budget on JSON parsing. Do the initial import and the nightly delta as a Node script instead: run it from a GitHub Actions scheduled workflow (free for public repos, 2,000 minutes per month for private) or from your laptop, connected to the Supabase pooler exactly as you already do for migrations. IGDB's own staff guidance on the Twitch forum is to page through the API 500 records at a time into your database and then use IGDB webhooks (create, update, delete) for incremental changes, which also solves the deletion problem that offset pagination cannot see. Webhooks are documented in the API docs (register a URL and secret per endpoint at /v4/ENDPOINT/webhooks). The docs also advertise daily CSV data dumps of every endpoint, but they are exclusively for IGDB Data Partners, so do not plan around them. A nightly delta query filtered by updated_at is a fine substitute until you set up webhooks.

Never expose a raw IGDB proxy to the app. The Twitch client secret stays in Edge Function secrets or the job runner's environment, the app-access token (which lasts about 60 days) is cached in a table, and the app queries your mirror with Postgres text search (pg_trgm or tsvector) rather than calling IGDB.

### Cron

Supabase Cron (pg_cron plus a dashboard integration) is on every plan, schedules from every second to once a year, and can invoke Edge Functions or any HTTP endpoint via pg_net. Supabase recommends no more than 8 concurrent jobs and no job longer than 10 minutes. Execution history is in cron.job_run_details. Cost of a 15-minute job: 2,880 Edge Function invocations per month, which is 0.6 percent of the Free allowance and 0.14 percent of Pro's.

### How Next.js and Expo share one backend

Both use supabase-js against the same project and the same RLS policies. The website uses the cookie-based SSR helpers; the app uses token sessions in SecureStore. Shared code lives in a small package: generated database types (supabase gen types), query helpers, and validation schemas. Migrations stay in the repo and run against the pooler in session mode. The website also hosts the pieces a mobile app needs from a domain: the apple-app-site-association file for universal links, OAuth redirect landing pages, privacy policy and terms, account deletion page (Apple requires one), and an admin view.

### Lock-in

Low. It is Postgres with standard extensions (pg_cron, pg_net, pg_trgm). Auth users are rows in auth.users with exportable bcrypt hashes. Edge Functions are Deno and port to any TypeScript runtime with modest changes. RLS policies are plain SQL.

### DX with Claude Code

Supabase runs an official remote MCP server at mcp.supabase.com that Claude Code can use to inspect tables, run SQL, and manage the project. Supabase and Postgres are heavily represented in model training data, so generated SQL, RLS, and supabase-js code is usually right the first time. The one place to be careful is RLS: Claude writes plausible policies that are sometimes too permissive; keep a small policy test suite that runs as two different users.

## 3. Convex in detail

### Pricing and limits verified September 2026

Free: 1 million function calls per month, 0.5 GB database storage, 1 GB file storage, 20 GB-hours of action compute, 1 GB egress, crons included, up to 6 team members, 40 deployments, S16 performance tier (16 concurrent queries). If you exceed a limit for an extended period the deployment starts returning HTTP errors.

Starter: same allowances, requires a credit card, then pure pay-as-you-go: $2.20 per extra million function calls, $0.22 per extra GB of database storage, $0.033 per GB file storage, $0.33 per GB-hour of action compute, $0.132 per GB egress. Convex describes it as scale-to-zero with no base fee.

Professional: $25 per developer per month with 25 million calls, 50 GB database, 100 GB files, 250 GB-hours actions, 50 GB egress, S256 tier, custom domains, preview deployments, log streaming, exception reporting, daily backups, spend thresholds that warn or disable service at a set cost.

Convex does not pause free deployments after a week the way Supabase does; the limits page only mentions an "idle" classification after 30 days without any function calls in the context of fee waivers.

Function limits: queries and mutations get 1 second of user code (database time excluded), Convex-runtime actions up to 30 minutes, Node-runtime actions up to 10 minutes, documents up to 1 MiB, one mutation can schedule up to 1,000 functions.

### Fit for a ranking and feed app

Strong for the interactive parts. Every useQuery is a live subscription, so a friend's new rating appears in your feed without polling code, optimistic updates are built in, and the client cache is automatic. Mutations are transactional, which matters for "insert a comparison, then rewrite the ordered ranking" as one atomic step. Scheduled functions and crons are first class: a cron in crons.ts with seconds-level granularity, at most one instance running at a time, and overlapping runs skipped rather than piled up.

Weaker for the catalog and the analytics. There is no SQL, so "match percentage between two users" is a function you write over indexed range queries, and a nightly upsert of a few hundred thousand catalog documents is a batch of mutations that you paginate yourself (each mutation is a function call; 500 documents per mutation keeps this to a few hundred calls). The 0.5 GB Free database ceiling means the catalog probably pushes you to Starter (pennies per month for an extra GB) or to storing a trimmed catalog. Full-text search exists (search indexes) and covers "find a game by title" well. Vector search exists if you ever want similarity.

### Auth

Convex's docs recommend Clerk, WorkOS AuthKit, or Auth0 for production and mark Convex Auth as beta ("may change in backward-incompatible ways"). The Better Auth component (@convex-dev/better-auth) is the self-hosted route: sessions in expo-secure-store, social providers configured against your deployment's convex.site URL (the OAuth redirect is https://your-deployment.convex.site/api/auth/callback/google), and pinned versions of better-auth and @better-auth/expo. The Expo guide does not spell out the native id-token flow for Apple and Google, and an open GitHub issue on the component notes the Expo setup was incomplete at one point, so budget a day of fiddling. Clerk is the frictionless path (native useSignInWithApple and useSignInWithGoogle hooks) at the cost of another vendor holding your users.

Steam linking: an HTTP action on Convex performs the OpenID 2.0 round trip and stores steam_id on the user document.

### Expo and Next.js

React Native uses the same convex/react client as the web; the quickstart is ConvexProvider plus EXPO_PUBLIC_CONVEX_URL. Next.js gets server-side helpers and preloading. One deployment serves both. Convex removes the need for a separate API layer entirely: the app calls typed functions, and Convex generates the client types from the server code. HTTP actions exist for webhooks (IGDB webhooks, Steam callbacks) and for any endpoint that must be plain HTTP.

### Lock-in

High in code shape (schema DSL, query and mutation model, no SQL), but Convex open-sourced the backend under FSL Apache 2.0, ships a self-hosted mode with SQLite or Postgres storage, and provides npx convex export and import. You could leave, but you would rewrite every data-access function.

### DX with Claude Code

The best of the four. Convex ships an official Claude Code plugin bundling skills, a convex-expert subagent, a runtime error monitor, and an MCP server (npx convex mcp start) that reads your live deployment. End-to-end TypeScript types mean Claude gets compile errors instead of runtime surprises.

## 4. Firebase in detail

Spark (free, no card): Firestore 1 GiB stored, 50,000 reads, 20,000 writes, and 20,000 deletes per day, 10 GiB egress per month; Auth free to 50,000 MAU; Cloud Storage 5 GB; Cloud Functions not available at all. Blaze (pay as you go, card required): keeps the Spark quotas, adds Cloud Functions with 2 million invocations free then $0.40 per million plus compute and egress, and unlocks Cloud Scheduler for scheduled functions at $0.10 per job per month with 3 jobs free per account.

Fit: the IGDB proxy and every cron require Cloud Functions, so Blaze is mandatory from day one. Blaze has budget alerts but no hard cap; the "no surprise bills" story is the weakest here. The Firestore pricing model punishes exactly what this app does: a ranking screen or feed that reads hundreds of small documents per open, and a nightly catalog refresh that could exceed the 20,000 daily free writes. Full-text catalog search is not built into Firestore; you would add Algolia or Typesense (or store the catalog elsewhere). Realtime listeners and offline persistence are excellent and would make the app feel great.

Expo: the Firebase JS SDK (Auth, Firestore, Storage) works in Expo Go; React Native Firebase (Crashlytics, Analytics, native Auth) needs a development build. Apple sign-in on Expo goes through expo-apple-authentication and signInWithCredential with an OAuthProvider credential.

Lock-in: high (Firestore data model, security rules, Functions). DX: adequate, and the Firebase CLI ships an MCP server, but generated Firestore code tends toward read-amplifying patterns and security rules are a separate language to get right.

Verdict: not recommended for this project. It would work, but you would pay in reads for the relational shape of the data and lose Postgres, which you already know.

## 5. Roll-your-own API

### Hosting the TypeScript server

Vercel Hobby: free, 1 million function invocations, 4 active-CPU hours, 360 GB-hours provisioned memory, 300 s max function duration, cron once per day with hour-level precision, 100 cron jobs per project, and a fair-use rule that restricts Hobby to non-commercial personal use. Pro is $20 per user per month with per-minute crons and spend management. A free app with no monetization is defensible as personal use; the moment you add subscriptions or ads, move to Pro.

Cloudflare Workers Free: 100,000 requests per day, 10 ms CPU per invocation, 50 subrequests per invocation, 5 Cron Triggers per account, and crons get 10 ms CPU. That last number makes the Steam poll impossible on Free. Workers Paid at $5 per month: 10 million requests and 30 million CPU-ms included, 10,000 subrequests per invocation, 250 Cron Triggers, and cron CPU of 30 s for intervals under an hour or 15 minutes for hourly or slower (with a 15 minute wall-clock ceiling). D1: 500 MB per database on Free (10 GB on Paid), 5 million rows read and 100,000 rows written per day on Free, 25 billion reads and 50 million writes per month included on Paid, 30 s query timeout, and a single-writer SQLite model. Hyperdrive (connection pooling to external Postgres): 100,000 queries per day on Free, unlimited on Paid. KV: 100,000 reads and 1,000 writes per day Free. R2: 10 GB per month Free with zero egress fees.

Railway: Free plan is $1 of usage credit per month (0.5 GB RAM, 1 vCPU, 1 replica), Hobby is $5 per month including $5 of usage, then $10 per GB-month RAM and $20 per vCPU-month, $0.05 per GB egress, $0.15 per GB-month volumes. A small always-on Hono worker at 256 MB and low CPU fits within the Hobby credit; add a Postgres service with a volume and you drift to $8 to $12.

Fly.io: no free tier for new accounts (a trial credit only). shared-cpu-1x at 256 MB is about $2.02 per month, 1 GB is about $5.92, stopped machines cost only rootfs at $0.15 per GB. Unmanaged single-node Fly Postgres is about $2 per month for dev use. Cheapest always-on option, with the least hand-holding.

Render: Free web services sleep after 15 minutes idle and take about a minute to wake, 750 free instance hours per workspace per month, free Postgres expires 30 days after creation, and cron jobs and background workers have no free instances (cron from $1 per month, paid web services from $7). Not competitive for this project.

### Expo API routes and EAS Hosting

Expo Router API routes (+api.ts files) need web output mode "server" and are deployed to EAS Hosting, which Expo calls the best way to deploy them; Vercel, Netlify, Bun, and Express have unofficial or experimental adapters. EAS Hosting runs on Cloudflare Workers with V8 isolates, so Node compatibility is partial; code bundles into one CommonJS file with no dynamic imports, and the automated native deployment flow is labeled alpha. Pricing: Free includes 100,000 requests per month, 1 GB storage, 1 million CPU-ms, and no custom domain; paid plans (Starter $19 per month, Production $199) add one custom domain per project, $2 per additional million requests, and $0.10 per GiB bandwidth. There is no cron; EAS Workflows can run on a cron schedule but they are CI jobs on build workers, not a backend scheduler.

Production readiness in 2026: fine for small, stateless endpoints that belong to the app (a feature-flag check, a signed-URL minter), and the dashboard gives crash, log, and request views. Not the place for the IGDB mirror, the Steam poll, or auth, because it has no scheduler, partial Node support, and a request quota that 1,000 daily-active users would exceed in the first week (about 3 million requests per month at 100 requests per user per day, roughly $6 in overage, which is cheap but shows the quota is not a "hobby cap"). Treat it as a convenience, not a backend.

### Database choices

Supabase Postgres as a plain database is covered above. Neon Free: 100 CU-hours per month per project, 0.5 GB storage, scale to zero after 5 minutes, autoscale to 2 CU, and compute is suspended for the rest of the period once you hit a limit. Neon Launch: no minimum, $0.106 per CU-hour, $0.35 per GB-month. Cold starts after scale-to-zero are typically a few hundred milliseconds. The catch for this project is the 15-minute poll: each run wakes the database and keeps it up for at least the 5-minute idle window, so the poll alone consumes roughly 8 to 10 hours of uptime per day at the 0.25 CU minimum, which is 60 to 75 CU-hours per month before any user traffic. That is uncomfortably close to the Free cap. Mitigations: poll every 30 minutes, write poll results to KV or D1 instead of Postgres, or budget about $10 per month on Launch.

PlanetScale has no free tier since 2024; PlanetScale Postgres starts at $5 per month for a PS-5 single node (512 MB) and $10 for PS-10. Prisma Postgres has a free tier of 100,000 operations per month and 500 MB, which is too few operations for a catalog-search app. Cloudflare D1 (above) is the cheapest durable option if you accept SQLite semantics.

### ORM and auth libraries

Drizzle is the better fit for edge runtimes (Cloudflare Workers, EAS Hosting) because it is SQL-first, has no engine binary, and supports D1, Neon HTTP, and node-postgres. Prisma is fine on Node hosts (Railway, Fly, Vercel Node functions) and has improved on serverless, but it is heavier at the edge.

Better Auth: MIT and free with no usage caps. Vercel acquired the company on 7 July 2026; the library stays MIT with the same team. The optional managed dashboard is free at the Starter tier and $20 per month for Pro; you never need it. The Expo integration stores sessions in expo-secure-store, supports a redirect flow for social providers and an id-token flow for native Apple, Google, and Facebook sign-in, and requires your app scheme in trustedOrigins. Authenticated requests from native need you to attach the cookie from authClient.getCookie() manually. Steam: a community plugin (better-auth-steam) implements OpenID 2.0 because Steam is neither OAuth2 nor OIDC; the generic OAuth plugin cannot do it. On Cloudflare there is an official Hono example (Better Auth, Drizzle, Neon) and a better-auth-cloudflare package for D1, Hyperdrive, KV, and R2; the important invariant is one Drizzle instance per request.

Auth.js (NextAuth) is now maintained by the Better Auth team in maintenance mode (security fixes only) and its maintainers point new projects at Better Auth. Do not start on Auth.js in 2026.

Clerk: Free (Hobby) plan now includes 50,000 monthly retained users (raised from 10,000 in February 2026); Pro is $25 per month and adds branding removal, MFA, and custom email templates; overage is $0.02 per user from 50,001 to 100,000. Clerk bills MRU, which excludes users who sign up and never return, so hobby-scale bills are effectively $0. The Expo SDK has native Sign in with Apple (iOS) and native Google sign-in (iOS and Android) hooks and a beta AuthView component. Custom providers must be OIDC-compliant, so Steam needs a small OIDC bridge service (there are open-source ones) or, more simply, a linking endpoint in your own API that does not go through Clerk at all.

## 6. Where the cron and polling jobs should live, and what a 15-minute job costs

| Platform | Can it run every 15 minutes? | Monthly cost of one 15-minute job (2,880 runs) | Notes |
|---|---|---|---|
| Vercel Cron, Hobby | No (once per day, fires within the hour) | n/a | Use it for the nightly refresh and the daily keep-alive ping only |
| Vercel Cron, Pro | Yes, per minute | $0 beyond the $20 plan; invocations are trivial | Fine if you are on Pro anyway |
| Supabase pg_cron + Edge Function | Yes, to the second | $0 on Free and Pro (0.6 percent of Free invocations) | Free project can still pause if there is no user traffic; pin the function to the DB region |
| Convex cron | Yes, to the second | $0 (about 6,000 function calls including the mutations, out of 1 million) | One run at a time, overlaps skipped |
| Cloudflare Cron Triggers, Free | Technically, but 10 ms CPU and 50 subrequests | n/a | Not viable for polling several hundred games |
| Cloudflare Cron Triggers, Paid | Yes, per minute | $0 beyond the $5 plan (30 s CPU per run) | 10,000 subrequests per run covers thousands of Steam calls |
| Firebase scheduled function | Yes | $0 for the first 3 Cloud Scheduler jobs, then $0.10 per job; invocations free within 2 million | Requires Blaze |
| Railway or Fly always-on worker | Yes, anything | $2 to $6 for the machine | No platform limits at all; simplest mental model |
| EAS Hosting | No scheduler | n/a | Trigger an endpoint from GitHub Actions (5-minute minimum, can be delayed) or cron-job.org |
| Render cron service | Yes | $1 minimum per cron service | No free tier for cron |

Steam budget check: the Steam Web API terms allow 100,000 calls per day per key. Polling 500 tracked games every 15 minutes is 48,000 calls per day, within the limit; 1,000 games every 15 minutes is 96,000 and at the edge. Poll the top few hundred at 15 minutes and the long tail hourly. GetNumberOfCurrentPlayers is on the keyed Web API; the store appreviews endpoint used for review summaries needs no key but is community-documented as rate-limited to roughly 200 requests per 5 minutes, which is fine for a daily cache.

IGDB budget check: 4 requests per second, 8 in flight, 500 records per page. A full pull of 500,000 records is about 1,000 requests, so a few minutes of wall time in one process; a nightly delta filtered by updated_at is a handful of requests. Neither fits comfortably in a 150 s Edge Function or a 10 ms Worker cron, which is why the full pull belongs in a Node script (GitHub Actions or a worker machine) or a Convex action (30-minute limit).

## 7. Auth specifics

### Apple's rule

App Store Review Guideline 4.8 (Login Services): if the app uses a third-party or social login (Google Sign-In is named explicitly) to set up or authenticate the user's primary account, it must also offer an equivalent login that limits data collection to name and email, lets users keep their email private, and does not collect app interactions for advertising without consent. Sign in with Apple satisfies this; it is not the only thing that does, but it is the obvious one. The exception that matters: an app that exclusively uses its own account system (email and password only) does not have to offer Apple. So "email only" is compliant, "email plus Google" requires Apple, and "email plus Google plus Apple" is the plan. Steam linking attached to an existing account is not a primary login and does not trigger 4.8, but if you ever let people create an account with Steam alone it would.

Practical implications on Expo: native Apple sign-in needs a development build (expo-apple-authentication), the Sign in with Apple capability on the App ID, and every bundle id variant registered with your auth provider. Apple returns the name only once. On Android, Apple sign-in is web-based; most apps simply do not show the Apple button on Android.

### How each option handles Apple and Google on Expo

Supabase: native id-token flows for both, documented for Expo, no extra vendor. Convex: via Clerk (native hooks, easiest), via the Better Auth component (id-token flow exists in Better Auth's Expo plugin but the Convex guide leans on redirect flows through convex.site), or Convex Auth (beta). Firebase: Firebase Auth supports both; native Google needs a dev build. Roll-your-own: Better Auth Expo plugin (id-token flows) or Clerk.

### Steam OpenID feasibility

Steam only speaks OpenID 2.0. No hosted auth provider (Supabase custom providers, Clerk custom providers, Firebase) accepts it natively. Every option ends up with the same 60 lines of code: redirect to steamcommunity.com/openid/login, receive the callback, verify the assertion with a check_authentication request, extract the 64-bit id from the claimed_id URL, and store it on the user's profile. Better Auth has a community plugin that packages this. Because you only need linking, run it as an authenticated endpoint that requires an existing session, and never mint sessions from it.

### Cost at hobby scale

Supabase Auth: $0 (50,000 MAU on Free, 100,000 on Pro). Better Auth: $0 forever (MIT), plus whatever your database and host cost. Clerk: $0 to 50,000 MRU on the free plan, but the free plan shows Clerk branding and lacks MFA; Pro is $25 per month. Firebase Auth: $0 to 50,000 MAU. At 1,000 users all four are free; the difference is who holds the user table and how portable it is.

## 8. Storage and CDN for covers, and push notifications

### Cover images

Hotlink IGDB's CDN first. Cover records expose an image_id and the URL pattern is https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg with documented size tokens (thumb, cover_small, cover_big, 720p, 1080p, and 2x retina variants). Store only image_id in the mirror; the app builds the URL for the size it needs. I found no IGDB rule against hotlinking, and it is what most IGDB-powered apps do; the image docs even assume you cache, noting that images removed or replaced on IGDB.com stay available for 30 days "when designing cache logic". It is still a dependency on a third party's CDN, so keep the ability to swap in your own origin. When you cache: only cache covers for games users actually touch, not the whole catalog (300,000 covers at 30 to 60 KB each is 9 to 18 GB, which is real money on Supabase Storage but free on Cloudflare R2's 10 GB-month allowance with zero egress). Supabase Storage is 1 GB on Free and 100 GB on Pro at $0.0213 per GB over, with image transformations on paid plans. R2 plus a Worker is the cheapest origin if you ever need one; expo-image on the client caches aggressively either way.

### Push notifications

Expo Push Service is free with no volume cap, limited to 600 notifications per second per project and 100 messages per request, and it requires you to upload an FCM V1 key and an APNs key. Your backend (Edge Function, Convex action, Worker, or Node worker) calls the Expo push API with stored Expo push tokens. Delivery is best effort with no SLA, which is fine for "your friend ranked a game you have". OneSignal changed its free plan for new customers on 1 September 2026: mobile push is free only up to 1,000 monthly active users, with the Growth plan from $19 per month beyond that. For this app, Expo Push is the right default; OneSignal only earns its fee if you want marketing journeys and segmentation.

## 9. Analytics and error tracking

PostHog: free tier of 1 million events, 5,000 session replays, 1 million feature-flag requests, 100,000 exceptions, and 1,500 survey responses per month, no card required, with usage-based pricing and billing limits after that. posthog-react-native has an Expo config plugin for session replay and error symbolication. PostHog's error tracking is good enough to skip Sentry at first if you want one vendor.

Sentry: the free Developer plan gives 5,000 errors, 5 million spans, 50 replays, one user, and 30-day retention; Team is $26 per month. @sentry/react-native ships an Expo config plugin that uploads source maps during EAS builds, and its native crash symbolication is better than PostHog's. Recommendation: Sentry Developer for crashes, PostHog for product analytics and flags, both at $0.

## 10. What changes if the mobile client is Expo versus native SwiftUI

With Expo you get iOS, Android, and (optionally) web from one codebase, and every backend above has a first-party or first-class React Native path: supabase-js, convex/react, the Firebase JS SDK, and Better Auth's Expo plugin. EAS Build's free tier covers 15 iOS and 15 Android builds per month and EAS Update covers 1,000 MAU of OTA updates free (3,000 on Starter at $19), which lets you ship JavaScript fixes without App Review. Expo Go is only useful until you add native Apple or Google sign-in; from then on you work in development builds. The Next.js site can share types and query code with the app through a monorepo package.

With SwiftUI you ship iOS only until you write a second client for Android, and the backend choice matters more. Supabase has an official Swift SDK with Auth including Sign in with Apple, Realtime, and Storage, so it stays the safest choice. Firebase's iOS SDK is first class. Convex has an official Swift client for queries and mutations, and you would pair it with Clerk's iOS SDK or a custom OIDC provider for auth. Better Auth has no Swift client; you would call its REST endpoints and manage cookies or bearer tokens yourself, so a Better Auth stack loses its main advantage on SwiftUI. Push goes straight to APNs (no Expo Push). Steam linking uses ASWebAuthenticationSession against the same server endpoint. The website stays Next.js on Vercel regardless. In short: SwiftUI pushes you toward Supabase or Firebase and away from the Better Auth and Convex-plus-Better-Auth stacks; Expo keeps all options open.

## 11. Which parts of the old Vercel and Supabase stack still apply

Still applies, unchanged: Supabase Postgres with migrations run against the pooler; Supabase Auth with the same users table; RLS as the security boundary; supabase-js (the same library, with a different session store); Next.js on Vercel for the website, marketing, admin, legal pages, account deletion page, OAuth landing pages, and the apple-app-site-association file for universal links; Vercel Hobby cron for once-a-day jobs and the keep-alive ping; environment variable discipline for secrets.

Changes or no longer applies: Next.js is no longer the data layer. The app talks to Supabase directly, so server components, route handlers, and server actions are not how mobile screens get data (server actions in particular are not callable from React Native in a supported way). If you keep an HTTP API, it becomes a versioned public contract, because app binaries in the wild cannot be redeployed like a website and old versions must keep working. Cookie-based auth, Vercel middleware for auth, and next/image do not apply to the phone; the app uses token sessions in SecureStore and expo-image with CDN URLs. ISR and Vercel's CDN caching do nothing for app traffic. Vercel Cron cannot do the 15-minute poll on Hobby. Vercel Web Analytics is web only, so PostHog replaces it. New obligations arrive with the app stores: Apple 4.8, privacy nutrition labels and privacy manifest, an in-app account deletion path, and OTA updates through EAS Update instead of a git push.

## 12. Ranked recommendation

### 1. Expo + Supabase (Pro when you hit TestFlight) + Next.js on Vercel Hobby, with a Node job runner on GitHub Actions

Why first: it matches the data (relational rankings, comparison log, match percentage in SQL), matches the developer (migrations, pooler, Vercel already familiar), has the strongest no-surprise-bill story (Free is hard-capped, Pro has spend caps on by default), and every requirement in the roadmap has a native answer: Apple and Google via id-token flows, Realtime for the feed, Storage for avatars, pg_cron for the Steam poll and review cache, custom OAuth providers or a tiny Edge Function for Steam linking, TMDB rows in the same Postgres later. Claude Code has the official MCP server and the deepest training coverage.

Concrete shape: Expo app with supabase-js and RLS; a Next.js site on Vercel Hobby that hosts the web version, legal pages, AASA file, and one daily cron that pings the database (or the nightly delta if you would rather keep it in Next.js); Supabase Edge Function "steam-poll" invoked by pg_cron every 15 minutes and pinned to the database region; Edge Function "steam-reviews" daily; the initial IGDB import and nightly delta as a Node script run by a GitHub Actions schedule against the pooler, moving to IGDB webhooks (received by an Edge Function) once the mirror is stable. Costs: $0 for months if you trim the catalog and keep the daily ping; $25 per month from the day you care about the project never pausing, backups, and the full mirror. Move the Vercel site to Pro ($20) only if the app becomes commercial.

Risks to manage: RLS mistakes (write policy tests), the 500 MB Free limit versus the catalog (trim, or go Pro), Edge Function limits for heavy jobs (keep heavy work in the Node runner), and Nano compute on Free being slow for catalog search (pg_trgm indexes help; Pro's Micro instance is markedly better).

### 2. Expo + Convex (Starter) + Better Auth component, with Next.js on Vercel Hobby for the website

Why second: the best developer experience for the reactive parts of this app (feed, live rankings, optimistic comparisons), crons built in with no free-tier pause, scale-to-zero pricing on Starter, and the strongest Claude Code tooling of any vendor. It removes the API layer entirely: the app and the site call the same typed functions. Costs $0 to a few dollars at hobby scale.

Why not first: the catalog mirror and the match-percentage math are less natural without SQL and the 0.5 GB Free ceiling is tight; auth is not built in and the Better Auth component's Expo path still has rough edges (Clerk is smoother but adds a vendor); lock-in is real even though the backend is open source; and it throws away the developer's Postgres and Supabase experience. Pick this if you value live queries and TypeScript-everywhere over SQL, and you are willing to learn a new mental model while shipping.

### 3. Expo + Hono on Cloudflare Workers (Paid, $5) + D1 + Drizzle + Better Auth + Cron Triggers, with R2 for cached covers

Why third: the cheapest predictable bill at 1,000 users (about $5 to $6 flat), global edge latency, R2 with zero egress for covers, KV and the Cache API for IGDB response caching, and Cron Triggers with real CPU budgets on the Paid plan. Hono and Better Auth are portable, and Drizzle on D1 is pleasant. Claude Code handles this stack well, and Cloudflare publishes official agent skills.

Why not higher: the most assembly and the most decisions (bindings, wrangler, per-request Drizzle instances, no RLS so every query must be scoped in code), SQLite semantics on D1 (single writer, 10 GB cap, no Postgres extensions), no realtime without Durable Objects, and Neon instead of D1 reintroduces the scale-to-zero versus 15-minute-poll tension. Choose it if you want to learn Cloudflare or expect to run many small services for near zero.

### Honourable mention: keep any of the above and add a $2 to $5 always-on worker on Fly or Railway

If Edge Function or Worker limits ever bite the job runner, a single always-on Node process on Fly (about $2 per month at 256 MB) or Railway Hobby ($5 including usage) running node-cron against Supabase or Neon is the boring, limit-free answer, and it costs less than most people's coffee budget.

## Sources

Supabase
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase docs: Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase docs: Upgrading (restore windows)](https://supabase.com/docs/guides/platform/upgrading)
- [Supabase docs: Compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Supabase docs: Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase docs: Regional invocation](https://supabase.com/docs/guides/functions/regional-invocation)
- [Supabase docs: Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase docs: Cron](https://supabase.com/docs/guides/cron)
- [Supabase docs: Sign in with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase docs: Google sign in](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase docs: Expo React Native tutorial](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- [Supabase docs: Custom OAuth and OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Supabase blog: Custom OIDC providers](https://supabase.com/blog/custom-oauth-oidc-providers)
- [Supabase discussion: Sign in with Steam workaround](https://github.com/orgs/supabase/discussions/15118)
- [Supabase MCP server](https://supabase.com/features/mcp-server)
- [Supabase Edge Functions performance discussion](https://github.com/orgs/supabase/discussions/29301)
- [Supabase Edge Functions in production (2026, third party)](https://www.webversearena.com/blog/supabase-edge-functions-production-guide-2026)

Convex
- [Convex pricing](https://www.convex.dev/pricing)
- [Convex pricing FAQ](https://www.convex.dev/pricing/faq)
- [Convex news: the Starter plan](https://news.convex.dev/introducing-the-new-convex-starter-plan-pay-for-only-what-you-need/)
- [Convex news: making plans more friendly](https://news.convex.dev/making-convex-plans-more-friendly/)
- [Convex docs: Limits](https://docs.convex.dev/production/state/limits)
- [Convex docs: Cron jobs](https://docs.convex.dev/scheduling/cron-jobs)
- [Convex docs: Authentication](https://docs.convex.dev/auth)
- [Convex docs: React Native client](https://docs.convex.dev/client/react-native)
- [Convex docs: React Native quickstart](https://docs.convex.dev/quickstart/react-native)
- [Convex docs: Self hosting](https://docs.convex.dev/self-hosting)
- [Convex news: Convex goes open source](https://news.convex.dev/convex-goes-open-source/)
- [convex-backend on GitHub](https://github.com/get-convex/convex-backend)
- [Convex component: Better Auth](https://www.convex.dev/components/better-auth)
- [Convex + Better Auth: Expo guide](https://labs.convex.dev/better-auth/framework-guides/expo)
- [get-convex/better-auth issue 168 (Expo setup)](https://github.com/get-convex/better-auth/issues/168)
- [Convex docs: MCP server](https://docs.convex.dev/ai/convex-mcp-server)
- [Convex docs: Using Claude Code](https://docs.convex.dev/ai/using-claude-code)

Firebase
- [Firebase pricing](https://firebase.google.com/pricing)
- [Firebase docs: Schedule functions](https://firebase.google.com/docs/functions/schedule-functions)
- [Expo docs: Using Firebase](https://docs.expo.dev/guides/using-firebase/)

Vercel
- [Vercel docs: Cron jobs usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel docs: Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel changelog: 100 cron jobs per project on every plan](https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan)
- [Vercel blog: Vercel acquires Better Auth](https://vercel.com/blog/vercel-acquires-better-auth)

Cloudflare
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Hono example: Better Auth on Cloudflare](https://hono.dev/examples/better-auth-on-cloudflare)
- [better-auth-cloudflare on GitHub](https://github.com/zpg6/better-auth-cloudflare)

Databases and hosts
- [Neon pricing](https://neon.com/pricing)
- [Neon docs: Scale to zero](https://neon.com/docs/introduction/scale-to-zero)
- [Neon docs: Connection latency and timeouts](https://neon.com/docs/connect/connection-latency)
- [PlanetScale pricing summary (third party, 2026)](https://costbench.com/software/database-as-service/planetscale/)
- [Prisma pricing](https://www.prisma.io/pricing)
- [Railway docs: Pricing plans](https://docs.railway.com/pricing/plans)
- [Railway pricing](https://railway.com/pricing)
- [Fly.io pricing](https://fly.io/docs/about/pricing/)
- [Render docs: Free instances](https://render.com/docs/free)

Expo
- [Expo pricing](https://expo.dev/pricing)
- [Expo docs: EAS Hosting introduction](https://docs.expo.dev/eas/hosting/introduction/)
- [Expo docs: API routes (web)](https://docs.expo.dev/router/web/api-routes/)
- [Expo docs: API routes reference](https://docs.expo.dev/router/reference/api-routes/)
- [Expo docs: API routes on EAS Hosting](https://docs.expo.dev/eas/hosting/api-routes/)
- [Expo docs: EAS Workflows](https://docs.expo.dev/eas/workflows/introduction/)
- [Expo docs: Push notifications FAQ](https://docs.expo.dev/push-notifications/faq/)
- [Expo docs: Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Expo docs: Authentication](https://docs.expo.dev/develop/authentication/)
- [Expo docs: Using PostHog](https://docs.expo.dev/guides/using-posthog/)

Auth
- [Apple App Review Guidelines (4.8 Login Services)](https://developer.apple.com/app-store/review/guidelines/)
- [Clerk pricing](https://clerk.com/pricing)
- [Clerk free plan change to 50k MRU (third party summary)](https://saasprices.net/blog/clerk-free-plan-changes)
- [Clerk docs: Expo SDK](https://clerk.com/docs/reference/expo/overview)
- [Clerk docs: Sign in with Apple on Expo](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-apple)
- [Clerk docs: Custom OAuth providers](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/custom-provider)
- [steam-oidc-provider (OpenID 2.0 to OIDC bridge)](https://github.com/xIAlexanderIx/steam-oidc-provider/blob/main/README.md)
- [Better Auth docs: Expo integration](https://better-auth.com/docs/integrations/expo)
- [Better Auth pricing](https://better-auth.com/pricing)
- [Better Auth on GitHub](https://github.com/better-auth/better-auth)
- [better-auth-steam on npm (via libraries.io)](https://libraries.io/npm/better-auth-steam)
- [better-auth-steam-demo](https://github.com/Luc4sguilherme/better-auth-steam-demo)
- [Auth.js is now part of Better Auth](https://github.com/nextauthjs/next-auth/discussions/13252)

Analytics, errors, push
- [PostHog pricing](https://posthog.com/pricing)
- [PostHog docs: React Native](https://posthog.com/docs/libraries/react-native)
- [Sentry pricing](https://sentry.io/pricing/)
- [Sentry docs: Expo](https://docs.sentry.io/platforms/react-native/guides/expo/)
- [OneSignal pricing](https://onesignal.com/pricing)
- [OneSignal usage and billing FAQ (2026 free plan change)](https://documentation.onesignal.com/docs/en/billing-faq)

IGDB, Steam, TMDB, stores
- [IGDB API docs](https://api-docs.igdb.com/)
- [IGDB API page](https://www.igdb.com/api)
- [Twitch dev forum: IGDB, store all games in a local database](https://discuss.dev.twitch.com/t/igdb-store-all-games-in-local-database/47241)
- [Twitch dev forum: Commercial use of IGDB API](https://discuss.dev.twitch.com/t/commercial-use-of-igdb-api/23567)
- [Wikipedia: IGDB](https://en.wikipedia.org/wiki/IGDB)
- [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms)
- [Steamworks: ISteamUserStats (GetNumberOfCurrentPlayers)](https://partner.steamgames.com/doc/api/ISteamUserStats)
- [Steam review API guide (third party)](https://www.playerintellabs.com/blog/steam-review-api-getappreviews-guide)
- [TMDB API terms of use](https://www.themoviedb.org/api-terms-of-use)
- [TMDB developer FAQ](https://developer.themoviedb.org/docs/faq)
- [Apple developer fee 2026 (third party summary)](https://magora-systems.com/apple-developer-fee/)
