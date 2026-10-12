# Tech stack recommendation

Written 2026-09-08. Synthesizes [docs/research/app-framework.md](../research/app-framework.md) and [docs/research/backend-and-hosting.md](../research/backend-and-hosting.md). Status: confirmed 2026-09-08.

## The short answer

Yes, Supabase and Vercel still apply, but their roles change. Supabase becomes the whole backend: Postgres, Auth, Row Level Security, scheduled jobs, and small serverless functions. Vercel shrinks to hosting the website and a once-a-day cron. The mobile app talks to Supabase directly. Next.js is no longer the data layer, because server components, route handlers, and server actions are not how a phone app fetches data.

The app itself is one Expo codebase that builds for iOS, Android, and web, laid out as a monorepo so a Next.js site can be added later for public, indexable game pages.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| App | Expo SDK 57, React Native, Expo Router, TypeScript | One codebase for both app stores and the web. Largest React Native corpus for Claude Code. Social features ship to all three targets in one pass. |
| Repo layout | pnpm monorepo: `apps/mobile` (Expo, includes the web build), `packages/core` (ranking logic, types), `packages/api` (Supabase client, queries), `packages/tokens` (design tokens exported from Figma) | Costs nothing now, keeps a separate Next.js site possible without a rewrite. |
| Styling and tokens | Uniwind (Tailwind v4) with tokens from Figma variables; React Native Reusables for owned base components | Token-friendly, works on web and native, every component is ours to match the Figma file. Tamagui 2 is the alternative if a styled-system with its own kit is preferred. |
| Animation and gestures | Reanimated 4.5, Gesture Handler (SDK pin), react-native-sortables for drag to reorder | UI-thread animation for the comparison cards and list insertion. Verify sortables on web early. |
| Native surfaces | Expo UI (SwiftUI and Compose components) for sheets, pickers, segmented controls | Native feel without leaving TypeScript. Provide web fallbacks. |
| Database | Supabase Postgres, migrations run against the pooler | Relational data: rankings, comparison log, match percentage in SQL. Already familiar. |
| Auth | Supabase Auth: email, Sign in with Apple, Google. Steam OpenID linking via a small Edge Function later | Apple guideline 4.8 requires Sign in with Apple once Google is offered. No auth provider supports Steam natively, so linking is a custom endpoint on any stack. |
| Security boundary | Row Level Security on every user table | The app talks to the database directly, so RLS is the authorization layer. Write policy tests. |
| Catalog mirror | IGDB mirrored into Postgres by a Node script on a GitHub Actions schedule (initial full pull, then nightly delta); IGDB webhooks into an Edge Function once stable | A full pull is about 1,000 requests and a few minutes of wall time, too long for an Edge Function, fine for a scheduled script. |
| Scheduled jobs | pg_cron invoking Edge Functions: Steam concurrent-player poll every 15 minutes, Steam review summary daily | Seconds granularity on every Supabase plan. Vercel Hobby cron only runs once a day, so it cannot host the poll. |
| Website | Next.js on Vercel Hobby: web build of the app, legal pages, account deletion page, OAuth landing pages, the apple-app-site-association file for universal links, one daily cron | Everything Vercel is good at, none of what it is not. |
| Cover images | Hotlink IGDB's image CDN, store only the image id; lazily cache to Cloudflare R2 later if needed | IGDB's docs assume caching. R2 has 10 GB free and zero egress. |
| Push notifications | Expo Push Service | Free. OneSignal's free tier now stops at 1,000 monthly active users. |
| Analytics and errors | PostHog and Sentry free tiers | Zero cost at hobby scale. |
| Delivery | EAS Build and Submit (Free during development, Starter at 19 USD per month once submitting weekly), EAS Update for JavaScript-only fixes | Over-the-air updates are allowed for fixes and UI under Apple guideline 2.5.2. |

## Costs

