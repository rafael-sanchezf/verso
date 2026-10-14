# Shell: tab bar, theme, primitives

Owner: Phase 1 shell agent. Sources: the `Tab bar` component set (32:375, variants Active=Home|Search|Ranking|Next|Profile), the Icons section (28:2) on the Components page, the tokens in `packages/tokens/tokens.json`, and the headers the tab screens share (Search 26:121, Ranking 26:453, Next 26:670, Profile 26:809). Read [README.md](README.md) first.

## Tab bar (32:375)

- Fill `bg/canvas`, 1px top hairline `border/separator`, padding top 8, sides 8, bottom = home-indicator inset (34 in the frame).
- Five items of equal width, each a column with gap 4 and top padding 2: icon 24 (Lucide, 2px stroke) over a label 10.
- Active: icon and label in `brand/text` (decision 29, adopted 2026-10-08; the medium has no color), label Semi Bold, the icon stroke a touch heavier; a weight change alone was too slight (Rafa, 2026-09-16, rule 32). Inactive: `text/secondary`, label Regular.
- Icons: Home `house`, Search `search`, Ranking `trophy`, Next `layers`, Profile `user`. Labels are exactly those five words (rule 8).
- Build with Expo Router `Tabs` and a custom `tabBar` so the bar matches the frame in both schemes. NativeTabs (the iOS 26 glass bar) is a later option; say so in the PR.

## Icons

Lucide through `lucide-react-native`, 24 by default, stroke 2, `text/primary` unless overridden. The set the frames use: house, search, trophy, layers, user, gamepad-2, book-open, film, tv, arrow-left, ellipsis, plus, check, chevron-right, chevron-down, grip-vertical, play, clock, calendar, x, star, share, grid-2x2, list, settings. The `Icon` primitive takes `name`, `size`, and `color` as a token name.

## Theme

- Generated from `packages/tokens/tokens.json`, never copied by hand: a script in `packages/tokens` writes the app's theme module (colors for light and dark, spacing, radius, the type ramp) and the CSS variables file. Both outputs are committed so CI needs no build step; `pnpm tokens:build` regenerates them and CI fails if they are stale.
- CSS variable names are the tokens' `css` extensions: `--color-bg-canvas`, `--color-medium-games`, `--color-tier-loved`, `--spacing-4`, `--radius-md`.
- Light and dark follow the device setting. The React Navigation theme (background, card, text, border, primary) is derived from the same tokens so headers and sheets match.
- Styling layer: Uniwind on Tailwind v4 is the decision in `docs/design/tech-stack.md`. Confirm it installs and builds on Expo SDK 57 before committing to it; if it does not, use NativeWind v5 and say so in the PR. Either way the theme values come from the generated file, and a plain `StyleSheet` with the theme object is acceptable inside primitives where a class string would be awkward.
- Font: Inter 400, 500, 600, 700, loaded at start; the splash stays until fonts and the session are ready.

## Headers shared by four tabs (Search, Ranking, Next, Profile)

- Row with side padding 16 and bottom padding 12 (8 on Profile, 10 on the Ranking list): large title 34 bold `text/primary` on the left, a right slot.
- Right slot on Search, Ranking, Next: the `MediumChip`, a `bg/surface` pill, padding left 8, right 10, vertical 4, gap 6: the medium's Lucide icon at 14 in `text/secondary` and "Games" 13 semibold `text/primary` (decision 29: no medium color). Static in V0, the switcher lives only on Home (open question 8).
- Right slot on Profile: the `settings` icon at 24.
- The title does not collapse on scroll in the frames; an iOS large title that collapses is an acceptable convention (rule 7) if it keeps this look at rest.

## Primitives (`apps/mobile/src/ui/`)

Every primitive is themed from tokens, works in light and dark, and is rendered on `app/preview.tsx`.

