# IGDB access through a Twitch developer application

Written 2026-09-08. IGDB's API is operated by Twitch, so access means registering a Twitch application and using its credentials in a server-to-server token flow. No user ever logs in with Twitch, so the app name and redirect URL are internal placeholders.

## What the two fields mean for us

- **Name.** Must be unique across all Twitch applications, and that is its only constraint. Nobody outside the Twitch developer console ever sees it, because the client credentials flow has no login screen. Use a working name such as `gaming-beli-dev` and rename later if you like. Keep it unrelated to Twitch's own branding.
- **OAuth Redirect URLs.** Not used by IGDB at all. IGDB's own docs say to enter `http://localhost` and move on. The redirect URL only matters for flows where a Twitch user signs in, which this app never does.

## Steps

1. Sign in at the Twitch developer console at `dev.twitch.tv/console` with a Twitch account. Create a free one if needed and verify the email.
2. Turn on two-factor authentication on the Twitch account under Security and Privacy. The console will not let you register an application without it. Refresh the console after enabling.
3. Open the Applications tab and click Register Your Application.
4. Fill the form:
   - Name: `gaming-beli-dev` (or any unique placeholder). This is the name registered on 2026-09-08 and it does not need to change with the app name.
   - OAuth Redirect URLs: `http://localhost`, then click Add.
   - Category: Application Integration.
   - Client Type: Confidential. This is required to generate a client secret.
   - Tick the "I'm not a robot" box and click Create.
5. Back on the Applications tab, find the app under Developer Applications and click Manage.
6. Copy the Client ID. It is public and safe to commit or embed.
7. Click New Secret and copy the Client Secret immediately. It is shown once. Generating another secret invalidates the previous one.
8. Store the secret somewhere private: a password manager entry, or later the backend's `.env` file. It must never go into the mobile app, a git commit, or a chat message.

## Our application

- Twitch application registered 2026-09-08.
- Client ID: `98er90pd7uqiexzqgvf3paunyown3f` (public, safe to commit).
- Client Secret: held only by the developer, never in this repo. The first secret was pasted into a chat on 2026-09-08 and should be treated as exposed; generate a new one with New Secret before it is used anywhere.

## Test the credentials from your own terminal

Set the two values in the shell for the current session only, then request a token:

```bash
export TWITCH_CLIENT_ID="paste-client-id"
export TWITCH_CLIENT_SECRET="paste-client-secret"
```

```bash
curl -s -X POST 'https://id.twitch.tv/oauth2/token' -d "client_id=$TWITCH_CLIENT_ID&client_secret=$TWITCH_CLIENT_SECRET&grant_type=client_credentials"
```

A working pair returns JSON with an `access_token`, an `expires_in` of roughly 5 million seconds (about 58 days), and `token_type` `bearer`. Then query IGDB with the token:

```bash
curl -s -X POST 'https://api.igdb.com/v4/games' -H "Client-ID: $TWITCH_CLIENT_ID" -H "Authorization: Bearer $(curl -s -X POST 'https://id.twitch.tv/oauth2/token' -d "client_id=$TWITCH_CLIENT_ID&client_secret=$TWITCH_CLIENT_SECRET&grant_type=client_credentials" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')" -d 'search "Hades"; fields name, first_release_date, cover.image_id; limit 3;'
```

Three games named Hades or similar coming back means the whole chain works.

## How the backend will use this

- The backend requests a token with the client credentials flow, caches it, and refreshes before the roughly 58-day expiry. IGDB requests carry the Client ID header and the bearer token.
- Rate limit is 4 requests per second with up to 8 in flight. The nightly catalog job stays well under it.
- The Client Secret lives only on the server side: a GitHub Actions secret for the import script and a Supabase secret for any Edge Function that talks to IGDB. The Expo app never talks to IGDB directly.

## What the mirror keeps

2026-10-12. The mirror keeps IGDB main games (`game_type` 0) and remakes (`game_type` 8), and nothing else; the rule is `KEPT_GAME_TYPES` in `packages/catalog/src/trim.ts`, applied once in the IGDB `where` clause (`game_type = (0,8)`) and again to every row that comes back. Until this date it kept main games only, which also dropped every remake, so the Ocarina of Time remake and Rayman Legends Retold could not be added and only the originals showed up (`docs/private/phone-feedback.md`, entry 14).

The rule for what counts as one game, inferred from Rafa's words and his to confirm: the platform never matters, so a port (11) is the same game and stays out, and the original Ocarina on N64, Virtual Console or Switch Online is one entry; a remake is a different game, so it gets its own row with its own year and release date. DLC (1), expansions (2), bundles (3), standalone expansions (4), mods (5), episodes (6), seasons (7), forks (12), packs (13) and updates (14) stay out, as before. A remake meets the same cover and rating-or-recency test as a main game, so an unreleased remake shows up once IGDB has a cover for it. Search aliases need nothing new: IGDB's alternative names are mapped the same way whatever the `game_type`.

A remake is not linked to its original in the app. The mirror now carries IGDB's `parent_game` and `version_parent` ids in `media_items.metadata` (two plain ids on the same request, no extra call), for a later "the original" link or the edition folding in idea 7 of `docs/feature-ideas.md`; nothing reads them yet. Which of the two IGDB fills for a remake is not confirmed; the original lists its remakes in its own `remakes` field, which the mirror does not read.

Open question: remasters (9) and expanded games (10) sit between a port and a remake, and are left out for now. Nothing in this repository's docs or fixtures says which `game_type` IGDB gives Rayman Legends Retold. If IGDB files it as a remaster or an expanded game, the change above does not bring it in, so check it against IGDB before the hosted full sync (`search "Rayman Legends Retold"; fields name, game_type, parent_game, version_parent, first_release_date, cover;` with the curl above) and decide whether 9 or 10 joins the kept list. Run the same check on the Ocarina of Time remake: it needs `game_type` 8 and a cover to be kept.

The nightly delta uses the same rule, but it only asks for games IGDB updated in the last 26 hours, so it brings in a remake only when IGDB adds or edits it. Remakes already in IGDB and untouched since need one full sync after the change (runbook section 6b, `docs/process/hosted-setup.md`).

## Terms to keep in mind

- IGDB is free for non-commercial use under the Twitch Developer Service Agreement. For a commercial release, IGDB offers a partnership; contact partner@igdb.com when that becomes relevant.
- Show a visible "Data provided by IGDB.com" credit in the app.
- Caching and mirroring the data is allowed and encouraged.