| Phase | Monthly | Notes |
|---|---|---|
| Building, only you using it | 0 USD | Supabase Free, Vercel Hobby, EAS Free. Keep the Supabase project active with the daily ping or it pauses after 7 days. Trim the catalog mirror to fit 500 MB. |
| From TestFlight onward | 25 USD | Supabase Pro. Spend caps on by default, so no surprise bills. Best story of any option. |
| Publishing weekly | 44 USD | Add EAS Starter at 19 USD. |
| Commercial use of the website | 64 USD | Add Vercel Pro at 20 USD if the site stops being non-commercial under Vercel's fair-use policy. |
| One-time | 99 USD per year for Apple, 25 USD once for Google Play | Unavoidable on any stack. |

## Why not the alternatives

- **Convex** (second place) has the best developer experience for the reactive parts, built-in crons with no free-tier pause, and the strongest Claude Code tooling of any vendor. It loses on SQL for the catalog mirror and match-percentage math, a 0.5 GB free ceiling, auth not built in, real lock-in, and throwing away existing Postgres and Supabase knowledge.
- **Hono on Cloudflare Workers with D1** (third place) is the cheapest predictable bill at a thousand users, around 5 USD flat, but the most assembly, no RLS, SQLite semantics, and no realtime without Durable Objects. The Free plan cannot run the Steam poll at all.
- **Firebase** is not recommended. Cloud Functions require a card on file with no hard spend cap, and Firestore bills per read on exactly the ranking and feed patterns this app has.
- **Native SwiftUI** gives the best-feeling iOS app and the best Figma pipeline, but doubles every feature the day the social layer lands, and Android becomes never. Only right if Android and web are explicitly secondary.
- **Flutter** adds Dart, breaks TypeScript sharing, and its canvas web output is the wrong shape for public content.
- **Capacitor or a PWA** is the fastest route to a store listing and the weakest on the two things that matter here, animation quality and native feel, with a real rejection risk under guideline 4.2.

## What carries over from the existing Vercel and Supabase setup

Unchanged: Supabase Postgres and migrations via the pooler, Supabase Auth and the same users table, RLS, the supabase-js library (with a different session store on the phone), Next.js on Vercel for the site, Vercel Hobby cron for daily jobs, environment-variable discipline.

No longer applies on the phone: server components, route handlers, server actions, cookie auth, Vercel middleware for auth, next/image, ISR, Vercel's CDN caching, Vercel Analytics. The app uses token sessions in SecureStore and expo-image with CDN URLs.

One new discipline: any HTTP API the app calls becomes a versioned public contract. Shipped binaries cannot be redeployed like a website, so old app versions must keep working against the backend.

## Where Python could fit

The IGDB import and nightly delta script is the one place a Python job runner would be natural, since it is a standalone scheduled process with no shared types. The default is TypeScript so the catalog types stay shared with the app. Deciding this is low stakes and can wait until the mirror is built.

## Risks to manage

- RLS mistakes expose other users' data. Write policy tests from the first table.
- The 500 MB Free limit versus the catalog. A trimmed IGDB mirror of primary games lands around 300 to 500 MB. Trim fields, or accept Pro early.
- Edge Function limits (150 s wall clock, 2 s CPU) for heavy jobs. Keep heavy work in the Node runner.
- Nano compute on Free is slow for catalog search. Trigram indexes help; Pro's Micro instance is markedly better.
- Expo web is a good app shell but SEO for a large catalog is weak and SSR is still alpha. That is the trigger for adding a Next.js site later, not a reason to start with one.
- react-native-web is in maintenance mode. Acceptable for the logged-in loop, another reason the public pages may move to Next.js eventually.

## Re-check at kickoff

- Expo SDK 58 (expected around October 2026): Gesture Handler 3 adoption, Native Tabs and SSR status.
- NativeWind v5 stable versus Uniwind. Pick one, do not switch mid-project.
- react-native-sortables web support.
- Supabase's current Sign in with Apple flow on web and Android for Expo.
- Whether pg_cron activity counts as "user activity" for the Supabase Free pause. Docs do not say, so keep the daily ping.
- Steam call budget: polling 500 games every 15 minutes is 48,000 calls a day against a 100,000 limit. Poll the top few hundred at 15 minutes and the long tail hourly.
