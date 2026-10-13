# Hosted setup: the runbook for the hosted project

Written 2026-09-16. The steps that run by hand against the hosted Supabase project (`<project-ref>` in the commands below; the dashboard is `https://supabase.com/dashboard/project/<project-ref>`), Vercel, the domain and the app stores, in the order that unblocks the most. Nothing automated runs them, so this is the one document to follow top to bottom. Every command runs from the repository root with the project already linked. Tick a box when a step is done and record the date in the roadmap's log. Never paste a key, a secret, or the service role key into chat.

Where things stand at writing: every migration on `main` through `20260916230000_per_medium_backlog_and_rpcs` is applied (confirmed 2026-09-16 by anonymous calls to `popular_games` and `movie_details`). Nothing else on this page is done.

The order below is the order that unblocks the most. Sections 0 and 1 matter for the phone tomorrow; 2 and 3 for the Steam features; 4 for movies and TV; 5 is optional.

## 0. Tonight, for the phone (lead time)

The goal is a working prototype on a real iPhone, not the simulator. Two paths exist and both are worth starting tonight: the paid one has a wait, the free one works tomorrow morning.

- [ ] **Enrol in the Apple Developer Program** (not yet as of 2026-09-22; the free path below is done and nothing on the phone waits on this) at `https://developer.apple.com/programs/enroll/`, as an individual, with the Apple ID that is signed in on the phone. USD 99 a year. Approval usually takes a day or two, sometimes an hour. It is needed for TestFlight (90-day builds, no cable), Sign in with Apple (App Store guideline 4.8, required because Google is offered), and the store itself.
- [x] **Add the Apple ID to Xcode** (done 2026-09-22): Xcode, Settings, Accounts, the plus button, Apple Account, sign in. A free account is enough for the sideload below; Xcode lists it as a Personal Team.
- [x] **Prepare the phone** (done 2026-09-22): plug it into the Mac with a cable, unlock it, tap Trust when the phone asks. Then Settings, Privacy & Security, Developer Mode, turn it on (the phone restarts). If the Developer Mode row is not there yet, it appears after the first build attempt in step 0.4.
- [x] **With the phone plugged in and unlocked** (done 2026-09-22; see the re-sign note below for what the command actually needs) (Claude runs this, Rafa taps through the prompts):

  ```bash
  cd apps/mobile && LANG=en_US.UTF-8 npx expo run:ios --device --configuration Release
  ```

  Pick the phone from the device list. When Xcode asks for a team, choose the Personal Team. The first launch on the phone is blocked with "Untrusted Developer": Settings, General, VPN & Device Management, tap the Apple ID under Developer App, Trust.

What to expect from the free path: the app is signed for 7 days, then stops opening; re-running the same command with the phone plugged in fixes it in a few minutes. Release means the JavaScript bundle is inside the app, so it works with the laptop closed and talks to the hosted project (`apps/mobile/.env` already points there). For a day of iterating together, the same command without `--configuration Release` gives a Debug build that reloads from Metro over Wi-Fi. Once the Developer Program is approved, a TestFlight build replaces all of this.

**Re-signing after the seven days, and what happened on 2026-09-22.** The first `expo run:ios --device` writes the team into `ios/Verso.xcodeproj` and passes `-allowProvisioningUpdates` to xcodebuild; every later run sees the project as already configured and drops that flag, so it can neither create nor renew the provisioning profile. On 2026-09-22 the first run died because Developer Mode was still off (Xcode refuses the phone as a destination until it is on), and the second failed with "No profiles for 'com.rafasanchez.verso' were found". The fix, and the weekly re-sign from now on, is one xcodebuild call with the flag, then Expo for the install and launch:

```bash
cd apps/mobile/ios && LANG=en_US.UTF-8 xcodebuild -workspace Verso.xcworkspace -scheme Verso -configuration Release -destination id=<device-id> DEVELOPMENT_TEAM=<team-id> COCOAPODS_PARALLEL_CODE_SIGN=true COMPILER_INDEX_STORE_ENABLE=NO -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

```bash
cd apps/mobile && CI=1 LANG=en_US.UTF-8 npx expo run:ios --device <device-id> --configuration Release
```

`CI=1` keeps Expo from prompting; the id is the phone's identifier (Xcode, Window, Devices and Simulators) and the team is the Personal Team's id (Xcode, Settings, Accounts). Expo's launch fails on a fresh install until the developer is trusted on the phone (Settings, General, VPN & Device Management); Rafa taps Trust and then opens the app himself. Do not retry the launch in a loop while that is pending: every denied launch re-raises the Untrusted Developer alert on the phone.

## 1. Google login (about 15 minutes)

Observed from outside on 2026-09-22: Google is enabled in the hosted project's auth settings. The redirect URLs and the on-device verification at the end of this section are unconfirmed.

Unblocks: Continue with Google on a real account (yours and the three friends'), and the Google half of item 9 on the roadmap's list.

**Google Cloud Console** (`https://console.cloud.google.com`):

