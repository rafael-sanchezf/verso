# Profile

Frame `F · Profile` (26:809). Routes `app/(tabs)/profile.tsx` and `app/settings.tsx`. Owner: Profile agent. Read [README.md](README.md) first.

## Layout

- `ScreenHeader` "Profile" (bottom padding 8), right slot the `settings` icon 24 → push `/settings`.
- Content column, top padding 8, side padding 16, gap 20.
  - Identity row gap 14: an avatar, a 64pt circle in `bg/placeholder` (no avatar source in V0; open item in ui-brief.md); text column gap 2: name 22 bold, a line 15 `text/secondary`.
  - Stats row: four tiles flex 1 (the frame has no gap; do gap 8), `bg/surface`, radius 12, vertical padding 10, centered, gap 2: value 20 bold, label 12 `text/secondary`: Ranked, Backlog, Upcoming, Friends (value "—", social later).
  - The contrast Button "Share my top 10" (17 semibold, vertical padding 12).
  - Recent: "Recent" 20 bold; rows with vertical padding 10, gap 12: `Cover` 32 (radius 4), text 15 `text/primary` flex "Ranked {title} · #{global rank} · {score}", trailing a relative time 13 `text/secondary` from `placedAt`.
- Tab bar.

## Data

- Identity from `getMyProfile(client)` under `['profile', 'me']` (the `profiles` table: `username`, `displayName`, `avatarUrl`, `createdAt`; created by trigger on signup, seeded from Google's name and picture when the account came from Google). Name: `displayName`, else the email's local part. Second line: `@{username}` when set, then `joined {Mon YYYY}` from `createdAt`; without a username, the joined date alone (rule 9, no invented handle). Avatar: `avatarUrl` when set, else the placeholder circle.
- Stats: `profileStats(client)` under `['profile', 'stats']`: `ranked`, `backlog`, `upcoming`.
- Recent: `recentRankings(client, 10)` under `['profile', 'recent']`; `placedAt` is the date to show (never `updatedAt`, which moves on every shifted row); `placement.score` is ready; the global rank = sizes of the better tiers + `placement.position` + 1, with the tier sizes from the same `['ranking']` query the Ranking tab uses.

## Behavior

- Ranked tile → the Ranking tab; Backlog tile → Next; Upcoming tile → Next with `segment=upcoming`; Friends does nothing in V0.
- Share my top 10 → the native share sheet with a plain-text list of the top ten (rank, title, score) ending "Ranked with Verso". The image version comes with the collection wall later.
- Recent row → game page with `from: 'Profile'`.
- Settings (not drawn; an iOS grouped list, convention): Profile (Edit profile: display name and username through `updateMyProfile`; a username is lowercase letters, digits, and underscores, 3 to 24 characters, unique, enforced by the database and shown as the @handle; a taken or invalid username shows the typed error's message), Account (the email, Sign out in destructive red → `signOut`), Data (Export as JSON → `exportUserData`, Export as CSV → `exportUserDataCsv`, each written to a file with `expo-file-system` and handed to the share sheet; Import from a file → a document picker, `importEntries`, JSON only, a confirm alert first), About (version from `expo-constants`). Dev builds add a link to `/preview`.

## Empty state

- No rankings yet (`F · Profile · empty` 39:1273, dark 39:1549; drawn 2026-09-16, awaiting reaction): the stat tiles read 0, 0, 0 and "—"; "Share my top 10" is hidden (nothing to share, rule 20); "Recent" 20 bold stays, then (gap 12) a `bg/surface` card, radius 16, holding an `EmptyState`: `trophy`, "No rankings yet", "Rank your first game from its page.", no action.
