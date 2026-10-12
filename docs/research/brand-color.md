# Brand color: one color instead of four, and how to pick it

Written 2026-10-07 at Rafa's request: the three medium colors "seemed cool" but detract from the brand, he leans green, and he wants the choice to be intentional. This is the framework, the evidence, the math, and a recommendation. It is a proposal until he has seen frames ([design before decision](../design/figma-workflow.md)). Notes behind it: [brand-color-notes/theory.md](brand-color-notes/theory.md) (the evidence, every bullet sourced) and [brand-color-notes/landscape.md](brand-color-notes/landscape.md) (who owns which color around Verso).

## The answer in five lines

1. **Yes, one color.** The evidence and the HIG both say a brand color is built by consistent use in few places; four hues that swap with the medium cannot become an asset, and the 2026-09-29 HIG review already found boldness "spent in slightly too many places."
2. **Green is harder than it looks, for three measurable reasons:** any green that carries white text at 4.5:1 lands within a hair of Xbox green; any green bright enough to avoid that collides with the approved "Loved it" chip; and under red-green color blindness the current green sits closer to a red than to the other candidates.
3. **The green that survives those constraints is a deep blue-green ("pine", OKLCH hue about 165).** It takes white text, sits far from the Loved chip and from Xbox, and is not Beli's teal. If Rafa wants green, this is the green.
4. **Draw three, not one:** pine, a color from the least-claimed family around Verso (a berry magenta; only Backloggd is near it), and "ink" (no brand hue at all, the mark and the tier palette carry everything). The two screens that matter are Games Home and Movies Home, light and dark, plus the app icon tile.
5. **Cost is small by design:** every color is a variable (decision 13). A `brand/primary` token replaces `medium/games` in 25 places across 17 app files, the Figma Colors collection gets two values, the four-color V logo concept is retired.

## Where we are

- **Four medium colors** (decision 8, 2026-09-15; rule 5): games `#439550`, movies `#4881CC`, books `#B56D13`, TV `#9A67B8`, the "Harmonized" treatment (equal lightness and chroma, hue the only variable; [direction-round-prep.md](../private/design/direction-round-prep.md)). The medium color marks the active tab, the primary button, the switcher word, the owned chip, the tier bar on grid covers, the new-row highlight, and the ask button on Movies Home.
- **What the screens actually do today.** The games screens are already a one-green app: a quiet neutral shell, Inter, gray surfaces, box art, one green. The four hues show in exactly two places: the three small switcher icons on Home, and the moment you switch medium, when the whole shell turns blue (Movies Home H: blue title, blue button, blue service marks). That second place is the dilution Rafa named: the brand's color is whatever medium you happen to be in.
- **The risk was named on day one.** The color-direction note of 2026-09-15 in [ui-principles.md](../design/ui-principles.md): "four different hues risk diluting the brand the way Beli's single color never does." The direction round's own recommendation was T2, "Ink and accent"; Rafa leaned Harmonized and confirmed it by approving the fidelity frames.
- **The tier palette is separate and approved** (2026-09-16): Loved `#6AC56A`, Liked `#A0BA39`, Fine `#E49C12`, Disliked `#FF8274`, `#111` labels on every chip, gradient score badges. This document does not reopen it; it does constrain the brand color (below).
- **The logo is deferred** to its own session; Rafa liked "a V carrying all four colors" (decision 13). The placeholder `VersoMark` draws one arm in `medium/games` and three in gray.
- **In code,** `medium/games` is the de facto primary: 57 references to `medium/*` across 21 files in `apps/` and `packages/`, 25 of them in 17 app files (button, tab bar, chip, platform icon, screen header, the mark, the switcher, search rows, the add sheet, the ranking grid, the confirm step, game actions). `packages/tokens/tokens.json` is exported from the Figma Colors collection and generates `theme.css` and `theme.ts`.

## The right way to think about it: six questions, in order

### 1. What is the color's job?

Color in Verso has three jobs today: **where am I** (the medium), **the one action** (the primary button, the active tab), and **how good** (the tier palette). The second and third are Beli's pattern. The first was Verso's addition, and rule 5 already says color is never the only carrier of it: an icon and a label always accompany the medium color. So the medium is already said by the icon, the word, and the content itself (box art is not a poster). Retiring color from job one loses nothing a user needs and gives the brand back its one color. The HIG puts it the same way: apply the accent "judiciously," for primary actions and status like the selected tab, and let branding "defer to content."