- [ ] Project: the project picker in the top bar, New project, name `Verso`, Create, then select it. Reusing an existing project of yours is fine too.
- [ ] Left menu, **Google Auth Platform** (the page that used to be called OAuth consent screen). If it says Get started: App name `Verso`, User support email yours, Audience **External**, Contact email yours, agree, Create.
- [ ] Google Auth Platform, **Audience**, Test users, Add users: your Gmail and the three friends' Gmails. While the app is in Testing status only test users can sign in. Publishing it later needs no verification, because Supabase asks only for the basic scopes (email, profile, openid).
- [ ] Google Auth Platform, **Clients**, Create client. Application type **Web application** (not iOS: the app uses the browser PKCE flow, so Supabase is the client, not the app). Name `Supabase Auth`. Under Authorized redirect URIs add exactly:

  ```text
  https://<project-ref>.supabase.co/auth/v1/callback
  ```

  Create. Copy the Client ID and the Client secret; the secret is shown once, so download the JSON if you want a copy on disk.

**Supabase dashboard**:

- [ ] Authentication, **Sign In / Providers** (older layout: Authentication, Providers), Google. Turn on Enable Sign in with Google, paste the Client ID and the Client Secret, Save. Leave Skip nonce checks off and Authorized Client IDs empty; both are for native Google sign-in, which the app does not use.
- [ ] Authentication, **URL Configuration**, Redirect URLs, Add URL, one at a time:

  ```text
  verso://auth/callback
  verso://auth/recovery
  ```

  Site URL can stay as it is. The first link carries Google's code and the sign-up confirmation, the second the password reset.

- [ ] Verify on the simulator or the phone: Continue with Google, pick the account, land signed in; Profile shows the Google name and avatar, because profiles are seeded from the provider. Then sign out, tap Forgot password, open the email on the same device, and it should land on the reset screen.

## 2. Steam link (about 10 minutes)

Unblocks: testing the Steam screens end to end on the phone (the privacy checklist, the link button, the library import). The screens themselves are Claude's and are being built without waiting for this.

- [ ] **Steam Web API key** at `https://steamcommunity.com/dev/apikey`, signed into your Steam account. Steam issues one only to a non-limited account (one that has bought something) with the Steam Guard Mobile Authenticator turned on. Domain Name is not enforced; `<project-ref>.supabase.co` is fine. Register, copy the key.
- [ ] Add it to `.env` as `STEAM_WEB_API_KEY=` (the name is already in `.env.example`). Only the local stack's copy of `steam-import` reads it from there.
- [ ] Set the two function secrets. The key lands in your shell history; on your own machine that is acceptable.

  ```bash
  supabase secrets set STEAM_WEB_API_KEY=<paste the key> STEAM_LINK_RETURN_URL=https://<project-ref>.supabase.co/functions/v1/steam-link
  ```

  `STEAM_LINK_RETURN_URL` is the OpenID realm Valve shows the user; the function refuses to start without it, so it can never be taken from a request's Host header.

- [ ] Deploy both functions. The `--no-verify-jwt` flag is required: Steam redirects a browser, which sends no Authorization header, and the function authenticates each route itself (the header of `supabase/functions/steam-link/index.ts` explains).

  ```bash
  supabase functions deploy steam-link --no-verify-jwt
  ```

  ```bash
  supabase functions deploy steam-import
  ```

- [ ] Verify, the way Valve's browser would, with no token at all:

  ```bash
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<project-ref>.supabase.co/functions/v1/steam-link
  ```

  Expected: `302 verso://steam/linked?status=error&reason=...` (a redirect to the app with an error, because there is no state). A `401` means the deploy ran without `--no-verify-jwt`.

- [ ] Your call, one line to Claude: add `verify_jwt = false` for `steam-link` to `supabase/config.toml`, so a future deploy without the flag cannot switch the gate back on and break Valve's callback. Claude's recommendation is yes.

## 3. Player counts (about 10 minutes)

Observed from outside on 2026-09-22: the function is deployed (it answers 401 without a token). The extensions, the Vault secrets, and the schedule cannot be seen from outside and are unconfirmed.

Unblocks: the "playing now" number on Steam game pages and the trend history it builds every 30 minutes.

- [ ] Deploy the function. JWT verification stays on here, the default: the schedule calls it with the service role key.

  ```bash
  supabase functions deploy steam-player-counts
  ```

