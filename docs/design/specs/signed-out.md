# Signed out and the sign-in flow

Frame `F · Signed out` (26:4). Route `app/(auth)/sign-in.tsx`. Owner: shell agent. Read [README.md](README.md) first.

Decided 2026-09-16 (Rafa): the whole sign-in flow is built now, plainly, without a Figma pass; Inter is the app font; Google login joins email. The frame is the first step; the later steps reuse its sheet and are kept as simple as iOS conventions allow.

## Layout

- A full-height cover wall behind everything, with no label and no headline over it (Rafa, 2026-09-16): sides 12, three columns with gap 8, each a stack with gap 8 of covers 120 wide at IGDB's own 264:374 ratio (120 by 170), radius 10, each with the Cover edge (rule 30). Never cropped (rule 29): the frame's alternating 160/120/200 heights are dropped. The columns start above the top of the screen at different offsets (about −40, −120, −80) so the top row bleeds off the edge and the wall reads as staggered; the screen clips, the image never does.
- A sheet anchored to the bottom whose top sits at about 71% of the height (620 of 874): top radius 24, padding top 24, sides 24, bottom = home-indicator inset, column gap 12. Fill `bg/canvas` at 85% opacity over a 12pt blur (`expo-blur`) so the covers show through, per "Signed out v2, translucent blurred sheet over a full-height collage" in ui-brief.md. The sheet grows with its content; the wall stays put and the keyboard pushes the sheet up.
- Step 1, as drawn: "Verso" 34 bold `text/primary`; "Your games, ranked by you." 17 regular `text/secondary`; the email field (`bg/surface`, radius 12, padding 16 sides 14 vertical, placeholder "Email" 17 `text/secondary`, keyboard type email, no autocapitalize, no autocorrect); the primary Button "Continue with email"; then a secondary Button "Continue with Google" with Google's multicolor "G" mark at 18 on the left of the label (Google's sign-in branding rules: the official mark, unaltered, the wording "Continue with Google"). Frame draws the email field in `bg/canvas` on a `bg/canvas` sheet, invisible; do `bg/surface`. Frame has no Google button; it goes under the email button with the same width.

## Steps after "Continue with email" (not drawn, keep plain)

- Step 2, password: the email as a line 15 `text/secondary` with a "Change" text button; a password field like the email field (secure entry, placeholder "Password"); the primary Button "Sign in"; the secondary Button "Create account"; a "Forgot password?" text button 15 `text/secondary` centered. Sign in → `signInWithEmail`; Create account → `signUpWithEmail` with the same fields (minimum eight characters, say so under the field before calling). Errors from `AuthError.kind` as one line 13 under the field: "Wrong email or password", "That email is already registered, sign in instead", "Check your connection", and the message itself for anything else.
- Step 3a, confirmation (sign-up returned `session: null`): "Check your email" 20 semibold; "We sent a confirmation link to {email}. Open it, then come back and sign in." 15 `text/secondary`; a "Back to sign in" text button.
- Step 3b, forgot password: `client.auth.resetPasswordForEmail(email, { redirectTo: 'verso://auth/recovery' })`, then the same confirmation layout with "Check your email for a link to reset your password." When the app is opened by that link, `onAuthStateChange` reports `PASSWORD_RECOVERY`: show a "Set a new password" step (one password field, primary "Save" → `client.auth.updateUser({ password })`), then continue signed in.
- Steps crossfade inside the sheet; no navigation push.

## Google

- `client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'verso://auth/callback', skipBrowserRedirect: true } })` returns the URL; open it with `WebBrowser.openAuthSessionAsync(url, 'verso://auth/callback')`; on success read `code` from the returned URL and call `client.auth.exchangeCodeForSession(code)`. The client is created with `flowType: 'pkce'` (a new option on `createSupabaseClient`). Call `WebBrowser.maybeCompleteAuthSession()` at module load for web. Also handle a cold start from the deep link through `Linking` so the callback still completes if the browser handed control back that way.
- The provider is configured by Rafa in the Supabase dashboard (ROADMAP.md, "You, when you have a moment"); until then the button shows the provider's error as one line. Locally, `supabase/config.toml` gains the two `verso://` redirect URLs in the auth-profiles PR.
- The `profiles` row is created by trigger for every new user, whichever provider; the app never inserts it.

## Session storage (safe by design)

- Passwords never reach the app or the database tables: Supabase Auth stores a bcrypt hash in `auth.users`, which no dashboard view or API returns. Nothing here changes that.
- The session (JWT and refresh token) is stored encrypted on native: a random 256-bit key in `expo-secure-store` (the keychain), the session JSON encrypted with AES-256-GCM and the ciphertext in AsyncStorage, the pattern Supabase documents for Expo as "LargeSecureStore" (SecureStore's own value limit is why the ciphertext lives in AsyncStorage). Web keeps the default storage. This replaces the unencrypted AsyncStorage adapter in `src/lib/supabase.ts`.

## Data

- The wall shipped in the shell as a fixed list of fifteen IGDB cover image ids rendered through `igdbCoverUrl(id, 't_cover_big')`, because the catalog was not readable signed out. `popularGames(client, 15)` is (the `popular_games` function, merged 2026-09-16); Phase 3 swaps the fixed list for it and keeps the fixed list as the fallback while the read is in flight or fails. Once the other catalogs have covers, the wall shows the medium in view or, with nothing selected, cycles through the four media in the switcher's order (games, books, movies, TV) with a crossfade; games only until then (Rafa, 2026-09-16).
- `useSession` flips the gate for every path above.
