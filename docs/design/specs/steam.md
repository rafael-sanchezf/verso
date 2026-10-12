# Steam link

Not drawn: coded from conventions without a Figma pass (decision 16), as PR 5 of [../bulk-entry-build.md](../../private/design/bulk-entry-build.md). Routes `app/settings/steam/index.tsx` (`/settings/steam`), `app/settings/steam/privacy.tsx`, `app/settings/steam/candidates.tsx`, and `app/steam/linked.tsx` (the link's return); components in `apps/mobile/src/screens/steam/`. Written 2026-10-07 from what was built. Read [README.md](README.md) first; the backend is `packages/api/src/steam.ts` (its header is the flow), the `steam-link` and `steam-import` Edge Functions, and section 2 of [../../process/hosted-setup.md](../../process/hosted-setup.md).

## Settings row

- Settings gains a section "Linked accounts" between Account and Data with one row, "Steam" with a chevron → push `/settings/steam`. Its own section because a link is an account, not a file; it stays one row because the platforms that cannot be linked are never mentioned (onboarding-guidelines.md, principle 9).

## Steam screen (`/settings/steam`)

- Native stack header "Steam", back to Settings (registered in `app/_layout.tsx` inside the session gate). Content: Settings' own layout, `ScrollView` with padding 16 and gap 24, bottom safe area.
- Loading: two `Skeleton` blocks at a section's height (132, radius 12). Error: `ErrorLine` "Couldn't load your Steam link." with Retry.
- **Not linked** (`getSteamLink` returns null):
  - "We read your games and hours played. Steam needs Game details set to Public; we show you how." 17 `text/primary`; under it (gap 12) "We never read friends, messages or purchases. Unlink any time here." 15 `text/secondary`.
  - `LinkSteamButton`: the primary regular Button "Link Steam". Nothing is pre-selected because there is nothing to select, and nothing is imported until the user asks on the linked state.
- **Linked**: two `SettingsSection`s from the profile folder, then a line and the attribution.
  - "Steam account": Steam ID (value: the SteamID64); "Open profile on Steam" (chevron → the public profile in the browser, so the user can see which account it is); "Unlink" in destructive red → the native confirm "Unlink Steam?" / "Verso stops reading your Steam account and deletes the copy of your library it stored. Hours already imported stay on your games." with Cancel and a destructive Unlink.
  - "Library": Last import (value: `Never`, `In progress`, the relative date, or the date with `· Private profile` or `· Failed`, from `lastSyncedAt` and `syncStatus`); "Import library" (chevron; a spinner while it runs); "Games to add from Steam" (chevron → candidates), shown once an import has started at least once.
  - Under Library, 13 `text/secondary`: "Reads your Steam games and hours played. Nothing is added to your lists until you add it."
  - An import answer that stays here is one `ErrorLine` with Retry under that line.
  - `SteamAttribution` at the foot.
- Deviations from bulk-entry-build.md, each listed in the PR: the persona name is not shown (nothing stores or reads one; the SteamID64 and the profile link stand in), and "when it was linked" is not shown (`platform_links` has no such column; adding one is a migration). "Last import" is the date the table keeps.

## The link flow

- `useSteamLink()` (`use-steam-link.ts`; the phases are `link-flow.ts`): `startSteamLink` for Valve's URL → `WebBrowser.openAuthSessionAsync(url, 'verso://steam/linked')` → on any return, one read of `getSteamLink` into `['steam', 'link']`. The database decides: a link that exists is a link that worked, whatever the browser said, because Android's browser can settle as a plain dismiss before the deep link arrives.
- The return arrives by three roads, all parsed by `parseLinkReturn` (`link-return.ts`): the auth session's result; the hook's own `Linking` listener; and on a cold start the route `app/steam/linked.tsx`, which redirects to `/settings/steam` with `status` and `reason`, which the screen hands to the button as `initialReturn`. `+native-intent.tsx` keeps a warm return off the router (`keepsRouterStill`) so a second Steam screen is never pushed over the first; a cold one goes through to the route.
- The button's label says what it waits for: "Opening Steam…", "Waiting for Steam…", "Checking the link…", with a spinner; taps are ignored until the trip ends.
- Failures, one `ErrorLine` under the button with no Retry (the button is the retry): `cancelled` and a closed browser say nothing; `already_linked_elsewhere` → "That Steam account is linked to another Verso account. Unlink it there first, then try again."; `state_not_valid` and `missing_state` → "That link attempt expired. Tap Link Steam to start a new one."; `not_configured` or a 503 from the start → "Linking Steam isn't set up on our server yet."; everything else → "Steam didn't confirm the link. Please try again."
- Web: the function redirects to the app's scheme and the web's redirect is wave W2 (web-brief.md), so the button is replaced by the line "Linking Steam works in the phone app for now."

## Import

- `useSteamImport(asker, onMove)` (`use-steam-import.ts`; the branching is `importStep` in `import-outcome.ts`): `imported` → push candidates (`hidden=1` when `playtimeHidden`); `private_profile` → push the checklist; `rate_limited` → "Imports are ten minutes apart. Try again in about N minutes."; `not_linked` → "Steam isn't linked to this account any more."; a throw → 503 "Importing from Steam isn't set up on our server yet.", 502 "Steam isn't answering. Try again in a few minutes.", else "Couldn't import from Steam. Check your connection and try again." The server's words are never shown.
- Every answer runs `invalidateSteam` (the `['steam']` prefix, since the function moves `lastSyncedAt` and `syncStatus` whatever happens); an import with `entriesUpdated` above zero also runs `invalidateAllEntries`, since imported hours land on entries.

## Privacy checklist (`/settings/steam/privacy`)

- Header "Steam privacy". Title 22 bold "Steam didn't share your games"; 15 `text/secondary` "Steam only shares a library whose Game details are Public. Change three settings on Steam, then try again."
- A `bg/surface` card, radius 12, three steps with hairline separators, each a 24pt `medium/games` disc with its number (13 semibold `bg/canvas`, hidden from VoiceOver) and 15 `text/primary` words read as "Step N. …":
  1. "On Steam, open your Profile, then Edit Profile, then Privacy Settings." and the link "Open Privacy Settings on Steam" (15 semibold `text/primary`, as the app's text buttons read; the medium green is short of 4.5:1 for 15pt text on `bg/surface`) → `https://steamcommunity.com/my/edit/settings`.
  2. "Set Game details to Public. My profile has to be Public too, or Steam won't allow it."
  3. "Untick “Always keep my total playtime private”, so your hours come with your games."
- Two real buttons, gap 12: primary "Try again" (runs the import; "Trying again…" with a spinner while it runs) and secondary "Not now" (back). An answer that stays is one `ErrorLine` under them, no Retry: a second `private_profile` → "Steam still isn't sharing your games. Check the three settings above, then try again."; a rate limit as above. A success replaces the checklist with the candidates.
- Known: the import that led here already spent the ten-minute slot (`begin_steam_import` stamps it at the start), so the first "Try again" usually answers with the rate-limit line. Changing that is a migration.

## Candidates (`/settings/steam/candidates`)

- Header "From Steam". `steamCandidates(client, 200)` under `['steam', 'candidates']`, in the API's order (least played first, then title), in a `FlatList` with side padding 16.
- Header text 15 `text/secondary`: "{N} games in your Steam library that aren't in your lists yet, least played first. Tap + to add one." ("The first 200 games…" at the cap). With `hidden=1`, a second line, "Steam reported no hours for any game. If “Always keep my total playtime private” is ticked on Steam, untick it and import again.", and the privacy-settings link.
- Rows: Search's `GameRow`: `Cover` 44, the catalog title, subtitle "14 h on Steam · 2017" (`No hours on Steam` for a zero, never "not played", since hidden playtime reads as zero too; the year dropped when unknown), the plus pill → `/add/[id]`; the row → `/game/[id]` with `from: 'Steam'`. A game added from here turns its plus into a check through `['tracked', ids]`, which `invalidateEntry` already clears; the row stays until the next visit's fresh read.
- Footer, 20 above: the contrast Button "Done" (back), then `SteamAttribution`.
- Loading: eight `GameRowSkeleton`s. Error: `ErrorLine` "Couldn't load your Steam games." with Retry. Empty: a bare centered `EmptyState` (bottom padding 120): `check`, "Nothing to add", "Every game from your Steam library that we could match is already in your lists.", action "Done".

## Attribution

- `SteamAttribution`, at the foot of the linked state and the candidates: "Powered by Steam" 13 medium `text/secondary` as a link to the Steam store, and "Steam and the Steam logo are trademarks of Valve Corporation." 12 `text/secondary` (research 4.1 and the compliance checklist in section 10). Valve's logo is not drawn yet: the repo has no Steam mark; when the asset is added it sits beside the first line.

## Shared pieces

- Exported from `apps/mobile/src/screens/steam/index.ts` for the onboarding's Link Steam screen (PR 4, [onboarding.md](onboarding.md)): `LinkSteamButton` (`onLinked`, `initialReturn`, `label`), `useSteamLink`, `useSteamAccount`, `useUnlinkSteam`, `useSteamImport(asker, onMove)`, `SteamAttribution`, and the two screens the onboarding pushes after a link, with their exits open: `SteamPrivacyScreen` (`onImported(playtimeHidden)`, `onNotNow`) and `SteamCandidatesScreen` (`onDone`). Without the props they behave as Settings needs (back, or `/settings/steam`).
- Query keys `['steam', 'link']` and `['steam', 'candidates']` in `src/lib/query-keys.ts`; `invalidateSteam(queryClient, { entriesChanged })` in `src/lib/invalidate.ts`.
- Text links that leave for Steam are `LinkText` (role link, slop computed to a 44pt target). Every other control is a shell primitive.
- Unit tests, no React: `test/steam-link-return.test.ts`, `test/steam-link-flow.test.ts`, `test/steam-import-outcome.test.ts`.