- [ ] Enable the two extensions: Database, Extensions, search `pg_cron`, enable; same for `pg_net`. Or in the SQL editor:

  ```sql
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  ```

- [ ] Create the two Vault secrets with exactly these names. The service role key is under Project Settings, API Keys, the Legacy API keys tab, `service_role`, Reveal (the function's gate expects that JWT, not the newer `sb_secret_` keys). Either Project Settings, Vault, Add new secret, twice; or the SQL editor:

  ```sql
  select vault.create_secret(
    'https://<project-ref>.supabase.co/functions/v1/steam-player-counts',
    'steam_player_counts_url',
    'Edge Function the player-count poll calls'
  );
  select vault.create_secret(
    '<paste the service role key>',
    'steam_player_counts_service_role_key',
    'Bearer token the player-count poll sends'
  );
  ```

- [ ] Create the schedule. The migration only schedules when the extensions already exist, and they did not when it was pushed, so run its final block once by hand: SQL editor, paste the whole block below, Run. Expect the notice `scheduled steam-player-counts every 30 minutes`. It is the tail of `supabase/migrations/20260916084800_player_counts.sql`, unchanged; re-running it later is harmless because `cron.schedule` upserts by job name.

  ```sql
  do $migration$
  declare
    v_has_cron boolean := exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'cron' and p.proname = 'schedule'
    );
    v_has_net boolean := exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'net' and p.proname = 'http_post'
    );
    v_command constant text := $cron$
  do $job$
  declare
    v_url text;
    v_key text;
  begin
    if to_regclass('vault.decrypted_secrets') is null then
      return;
    end if;

    select s.decrypted_secret into v_url
    from vault.decrypted_secrets s
    where s.name = 'steam_player_counts_url';

    select s.decrypted_secret into v_key
    from vault.decrypted_secrets s
    where s.name = 'steam_player_counts_service_role_key';

    if v_url is null or v_key is null then
      return;
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('invoked_by', 'pg_cron'),
      timeout_milliseconds := 20000
    );
  end;
  $job$;
  $cron$;
  begin
    if not (v_has_cron and v_has_net) then
      raise notice
        'player_counts: pg_cron and/or pg_net are not installed, so the 30-minute Steam poll was not scheduled. See the header of this migration.';
      return;
    end if;

    execute 'select cron.schedule($1, $2, $3)'
      using 'steam-player-counts', '*/30 * * * *', v_command;

    raise notice 'player_counts: scheduled steam-player-counts every 30 minutes.';
  end;
  $migration$;
  ```

- [ ] Verify now:

  ```sql
  select jobname, schedule, active from cron.job;
  ```

  One row, `steam-player-counts`, `*/30 * * * *`, active. And after half an hour:

  ```sql
  select status, return_message, start_time from cron.job_run_details order by start_time desc limit 3;
  select count(*), max(observed_at) from public.player_counts;
  ```

  Rows appear only for games someone tracks that have a Steam id, so a small count is normal at first.

## 4. TMDB, the film and TV catalog (10 minutes, then a half-hour sync)

Unblocks: the whole movie and TV catalog on the hosted project. Until the token exists the nightly workflow runs, prints one line, and exits green.

- [ ] Follow steps 1 to 5 of [docs/design/tmdb-setup.md](../design/tmdb-setup.md): a free account, Settings, API, Request an API Key, type **Developer**, the form answers as written there. Copy the **API Read Access Token** (the long one), not the v3 key.
- [ ] Add it to `.env` as `TMDB_API_READ_ACCESS_TOKEN=`, then run the curl test in that document; `Fight Club 1999-10-15 139 min` and four appended keys means the token works.
- [ ] GitHub: the repository's Settings, Secrets and variables, Actions, New repository secret, name `TMDB_API_READ_ACCESS_TOKEN`, the same value.
- [ ] Smoke test in the cloud: Actions, **TMDB sync**, Run workflow, tick `dry-run`, set `max-ids` to `5`, Run. Green, with five mapped titles in the log and nothing written.
- [ ] The full import, from the laptop (about 37,600 requests, roughly half an hour; it reads `DATABASE_URL` from `.env`, which is already there):

  ```bash
  pnpm catalog:tmdb-sync:full
  ```

  A projection, not a measurement (VER-163, 2026-10-12): the first cloud run wrote about 100 films a minute because each title cost eight to ten database round trips, up to about 5,000 per 500-title batch; writes are now at most 12 round trips per batch, so the TMDB fetch at 20 a second sets the pace again and the whole pull should take roughly 35 minutes, well inside the workflow's two-hour timeout.

- [ ] Nothing more: the nightly run is scheduled at 14:00 UTC and takes over from here. It mirrors movies only (2026-10-12): TV is held until its ranking unit is decided, and the free tier's 500 MB would not hold the series. When TV is scheduled, drop the default in `tmdb-sync.yml` and raise its popularity threshold first.

## 5. Optional keys (5 minutes each, any time)

Both jobs skip cleanly and exit green without their key, so these are never urgent.

- [ ] **OpenCritic** (critic scores beside IGDB's): a RapidAPI account, subscribe to the OpenCritic API's free plan, copy the `X-RapidAPI-Key`, add it as the repository secret `OPENCRITIC_RAPIDAPI_KEY`. First run: Actions, **OpenCritic scores**, Run workflow, tick `dry-run`, `budget` `2`.
- [ ] **IsThereAnyDeal** (PC subscription availability): `https://isthereanydeal.com/dev/app/`, register an app, copy its API key, add it as the repository secret `ITAD_API_KEY`. First run: Actions, **Availability**, Run workflow, `only` `itad`, `itad-limit` `20`, tick `dry-run`.

## 6. After search smarter (#62) merges: push, then one full sync (5 minutes, then a few minutes)

The mirror on `main` writes IGDB's alternative names to a new `media_aliases` table, so the nightly catalog sync (09:00 UTC) fails until the migration is on the hosted project. Merge #62 only when you can do this right after:

- [x] `supabase db push` from the repo root, then `pnpm db:types` and commit the regenerated file if it changed. Pushed 2026-10-08.
- [x] One full sync to fill the aliases (the nightly run only touches recently updated games): Actions, **Catalog sync**, Run workflow with `since` set to `1970-01-01T00:00:00Z`; or from the laptop, `pnpm catalog:sync:full`. The initialisms ("GTA V", "BOTW") are written by the migration itself. Done 2026-10-08 from the laptop: 69,461 games, 56,683 alias rows.
- [ ] Verify signed in on the phone: "gta", "zelda", "botw".

## 6b. After the remakes change merges: one full sync (about 5 minutes of yours, then the run)

Added 2026-10-12. The mirror now keeps remakes (IGDB `game_type` 8) beside main games ([igdb-setup.md](../design/igdb-setup.md), "What the mirror keeps"). No migration, so nothing to push. The nightly delta only reaches games IGDB edited in the last 26 hours, so remakes IGDB has not touched lately arrive only with one full pull:

- [ ] Before the run, check the two titles from phone feedback entry 14 against IGDB with the search query in igdb-setup.md: the Ocarina of Time remake and Rayman Legends Retold. A `game_type` of 9 (remaster) or 10 (expanded game) means the change does not bring that title in; tell Claude before running.
- [ ] The full sync, from the laptop. The CLI does not read `.env` itself, so load it into the subshell:

  ```bash
  (set -a; source .env; set +a; pnpm catalog:sync:full)
  ```

  Or in the cloud: Actions, **Catalog sync**, Run workflow with `since` set to `1970-01-01T00:00:00Z`. The last run (section 6, 2026-10-08) kept 69,461 games; expect a somewhat higher count. Send Claude the `done:` line and the `database size:` line (the Free plan caps the database at 500 MB).
- [ ] Verify signed in on the phone: search "ocarina" and "rayman legends" and see the remake beside the original.

## 7. Suggest (about 5 minutes, after the recommendation foundations migration is pushed)

Unblocks: the personal suggestion, three picks from SQL's thirty with a reason each (`supabase/functions/suggest`), ready for the Suggest sheet once it is designed. The function calls `count_suggestion_requests` and `suggestion_candidates` and writes `suggestion_requests` and `prediction_log`, all created by `20260924120000_recommendation_foundations.sql` (the foundations PR). Deployed before that migration is on the hosted project, every request answers 500.

- [x] Confirm the foundations migration is pushed: `supabase db push` once its PR has merged, as in section 6.
- [x] **Anthropic API key**: the Anthropic Console (`https://console.anthropic.com`), Settings, API keys, Create key, name it `verso-suggest`. It is shown once. Paste it into this command and nowhere else: not chat, not `.env`, not a file in the repo. It lands in your shell history; on your own machine that is acceptable, as in section 2. Done 2026-10-08, as the key `verso-suggest` in a Console workspace named `verso` (the workspace's own spend-limit tab did not show, so the cap is the function's daily limit plus the plan's included credits).

  ```bash
  supabase secrets set ANTHROPIC_API_KEY=<paste the key>
  ```

  Worth doing while you are in the Console: Settings, Limits, a monthly spend limit (ten dollars is far more than the friends test can use).

- [x] Deploy. JWT verification stays on, the default: the app calls it with the user's session, and the function also refuses the anon key. Deployed 2026-10-08, on Claude Haiku 4.5 until #84 merges.

  ```bash
  supabase functions deploy suggest
  ```

- [ ] Optional, only to change a default. Both are function secrets like the key.

  ```bash
  supabase secrets set SUGGEST_MODEL=claude-haiku-5-5 SUGGEST_DAILY_LIMIT=20
  ```

  `SUGGEST_MODEL` defaults to Claude Haiku 5.5 (`claude-haiku-5-5`, since 2026-10-08). The function asks for adaptive thinking at effort low (`thinking: {type: "adaptive"}` and `output_config.effort: "low"`) and sends no temperature, top_p or top_k, so any current model that accepts adaptive thinking with an effort level works: Haiku 5.5, Sonnet 5.5, Sonnet 5, Opus 5.5, Opus 5 and Fable 5.1 among them. Claude Haiku 4.5, the default until 2026-10-08, does not: it rejects the effort setting, and every request would fall back to SQL's picks. `SUGGEST_DAILY_LIMIT` is requests per user per rolling 24 hours, default 20; `0` turns suggestions off without a deploy.

- [ ] Smoke test with a real session. The token is a signed-in user's access token; the password grant gets one for an account with a password (a Google-only account can set one through Forgot password first). `read -s` keeps the password out of your shell history, and `jq` is `brew install jq`.

  ```bash
  export SUPABASE_ANON_KEY=$(grep '^SUPABASE_ANON_KEY=' .env | cut -d= -f2-)
  read -s 'PW?Password: '; echo
  TOKEN=$(curl -s 'https://<project-ref>.supabase.co/auth/v1/token?grant_type=password' \
    -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"<your email>\",\"password\":\"$PW\"}" | jq -r .access_token); unset PW
  ```

  ```bash
  curl -s -X POST https://<project-ref>.supabase.co/functions/v1/suggest \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"medium":"game"}' | jq '{model, fallback, picks: [.picks[] | {title, reason, because}]}'
  ```

  Expected: `"model": "claude-haiku-5-5"`, `"fallback": false`, and three picks whose reasons cite games from your own Loved and Liked. `"fallback": true` means the model call failed and the picks are SQL's top three with a template reason; the function's logs (Dashboard, Edge Functions, suggest, Logs) say why in one line starting `suggest: fell back to SQL`; `(refusal)` there means Haiku 5.5's safety classifiers declined the request, which nothing retries on another model. A `401` is a missing or expired token; a `500` is usually the migration not pushed or the key not set. Then, in the SQL editor, the meter's row:

  ```sql
  select model, input_tokens, output_tokens, candidate_count, created_at
  from public.suggestion_requests order by created_at desc limit 3;
  ```

What it costs: Claude Haiku 5.5 is $0.10 per million input tokens and $0.50 per million output tokens (platform.claude.com, the Haiku 5.5 overview and migration guide, checked 2026-10-08; those prices hold for prompts up to 100,000 tokens, and this one is about 3,250). Haiku 5.5's tokenizer counts the same text as about 30% more tokens than Haiku 4.5's, so the 2,500 tokens in and 200 out estimated on Haiku 4.5 become about 3,250 in and 260 out. Thinking is billed as output, and at effort low it is not measured yet, so allow 500 tokens for it. That is 3,250 × $0.10 / 1M = $0.000325 in, plus (260 + 500) × $0.50 / 1M = $0.00038 out: about $0.0007 a request, a fifth of the $0.0035 it cost on Haiku 4.5. A request that uses the whole 4,000-token output ceiling costs about $0.0023, still under the old average. At the default limit of 20 a day, the heaviest user costs about one and a half cents a day, and at most about five. The `output_tokens` column in the query above includes the thinking, so the first real rows replace the 500-token guess.

## 8. TestFlight for the friends (one-time, about 30 minutes, after the Apple Developer Program is approved)

Unblocks: M1. Set up 2026-10-06: the app is linked to EAS as `@rasf120/verso` (the project id is in `apps/mobile/app.json`), and `apps/mobile/eas.json` has three profiles: `development` (the dev client for a phone, no store), `preview` (the TestFlight build the friends get, build number auto-incremented) and `production` (the App Store build). Cloud builds read `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from EAS environment variables, set 2026-10-06 for all three environments, so no `.env` is uploaded. The runtime version is a fingerprint of the native project (see the last step for what that buys).

- [x] Agreements (done 2026-10-06): developer.apple.com, Agreements, the current Apple Developer Program License Agreement. A build fails with an agreement error until the Account Holder accepts it.
- [ ] The first build is interactive, because it creates the signing certificate and the provisioning profile on your Apple account; EAS keeps both, and later builds run without prompts. Sign in with the Apple ID you enrolled with and the two-factor code, and let EAS generate the certificate and the profile. About 20 minutes in the queue.

  ```bash
  cd apps/mobile && eas build --platform ios --profile preview
  ```

- [ ] Submit it to TestFlight. If there is no Verso record in App Store Connect yet, say yes when it offers to create one: bundle id `com.rafasanchez.verso`, name Verso; the SKU is never shown and the company name is editable until the first store submission. Apple processes the build in about 10 to 20 minutes and the CLI prints the link.

  ```bash
  cd apps/mobile && eas submit --platform ios --profile preview --latest
  ```

- [ ] You on TestFlight: install the TestFlight app, accept the invitation App Store Connect emails your Apple ID (the Account Holder is an internal tester), install Verso. The export-compliance question does not come up: `usesNonExemptEncryption` is `false` in `app.json`, since the app only uses HTTPS.
- [ ] The friends, in App Store Connect: Users and Access, the plus button, each friend's name and the email of their Apple ID, role Customer Support, access limited to Verso. Then Verso's TestFlight tab, Internal Testing, the plus button, a group named Friends, add them, and turn on "Enable automatic distribution" so every new build reaches them with no step. Each friend gets an email, installs TestFlight, installs Verso. Internal groups never go through Beta App Review.
- [ ] Every later native build is one command with no prompts, and auto-distribution does the rest:

  ```bash
  cd apps/mobile && eas build --platform ios --profile preview --auto-submit
  ```

- [ ] A JavaScript-only change (screens, copy, logic, anything that adds no native library) ships without a build or a review:

  ```bash
  cd apps/mobile && eas update --channel preview --environment preview --message "what changed"
  ```

  Phones pick it up on the next cold launch, sometimes the one after (the first launch downloads, the second runs it). Because the runtime version is a fingerprint of the native project, a change that does need a build (a new native library, an Expo SDK bump) changes the fingerprint on its own, and an update built on it never reaches the older binaries; nothing is bumped by hand, and nothing can brick an installed build.
- [ ] For the December beta, later: the same TestFlight tab, External Testing, a group with a public link. The first build of each version string goes through Beta App Review, usually under 48 hours; later builds of the same version skip it, so the version stays `0.1.0` through the beta and only the build number moves.

What it costs: nothing beyond the Apple membership for the friends test. The Expo free plan's monthly allowances (about 30 cloud builds and 1,000 monthly users on updates, per expo.dev/pricing) are well above what a ten-person test and a hundred-person beta use; one iOS build takes about 15 to 20 minutes on the default worker.

## 9. The web app on Vercel (one time, about 20 minutes; after the W0 spike of 2026-10-07)

The web build is the same Expo app exported for the browser ([docs/design/web-brief.md](../design/web-brief.md)). Since #68 every pull request's CI exports the web build with placeholder values and reports the bundle size, so a failed Vercel build is caught before the merge; the head tags come from `apps/mobile/public/index.html`, generated by `pnpm mobile web:html` from a template and the tokens. `apps/mobile/app.json` sets `web.output` to `single`, and `vercel.json` at the repository root carries the install command, the build command (`pnpm --filter mobile exec expo export --platform web`), the output directory (`apps/mobile/dist`) and the one rewrite that sends every path to `index.html`. Nothing here is a secret: the two variables are the public URL and the anon key, which the phone app already bundles.

- [ ] **Create the Vercel project.** At `https://vercel.com/new`, import the GitHub repository, leave the framework preset as Other, and keep the root directory as the repository root so `vercel.json` is read. Production branch `main`; every pull request gets a preview URL.
- [ ] **Add the two environment variables** in the project's Settings, Environment Variables, for Production and Preview: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, the same values as `apps/mobile/.env` (the hosted project's URL and anon key). The export inlines them at build time, so a change needs a redeploy.
- [ ] **Deploy once** and open the `*.vercel.app` URL. The sign-in screen should load; signing in by email should work against the hosted project.
- [ ] **Add the web origin to Supabase Auth.** Dashboard, Authentication, URL Configuration: set the Site URL to the production origin (`https://<domain>` once it exists, the `*.vercel.app` URL until then) and add two redirect URLs, `https://<origin>/auth/callback` and `https://<origin>/auth/recovery`, beside the two `verso://` entries. Preview deployments need their own entries or a wildcard (`https://*-rasf120.vercel.app/auth/callback`), otherwise Google and the reset link fall back to the Site URL. Tell Claude when this is done; `supabase/config.toml` gets the same entries for the local stack.
- [ ] **The domain.** Buy it (question 1 of the brief; `verso.gg` was free on 2026-10-07), add it under the Vercel project's Domains, and point the registrar's nameservers or CNAME where Vercel says. Then update the Site URL above to the domain. A later rename is a redirect from this domain to the next.

What to expect: the first build takes a few minutes (pnpm install plus the export); later builds are faster. The Hobby plan is free for non-commercial use, which holds until the paid tier; Vercel Pro is 20 USD a month after that ([tech-stack.md](../design/tech-stack.md)).

## 9b. After the bulk-entry build (about 15 minutes, then the TestFlight build of section 8)

Unblocks: the friends' build with onboarding. Everything merged on 2026-10-07 and 2026-10-08 that the hosted project does not have yet: four migrations and two functions. Order matters: the migrations first, then the functions that call them.

- [ ] Push the migrations in one go: `20260923100000_played_platforms.sql` (#59), `20260924120000_recommendation_foundations.sql` (#64), `20261007100000_drop_ownership.sql` (#70), `20261007120000_onboarding_backend.sql` (#73). The onboarding migration backfills `profiles.media` for every account that already has entries or rankings, so your own account skips the questionnaire.

  ```bash
  supabase db push
  ```

- [ ] Regenerate the types against the hosted project and check nothing changed (it should match what the local stack produced):

  ```bash
  pnpm db:types && git diff --stat packages/api/src/database.types.ts
  ```

- [ ] Redeploy the Steam import, which now calls `apply_steam_played_platforms`, and deploy `suggest` (section 7 has the key and the smoke test):

  ```bash
  supabase functions deploy steam-import && supabase functions deploy suggest
  ```

- [ ] pg_cron: if it is enabled on the project, re-run the scheduling block at the end of `20260924120000_recommendation_foundations.sql` in the SQL editor so the nightly prior refresh is scheduled; the migration printed a notice if it could not.
- [ ] Then section 8: the first TestFlight build from `main`. On your phone, the first signed-in run goes straight to Home (your profile's media was backfilled); to see the questionnaire, create a second account, or open Ranking's "Rank popular games" door for the deck and the session on your own account.
- [ ] Search smarter (#62) merges when you can push right after it, as section 6 says; its branch is kept up to date with `main` so the merge is one word.

## 10. The domain and its holding page (done 2026-10-08)

Unblocks: a real URL for sharing (decision 30). The page is `apps/holding/index.html` on `main`: the name and "Coming soon", nothing loaded from anywhere else, kept out of search engines; `apps/holding/vercel.json` redirects `www` to the bare domain.

- [x] **The domain**, bought by Rafa at Porkbun on 2026-10-08 (about 11 USD a year).
- [x] **The Vercel project** `rankverso` on Rafa's Hobby account, created and deployed by Claude through the Vercel CLI already signed in on the laptop (no Git connection: the page changes rarely). Live at `https://rankverso.vercel.app`. `rankverso.com` and `www.rankverso.com` are added to the project.
- [x] **Point the domain at it, at Porkbun** (Rafa, 2026-10-08; Porkbun's `ALIAS` and wildcard `CNAME` parking records deleted, the MX, SPF and `_acme-challenge` records kept): porkbun.com, Account, Domain Management, `rankverso.com`, the DNS records link. Delete Porkbun's default parking records (the `ALIAS` or `A` records on the bare domain, and the `CNAME` records for `www` and `*` that point at a `porkbun.com` host). Add two records, TTL left at the default:

  | Type | Host | Answer |
  |---|---|---|
  | A | (blank) | `76.76.21.21` |
  | A | `www` | `76.76.21.21` |

  Vercel checks on its own and issues the HTTPS certificate within minutes of the records resolving; Rafa gets an email when it is done.
- [x] Checked from outside 2026-10-08: both names resolve to `76.76.21.21` at Porkbun's nameservers, Cloudflare and Google; `vercel certs issue` produced the certificate at once; `https://rankverso.com` answers 200 with the page and `https://www.rankverso.com` answers 308 to it.

To change the page later: edit `apps/holding/index.html`, then from `apps/holding` run `vercel deploy --prod` (the folder is linked to the project; the link lives in the ignored `.vercel` folder). Superseded 2026-10-08 by section 11: this project now builds the site from `apps/site`, so the holding page is no longer served and this folder no longer deploys to it.

## 11. rankverso.com serves the site (done 2026-10-08)

Unblocks: the site at `rankverso.com` (decision 30).

**What was done, and why it differs from the plan first written here.** The plan was a second, Git-connected project, `rankverso-site`, with the bare domain moved to it and the holding project kept as the rollback. Rafa chose one project instead (2026-10-08: the holding page was always a stand-in for this site), so the existing project `rankverso` was connected to the repository and pointed at the site. No domain moved and no DNS record changed.

- [x] **Git connection** (Rafa, in the dashboard): project `rankverso`, Settings, Git, connected to `rafael-sanchezf/verso-private` (Vercel follows the repository by id, so it survived the rename), production branch `main`.
- [x] **Root Directory** `apps/site`, Framework Preset Other (Rafa). Install, build and output come from `apps/site/vercel.json`: `pnpm install --frozen-lockfile --filter @verso/site...`, `pnpm run build`, `out`, `trailingSlash`, and the `www` redirect.
- [x] **`ENABLE_EXPERIMENTAL_COREPACK=1`** for Production and Preview (Rafa), so Vercel uses the root `package.json`'s pnpm, as CI does. Preview matters: without it a pull request's preview build cannot read the lockfile.
- [x] **The first deploy** was the merge of #85; production served it about 30 seconds later. Checked from outside the same day: `/` answers 200 with the site, `/login/` 200, `/terms/` 404, the art and the shots 200, and `www.rankverso.com` 308 to the bare domain. #87 deployed the same way.

**How it runs now.** Every push to `main` builds and deploys `rankverso.com`, including pushes that touch nothing in the site (the build is about 35 seconds). Every pull request gets a preview link, private to the Vercel account. The public mirror (`docs/process/public-mirror.md`) deploys nothing.

**The blockers, as they were settled:**

- [x] **The address.** `hello@rankverso.com` forwards at Porkbun (decision 32); Rafa confirmed it works.
- [x] **Log in.** The site's own `/login/` page (#85): an email field that always answers that the address has no registered account and that Verso is invite-only during the beta. It sends nothing anywhere, and CI fails if the page ever gains a form action, a password field or a named input.
- [x] **Privacy and Terms.** `/privacy/` is a short notice for the website alone, signed off by Rafa (#85); Terms is removed until the app's terms come with the beta. The drafts for the app stay in `docs/legal/`.

### Still open: the go-live commit (Claude writes it when Rafa says go)

The site is live but still `noindex`, so search engines leave it out. One small PR makes it indexable:

- [ ] `apps/site/src/app/layout.tsx`: `robots: { index: false, follow: false }` to `{ index: true, follow: true }`, and its comment. It is the only place `noindex` comes from.
- [ ] Optional: `apps/site/src/app/robots.ts` and `sitemap.ts` (static) for `/robots.txt` and `/sitemap.xml`.

Check after the merge: `curl -s https://rankverso.com | grep -c noindex` prints `0`.

### Rolling back

- A bad commit: Instant Rollback on the production deployment's menu in project `rankverso` returns to the deployment before it (Hobby reaches only that one); merges then stay off production until Undo Rollback. Or revert the commit on `main`, which deploys like any other.
- Back to the holding page: there is no one-step path any more. It would take setting the Root Directory back to `apps/holding` and redeploying, or a second project for the site as first planned here.

## 12. The funnel report (about 5 minutes, after VER-21 merges)

Unblocks: reading the onboarding funnel (signed up, first session, ten ranked, first pick, day-7 return), overall and by week of sign-up. `20261012120000_funnel_report.sql` adds `funnel_report` and `funnel_report_by_cohort`, which only the service role and the database owner may call; `pnpm funnel` connects as the owner with the database connection string and only reads. [specs/onboarding.md](../design/specs/onboarding.md), "Events", says what each number means.

- [ ] Push the migration, then check the types match what the PR committed from the local stack (the diff should be empty):

  ```bash
  supabase db push
  pnpm db:types && git diff --stat packages/api/src/database.types.ts
  ```

- [ ] Run the report. The connection string: the dashboard, the **Connect** button at the top of the project, **Session pooler**, the URI (`postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@<pooler-host>:5432/postgres`); the password is the database password (Project Settings, Database, reset it if it is lost). `read -s` keeps it out of your shell history; it is never put in `.env` or any file in the repo.

  ```bash
  read -s 'DATABASE_URL?Connection string: '; echo; export DATABASE_URL
  pnpm funnel --since 2026-10-13
  unset DATABASE_URL
  ```

  `--since` is the first day of sign-ups to count (a UTC midnight); use the day the friends' build went out, so your own and the test accounts stay out. `--until` (exclusive) closes the window, for example `--since 2026-12-01 --until 2027-01-01` for the December cohort alone. Without either flag every account is counted. It prints two tables: the steps with their share of sign-ups, and one row per week of sign-up. The newest week's day-7 count reads low until that week is seven days old. The same numbers in the SQL editor: `select * from public.funnel_report('2026-10-13');` and `select * from public.funnel_report_by_cohort('2026-10-13');`.

## Reporting back

One message listing the boxes ticked is enough; Claude records the dates in the roadmap and runs its own checks from the outside (the Steam link redirect, the RPCs, the workflow logs). If a step fails, paste the error text with any key blanked out.