### 2. Where does the brand have to live?

Under the reframe (decision 21) the product is the recommender. The moments a person should remember Verso by are the **pick** (the ask button, the three picks, the reason line), the **comparison** (the two-card stage), the **share** (the top-ten card), and the **icon** on the home screen. Those are the surfaces that get the color. Everything else stays neutral plus content art, which is also what Letterboxd, Backloggd, Spotify and Steam do: dark or white surfaces, content in color, one accent where you act.

### 3. What must the one color pass? (non-negotiable, all computed)

Method as in [direction-round-prep.md](../private/design/direction-round-prep.md): OKLCH for perceptual steps, WCAG 2.2 for contrast, Machado 2009 for color-vision simulation; the script is in the session scratchpad and the numbers below are its output.

- **White text on the fill, 4.5:1** (the primary button's 17 pt label; Apple allows 3:1 for bold, but a color we use freely should not depend on weight). The HIG review already flagged the current green at 3.71:1.
- **The color as text or icon on the canvas, 4.5:1**, white canvas in light and black in dark (the active tab label, the title word). This forces a light and a dark value, which the HIG requires anyway, plus Increase Contrast variants.
- **Far from every tier chip**, light and dark, so the brand is never read as a verdict. Measured as OKLab distance; the current green sits 14.6 from the Loved chip in both modes. A brand color should do better, not worse.
- **Far from the semantic reds and from iOS's default blue** (`#007AFF`), including under deuteranopia (about 8% of men), so the brand never looks like an error, a link, or an unbranded app.
- **Works over colorful content.** Posters and box art are saturated; the brand color appears beside them, never under them.

### 4. What does the neighborhood already own?

Fifty-six products read on 2026-10-07, each counted once by its primary hue ([landscape.md](brand-color-notes/landscape.md) has the table with sources and whether each hex is documented or read off the icon).

| Family | Trackers (21) | Game platforms (10) | Streaming (10) | Everyone (56) |
|---|---|---|---|---|
| Blue | 5 (Hardcover, Sofa, Achriom, HowLongToBeat, Infinite Backlog) | 3 (Steam, PlayStation, Discord) | 3 (Prime Video, Paramount+, MUBI) | 12 |
| Teal | 4 (Beli, Serializd, StoryGraph, TasteDive) | 0 | 1 (Disney+) | 6 |
| Green | 3 (Fable, Reelgood, GG) | 2 (Xbox, Game Pass) | 1 (Hulu) | 14, eight of them consumer brands (Spotify, WhatsApp, Duolingo, Cash App, Razer, Nvidia, Evernote, Robinhood) |
| Red, orange, yellow | 3 (Likewise, JustWatch, TV Time) | 2 (Nintendo, itch.io) | 1 (Netflix) | 11, plus IMDb, Metacritic, Rotten Tomatoes, OpenCritic |
| Purple | 1 (Trakt) | 2 (Twitch, GOG) | 0 | 3 |
| Pink | 1 (Backloggd) | 0 | 0 | 1 |
| Neutral | 2 (Goodreads, Simkl) | 1 (Epic) | 2 (HBO Max, Criterion) | 5 |

What it says. Blue is the most crowded family in every media category and is also iOS's own tint. Among trackers, teal and green together hold seven of the twenty with a known color, and the bright greens form one tight cluster at OKLCH hue 140 to 155 (Letterboxd `#00E054`, Spotify `#1ED760`, WhatsApp, Hulu `#1CE783`, Cash App, Reelgood, GG `#44E239`); Xbox `#107C10` is the dark member of that family and now pairs with a lime `#9BF00B` on xbox.com. Letterboxd's green is not one of three decorative dots: its primary button is `#00AC1C` and its star ratings use the brand green token. **Beli, the model for the loop, is not green:** its wordmark, segmented control and chips are a dark blue-leaning teal, `#134F5C` (its site CSS, its App Store art, and the icon wordmark agree; a browser read of beliapp.com gave `#144F5D`), on a white icon, with a separate green, yellow and red for scores. Goodreads does the same: cream and brown brand, a green button, orange stars. That split, brand hue apart from score hue, is the pattern Verso should copy. Structure is near-uniform: one accent on neutral surfaces, dark-first for games and film trackers, light-first for books and restaurants. TV Time shut down on 2026-07-15 and Likewise now redirects to Pix, so two of the brief's neighbors are gone.

### 5. What should the color mean?

Less than Rafa might expect. Romaniuk (Ehrenberg-Bass) argues against choosing a brand asset for its meaning: meaning is shared with every rival who wants the same association, it competes with the brand link while that link is being built, and it can "put an expiry date on the asset" when the product grows. The strongest measured evidence agrees: across 1,000+ assets in 21 categories, color averages 12% fame and 39% uniqueness against 40% and 71% for shapes and logos. The intentional move is therefore not "green means go" but **a color chosen for ownability and consistency, paired with a mark that does the heavy lifting**. If a story is wanted, pine has one that is Verso's own rather than the category's: the baize of a games table, the dark of a cinema. It is a story, not evidence.

### 6. What does it cost, and can it be undone?

Cheap and reversible, because decision 13 bound every color to a variable. The change is a new `brand/primary` (and `brand/on-primary`) token, the 25 app usages re-pointed, `medium/*` retired, the Figma Colors collection given the two values, the kit's `C.games` and `C.movies` collapsed to `C.brand`. About two hours of code, one Figma round, a ten-minute HIG review. Nothing in the data model or the specs' layouts changes.

## What the math says about green

| Color | OKLCH (L, C, hue) | White text on it | On white canvas | Distance to Loved chip | Distance to Xbox |
|---|---|---|---|---|---|
| Current games green `#439550` | 0.60, 0.130, 147° | 3.71 (fails) | 3.71 (fails for text) | 14.6 | 14.3 |
| Greenest green that passes white text, same hue `#008930` | 0.55, 0.164, 147° | 4.54 | 4.54 | 19.7 | **4.1** |
| Xbox `#107C10` | 0.51, 0.165, 143° | 5.37 | 5.37 | 23.5 | 0 |
| Spotify `#1ED760` (black text) | 0.69, 0.187, 149° | 1.92 (fails) | n/a | **6.7** | 16 |
| Pine `#007C59` | 0.52, 0.126, 165° | 5.21 | 5.21 | 23.5 | 7.7 |
| Beli teal `#134F5C` | 0.40, 0.062, 216° | 9.3 | 9.3 | 30+ | 20+ |

Three findings:

1. **Darken the current green until white text passes and you get Xbox.** At hue 147 the first value that clears 4.5:1 is `#008930`, 4.1 OKLab units from `#107C10`. Xbox's own guidelines say "use white type when using green" for exactly this reason.
2. **Brighten it instead, Spotify-style with black text, and you get the Loved chip.** Spotify green is 6.7 units from `#6AC56A`; Apple's system green is 4.4. A bright brand green would make the primary button and the top verdict the same color. No one in the evidence notes runs a brand color as the top step of a multi-hue rating scale.
3. **The way out is sideways, toward teal, not up or down.** At hue 160 to 170 and L 0.50 to 0.55, the color takes white text, sits 20 to 25 units from the Loved chip (better than today's 14.6), 7 to 9 from Xbox, 13 to 18 from Beli, and under deuteranopia keeps 15 to 17 units from a red where the current green keeps 9. Hue 165 is the middle of that band; 170 is the dial if it still reads "Xbox" on the canvas.

Under deuteranopia the four tier chips are the real casualty, not the brand: Loved and Disliked simulate to `#BCAE70` and `#BFB172`, 0.9 units apart. That is a tier-palette question, held for the end of this document.

## The three to draw

Each has a light value (fill and text in light mode), a dark value (text and icon in dark mode; as a fill it takes a `#111` label, exactly as the tier chips do), a two-line story, and its risks. Values are computed, not picked by eye; the agent drawing the round may shift lightness by 0.02 to match the frames but not the hue.

### A. Pine (the green that survives)

- Light `#007C59` (white text 5.2:1, on white 5.2:1). Dark `#00BA87` (on black 8.4:1; `#111` label 7.5:1). Increase Contrast light `#00644A`-range, computed at build.
- Purist variant: one value for both modes, `#008660` (4.59 on white, 4.58 on black, white label 4.59). Passes everything with no margin; keep as a curiosity unless Rafa loves "one color, one hex."
- Story: a deep blue-green, the baize of a games table and the dark of a cinema; Rafa's lean, pushed exactly far enough to be Verso's.
- Risks, measured: it is still a green, so it is still "the other green icon" beside Xbox and Spotify on a gamer's home screen (7.7 units from Xbox). Its exact neighborhood is the functional action green: Goodreads' "Want to Read" button `#3F8363` (4.4 units), Grammarly's current `#027E6F` (3.3), Reelgood's dark value `#008553` (3.2); Fable, the books-and-TV social app, is a darker cousin at `#064C37` (15.3). It is 15 units and 50 degrees of hue from Beli's teal. Hue 170 and L 0.50 (`#00755A`) move it off Goodreads and Grammarly at the cost of reading more teal.

### B. Berry (the least-claimed family)

- Light `#BB2D8C` (white text 5.4:1). Dark `#ED74BD` (on black 7.8:1; `#111` label 7.0:1).
- Story: warm without being a verdict (40 units from every tier chip), the least-claimed chromatic family among the fifty-six neighbors, and distinct under every color-vision simulation.
- Risks, measured: Backloggd, the games tracker most often called "Letterboxd for games," is a hot pink `#EA377A`, 10.6 units away (a visible difference, the same family); Trakt's purple `#9F42C6` is 10.7 away. Beyond media it reads fashion or dating (Lyft, Tinder) and T-Mobile owns magenta in telecom. It fights with warm posters more than a cool color does.

### C. Ink (no brand hue)

- `text/primary` as the primary fill (the existing `contrast` button variant), `#FFFFFF` and `#000000` canvases, the tier palette the only color on any screen, the V mark in ink.
- Story: Verso is the page; the mark and the typography are the brand, which the asset research says is the stronger investment anyway. Five neighbors already do it (Goodreads, Simkl, Epic, HBO Max, Criterion), and the dark-first trackers are near-black apps whose color is the content.
- Risks: black is the most common icon color among top games; without a hue the mark has to be excellent, and the logo session has not happened; "Ask" buttons and the active tab lose their pop.

**Rejected before drawing**, with the reason each time: blue (the most crowded family in every media category, iOS's own tint, PlayStation and Steam; an app in blue looks unbranded on iPhone), indigo and violet (Twitch, Trakt, Hardcover; under deuteranopia they simulate to within 3 to 5 units of iOS blue), coral and amber (the Disliked and Fine chips, and Likewise's coral), yellow (IMDb, JustWatch, Metacritic, and no white-text value exists), teal proper (Beli, Serializd, StoryGraph, TasteDive, Disney+), a brighter green (the Loved chip and the Letterboxd, Spotify, Hulu, GG cluster).

## Recommendation

Pine, drawn against Berry and Ink so the choice is seen rather than argued. Two-value tokens (`brand/primary` light and dark, `brand/on-primary` white in light and `#111` in dark) rather than the single-hex variant. The medium is said by icon, word and content only; the switcher's inactive icons go `text/secondary` and the active one takes the brand color. The logo session, when it comes, works in one color.

## What changes if it is adopted

- **Rules.** Rule 5 becomes "Color is the brand's, never the medium's: one brand color marks the action and the active state; the medium is said by its icon, its word and its content." Rule 32 (the active tab in the medium color) and rule 36 (Movies Home's colored button) read "brand color." Decision 8's "medium colors" sentence is struck; decision 13's Harmonized assumption is superseded.
- **Tokens.** `brand/primary`, `brand/on-primary`, light, dark, and Increase Contrast values; `medium/*` removed from `tokens.json`, `theme.css`, `theme.ts` and the Figma Colors collection; the kit's `C.games` and `C.movies` become `C.brand`.
- **Code.** The 25 app usages re-pointed (one PR, with the tab bar and the button first); `VersoMark` draws in `brand/primary`; the media switcher drops per-medium colors.
- **Frames.** Nothing redrawn except by value swap; the brand round's frames become the reference for the icon and the switcher.
- **Logo.** The four-color V concepts in [assets/logos](../private/design/assets/logos/README.md) are retired; the logo session starts from one color.

## Rafa's reaction, 2026-10-07 evening, and the revised proposal

Rafa, by voice, after reading the above: the color should be a deeper green, "a little bit more poppy," like the default green on his Outlook calendar (screenshot sent; the tile is `#234F17`, OKLCH L 0.38, C 0.098, hue 140, with a lighter edge `#387A26`); "the color for the app should be the color we use for loved," because "things you love are this color, and you love the app"; and "a combination of the green I just sent and the green we use currently in all the mockups would be good to keep." He asked for thoughts or pushback.

**Decoded.** One green, not pine and not a non-green; a deep value like Outlook's and the mockup green kept, as one family; the Loved tier and the brand share that green. Inferred and flagged: the medium still carries no color anywhere (unchanged from the morning); berry and ink are out; the tier palette's top step is reopened, since Loved becomes the brand's green.

**Claude's read: agree, as a two-depth green.** "Deeper" and "poppy" pull in opposite directions in one value, and his own word "combination" is the answer: one hue, two depths, each with a job.

| Token | Light | Dark | Job | Contrast |
|---|---|---|---|---|
| `brand/deep` | `#006822` (OKLCH L 0.45, C 0.135, hue 147) | unused as text; the icon tile | Light mode: every fill (primary button, the ask button) with a white label; every brand text and icon (active tab, the title word) | white on it 7.0:1; on white 7.0:1 |
| `brand/mid` = Loved | `#439550` (the mockup green, L 0.60) | `#64A86C` (L 0.67) | Dark mode: every fill, with a `#111` label; every brand text and icon. Both modes: the Loved chip, the top of the score gradient | on black 7.4:1 (dark); `#111` on the dark fill 6.6:1; `#111` on the light chip 5.1:1 |

What this fixes on the way: both Critical findings of the 2026-09-29 HIG review were white labels on `#439550` at 3.71:1 (light) and 2.85:1 (dark); deep takes white at 7.0 and the dark fill takes `#111` at 6.6. And the deuteranopia collision found this morning goes away if the Loved chip is the mid green: Loved and Didn't-like simulate 15 units apart instead of 0.9, because the top step is now darker than the other three.

**Pushback, ranked.**

1. **The knife edge is Xbox, and "deeper" is what avoids it.** At OKLCH L 0.50 to 0.52 this hue is Xbox green to within 1.5 units. Outlook's tile is 14 units away because it is deep (L 0.38); `#006822` at L 0.45 is 6.8 away and 7.8 from Outlook. The round must show the deep value at L 0.42 to 0.45, never at 0.50, and the agent may not "brighten it a little."
2. **Brand equals Loved is a real choice with a price.** Letterboxd, Spotify and Duolingo run their brand color as the affirmation color, so the story holds. The price is every green mark that is not a verdict: the new-row highlight on Look right?, the tracked check on a search row, a green bar on a grid cover. Each reads "loved" once the chip is the brand. Rule: green on a control means the app, green on a chip or badge means loved, and no green mark sits on a row that is not a verdict. Three specs change (bulk entry review, search rows, ranking grid).
3. **Dark mode cannot lead with the deep green.** `#006822` on black is 3.0:1 as a fill and 2.4 as text; it vanishes. Dark mode leads with the mid green and dark labels, exactly as the tier chips already do. One rule, not a problem.
4. **The Loved chip darkens.** If Loved is the mid green, the top step is L 0.60 while the other three stay at 0.75; the "perceptually even" palette of 2026-09-16 is broken on purpose. The gradient badge still reads (coral, amber, yellow-green, then the brand). Rafa decides this one, since it reopens an approved palette; the alternative is a Loved chip that stays bright and shares only the hue, which keeps the color-blindness collision.
5. **Still a green beside Xbox and Spotify on a gamer's home screen.** Unchanged from the morning and accepted by Rafa's choice; the deep icon tile (white V on `#006822`, the Outlook look) is further from Xbox's lime icon than any mid green would be.

**Second reaction, the same evening.** Rafa: pushbacks 2 and 3 are the genuine ones and "there's nothing we can do" about them, so the price is accepted; he wants to see dark mode (pushback 3); on pushback 4 he suggests an aqua, Beli-style green for the light step so the Loved chip reads as a hue shift rather than a darkening; and he asked for a board on the Foundations page with "all the colors for Loved, the light, mid and deep." Drawn as `Brand green round · 2026-10-07` (176:2) at x 900 on the Foundations page: Ramp A (Outlook reference, deep, mid, today's light, Xbox as the knife edge; the dark-mode values on a black strip, deep shown vanishing on black), Ramp B (the same deep and mid, the light step at hues 160, 170 and 180 with their dark values), two in-use cards (light leading with deep, dark leading with mid: title word, primary button, tab bar, then the tier chips and gradient three ways: A with Loved as the mid green, B with Loved as aqua 170, today), and a deuteranopia strip (today 0.9 apart, A 15.4, B 6.9). Claude's read of the board, not a decision: A's Loved chip is visibly the darkest of the four chips; B's aqua chip reads as a fourth hue rather than a darker green, which is what he hoped, at the cost of sitting in Serializd's and StoryGraph's neighborhood and separating less under color blindness. Waiting for his letters on the board before the two screen rows are drawn.

**Third reaction, later the same evening.** Rafa on the board: the Outlook tile had rendered darker than he meant (it was on a dark-mode page); the color he wants is `brand/deep` `#006822` as shown on both ramps, Xbox adjacency accepted ("a little bit close to Xbox, I don't think it's terrible"); the teal is scrapped, because the scale has to run from his green down to the coral; today's A on the light card is the closest to right; rebuild with the three greens (deep, mid, light) as the three options for the Loved chip; and why can't dark mode keep the same color rather than "adding more whites." Drawn as `Brand green round 2 · 2026-10-07` (180:2) under the first board. The dark-mode answer, shown on a black strip: contrast is one number per pair, so `#006822` on black is 3.0:1 whatever its role; as a filled button that passes (the edge needs 3:1, the white label on it is 7.0:1), as text or an icon it fails (4.5:1 needed). So the fill stays deep in both modes and only brand-colored text and icons lift in dark mode, to `#009B37` (same hue and chroma family, 5.7:1) or to the mockup's `#64A86C` (7.4:1); iOS lifts its own system green the same way. Four in-use cards: light with deep leading; dark 1 with the deep button kept and text lifted; dark 2 with everything deep, as asked, so the cost is visible (the title word and the active tab nearly vanish); dark 3 with mid leading (round 1). The Loved chip three ways on each: deep with a white label, mid, light. Deuteranopia rows: deep 30.7 from Didn't-like, mid 15.4, light 0.9. Inferred and flagged: `brand/deep` is decided in Rafa's mind; the Loved chip and the dark-mode text value are the two letters still owed.

**Fourth reaction, later still.** Rafa loves deep `#006822` for the Loved chip and the brand, but a white label on it beside black labels on the other three chips is "totally not sustainable." He asks, before anything is redrawn, how to remedy it; his own two ideas are white text on all four (darker yellow, orange and red) or Excel-style tinted chips with same-hue dark text; the chip colors must be the same in light and dark; today's light chip is "way too light," the mid `#439550` is the lightest he can accept, and he really wants the deep.

**Claude's answer, computed.** Three ways to make the four labels one color, each with one value per tier for both modes:

| Option | Loved | Liked | Fine | Disliked | Label | What it costs |
|---|---|---|---|---|---|---|
| A · deep solids, white text (recommended) | `#006822` (L 0.45) | `#5B6C00` (L 0.50) | `#865900` (L 0.50) | `#BB0A10` (L 0.50) | white, 5.6 to 7.0:1 | Liked becomes an olive and Fine a brown; on black the edges sit at 3.0 to 3.7:1; under deuteranopia the four are 1 to 4 units apart, so a tier icon on every chip becomes mandatory, not optional |
| B · Excel tints, same-hue deep text | `#CEF3D1` / text `#006822` | `#E2EEC2` / `#4E5D00` | `#FFE3BE` / `#744C00` | `#FFE0DB` / `#A30007` | each its own dark hue, 5.8 to 6.6:1 | The deep green is the ink, not the chip, so the Loved chip reads pale; the chips are light islands on the dark canvas (today's convention); color-blind separation no better |
| C · mid solids, black text (the floor) | `#439550` | `#768C00` | `#AC7300` | `#DE3D34` (lift to L 0.62 for 4.5:1) | `#111`, 4.3 to 5.1:1 | The deep stays the brand but not the chip; Loved and brand share only the hue |

Why A: it is the same rule the brand already follows (a deep solid with white on it, in both modes), the score badges and tier dividers take the same four solids with white numerals, and nothing on a tier surface ever changes value between light and dark. The three warm deeps are set one notch lighter than the green (L 0.50) so their edges clear 3:1 on black while white still passes; the green keeps Rafa's `#006822`. The gradient badge shades brick, brown, olive, forest. Tier icons (already an open item from the fidelity round) carry the meaning for the 8% the palette no longer separates. Rafa cannot read hex, so the three were drawn as `Brand green round 3 · 2026-10-07` (184:2) under round 2: each option as a light card and a dark card with the same values, showing the four chips with Lucide icons (heart, thumbs up, meh, thumbs down), the compare-step chip, three ranking rows with score badges, a labeled tier divider drawn as a line plus a chip so no tier-colored text sits on the canvas, the gradient, and a deuteranopia column per option. He votes A, B or C on the board.

**Rafa's vote, and the round drawn.** A, "because it looks fine on both light and dark mode," slightly too deep for light mode but fine; B fine in light and too light in dark; C fine in dark and too dark in light; B and C kept in the back pocket for testing. Recorded as decision 29. One Opus agent then drew the round on a new page, `Brand color round` (186:2), in nine calls: `Brand · Home light` 187:2 (from F · Home 26:33), `Brand · Home dark` 189:29 (from its dark twin 32:622), `Brand · Movies light` 189:190 (from H 143:173), `Brand · Movies dark` 189:364 (the light recolor with its neutrals inverted), `Brand · Icons` 190:72 (the `#006822` tile with a white V, 190:61, and the white tile with a `#006822` V, 190:67), the note 190:73. Nothing but color changed; no color went unmatched; neither Home carries a tier surface. The agent's judgment calls: the active tab was left neutral because the source frames predate rule 32 (the orchestrator then colored the Home tab's icon and label in the brand text value on all four frames, `#006822` light and `#009B37` dark); movies Home's switcher has one inactive medium, now gray; the movies dark frame keeps its white chips white, as the tier chips are light islands; every fill keeps `#006822` in dark, including the ask button; the icon board sits on `#F2F2F7` so the white tile's edge shows. Left for Rafa: the fifteen service marks inside the poster chips (Netflix, Max, Hulu, Peacock) are now brand-green squares, a green mark that is neither a control nor a verdict. The agent's read, recorded not acted on: in dark the lifted `#009B37` is clearly brighter and more saturated, so the two modes read as two related greens, and the dark one sits closer to Xbox.

## Open for Rafa

1. Dark-mode text and icons, seen on the dark Homes: `#009B37` as drawn, or the softer `#64A86C`. Fills keep deep either way.
2. The app icon: the deep tile with a white V or the white tile with a deep V. Both are on the round's icon board.
3. The service marks on the movie posters: brand green as drawn, or neutral.
4. The three green marks that are not verdicts elsewhere (Look right? highlight, search tracked check, ranking grid bar): neutral, or the brand at low alpha with a word.

## Sources

The notes carry every citation. The ones this document leans on: Phua, Bali, Anesbury and Sharp, *International Journal of Advertising* 2026 (asset fame and uniqueness by type); Romaniuk, *Building Distinctive Brand Assets* 2018 and Marketing Week 2025-09-09 (meaning versus ownability); Labrecque and Milne 2012 and 2013 (hue and personality; match or break the category code); Apple HIG, Branding (refined 2026-09-09) and Color; WCAG 2.2 1.4.3 and 1.4.11; Machado, Oliveira and Fernandes 2009 (color-vision simulation); Birch 2012 (prevalence); Xbox Brand Guidelines 2019; Spotify for Developers design guidelines; Letterboxd's and Beli's own stylesheets and App Store listings (read 2026-10-07); the fifty-six-product table in the landscape notes.