- `Text`: `style` is a ramp name; optional `size`, `weight` (400, 500, 600, 700), `color` (token name), `align`, `numberOfLines`.
- `Button`: `variant` primary (`brand/primary` fill, `brand/on-primary` label, white, 7.0:1) | secondary (`bg/surface` fill, `text/primary` label) | contrast (`text/primary` fill, `bg/canvas` label, used by Done and Share); `size` regular (label 17 semibold, vertical padding 14) | compact (16 semibold, padding 13) | small (14 or 15 medium, padding 12); radius 12; full width by default; pressed at 70% opacity; `disabled`; `onPress`.
- `Chip`: pill, label 13 or 14 medium; `variant` surface (`bg/surface`) | filled (`text/primary` fill, `bg/canvas` label) | outlined (1px `border/separator`) | owned (`bg/surface` with a 1.5px `brand/text` border and a leading 14pt `check`); optional leading icon; `onPress`.
- `Cover`: `width`, `radius`, `candidates: string[]` (from `coverCandidates`), height = width × 4/3, `expo-image` with the candidates as ordered fallbacks, `bg/placeholder` when the list is empty or every URL fails.
- `ListRow`: leading `Cover` (width prop), one to three text lines (title 16 medium `text/primary`; second 13 `text/secondary`; third 12 `text/secondary`), a trailing slot, vertical padding 10, gap 12, `onPress`, `onLongPress`.
- `Sheet`: chrome for an in-screen bottom sheet that is not a route: `bg/sheet` (the canvas in light, `#1C1C1E` in dark, VER-200, 2026-10-13), top radius 24, a hairline `border/separator` along the top edge in dark mode only, grabber 36×5 radius 3 in `border/separator`, padding top 12, sides 16, bottom safe area, a 35% black dim behind. Route-level sheets use the native form sheet the shell registers; `SheetFrame` paints them the same way, and `Dialog`'s card uses `bg/sheet` too. Content inside a sheet or a dialog reads the theme through `ElevatedScope`: in dark, `bg/canvas` there is `bg/sheet` and `bg/surface` is `#2C2C2E` (the `bg/placeholder` step), so fields, secondary buttons and chips keep their edge on the lifted sheet.
- `ScoreBadge`: pill, padding 10×5, label 15 bold in `tier/label` (white since decision 29); background from `scoreColor(score, palette)` in core: piecewise-linear in sRGB between the four tier colors anchored at 1.95 (disliked), 5.2 (fine), 7.45 (liked), 9.25 (loved), clamped outside. A `small` size uses label 12 and padding 8×3.
- `TierChip`: a pill filled with the tier's deep solid (`tier/loved`, `tier/liked`, `tier/fine`, `tier/disliked`, option A of decision 29, the same in light and dark), padding left 10, right 12, vertical 5, the tier's Lucide icon at 14 (heart, thumbs-up, meh, thumbs-down; mandatory, because the four solids sit 1 to 4 units apart under red-green color blindness) and a label 13 semibold, both in `tier/label` (white): "Loved it", "Liked it", "It was fine", "Didn't like it".
- `SegmentedControl`: track `bg/surface`, radius 10, padding 2, gap 2; segments of equal width, vertical padding 7, radius 8, an optional 16pt icon and a label 15; the selected segment has a `bg/canvas` fill, a semibold label, and a `text/primary` icon; the others are regular with a `text/secondary` icon.
- `MediumChip` and `ScreenHeader` as above. `Icon` as above.
- `EmptyState` (component set `EmptyState` 37:102 on the Components page, variants Action=Button 37:77 and Action=None 37:91; drawn 2026-09-16, awaiting reaction): a centered column, padding 32 vertical and 24 sides, gap 6, full width: `Icon` at 32 in `text/secondary` (any Lucide name; 6pt below it), title 17 semibold `text/primary`, body 15 `text/secondary`, both centered and wrapping; with `action`, a primary small button 10pt below (`medium/games` fill, `bg/canvas` label 15 semibold, padding 12 vertical 20 sides, radius 12, hugging its label). Props: `icon`, `title`, `body`, optional `action: { label, onPress }`, optional `secondaryAction: { label, onPress }` (added 2026-09-23 for Home's empty Playing card: the secondary `Button`, small, 15 semibold, hugging its label, 6pt under the primary). Screens wrap it in a `bg/surface` card (radius 16) when it stands in for a block (Home, Profile) and place it bare, centered in the list area with bottom padding 120, when it stands in for a whole list (Search, Ranking, Next).

## Other shell responsibilities

- Session gate with `useSession()`: `loading` keeps the splash up, `signed-out` shows `(auth)/sign-in`, `signed-in` shows `(tabs)`.
- Session storage on native is encrypted (see signed-out.md). `createSupabaseClient` gains a `flowType` option, `'pkce'` in the app; `packages/api/src/client.ts` is the only file in that package the shell edits.
- Placeholder files for every route in the README map, each rendering its own name and "not built yet", registered in the root stack with their presentation (form sheet for add, log, hours, details, platforms; card for game and settings). Typed routes on.
- `src/lib/query-keys.ts`, `src/lib/invalidate.ts`, `src/lib/format.ts` as the README describes, with unit tests for the formatters.
- `scoreColor` in `packages/core` with tests (the frame's badges are the fixtures: 8.4 → #83C053, 8.2 → #89BF4D, 8.0 → #8FBD48, 6.1 → #C9A822, 5.4 → #DE9F15 with the light palette).
- Dependencies the later agents will need, added now so seven lockfile changes do not collide: `lucide-react-native` and `react-native-svg`, `@tanstack/react-query`, the Inter fonts, `expo-blur`, and the drag-to-reorder library (`react-native-sortables` per tech-stack.md; prove it in the preview route on SDK 57, otherwise pick the working alternative and say which).
- Logo placeholder: `docs/private/design/assets/logos/v-bars-games.svg` copied to `apps/mobile/assets/logo/v-bars-games.svg` for Home's switcher, rendered with `react-native-svg`.
- The Expo template's demo files (`explore.tsx`, `hint-row`, `web-badge`, `animated-icon`, `themed-*`, the template theme constants and tab icons) go away once nothing imports them.
