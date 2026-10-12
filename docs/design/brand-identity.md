# Brand identity: the mark, the app icon, and the words

Written 2026-10-08 after Rafa's brand board was finished. The board was built for a design course and for Verso at once; this file brings the outcome back here. Nothing in it reopens decision 29 (the brand green); it records what was decided on top of it.

## Where everything lives

| What | Where |
|---|---|
| The board as submitted | Rafa's course file, outside the Verso file (its key is in `docs/private/CONTEXT.md`), frame `Verso brand board · HW3` |
| The master drawing of the mark | Same course file, frame `Human made logo base`, component `Verso mark, drawn by hand` (14:4) with his construction layers inside |
| The same board in the Verso file | The Verso file (`<figma-file-key>`), page `Brand board (HW3)`, frame 227:31 |
| Reusable components in the Verso file | Same page, frame `Brand components` (238:33): `Verso mark` (238:37), `Verso app icon` (238:38), `Verso lockup` (238:42). Every logo on board 227:31 is an instance of `Verso mark` |
| The longer brand guide | Same page, frame 193:3, `Verso brand guide, full (reference, not for submission)`: clear space, sizes, backgrounds, a do-not row, the type scale. Its touchpoints are still the games version |
| Files | [assets/brand/](assets/brand/): `verso-mark.svg`, `verso-mark-white.svg`, `app-icon-1024.png`, `brand-board-hw3.png` |

## The mark

A sharp V with an upright play triangle in its opening. The left arm runs unbroken to the apex; the right arm stops short, cut parallel to the left arm's inner edge with a gap of about 25 units on a 1000 grid, so the V reads as two strokes meeting. The play floats in the top of the opening, its top a little above the arm tops, clear of both arms. Sharp corners everywhere, flat fills, no gradient, no outline.

Rafa drew it by hand in Figma on 2026-10-08 (pen tool, typed point coordinates, a Boolean subtract for the cut), from concept 1 ("V + play") of an AI ideation round he ran the evening before. The class forbids AI-drawn logos, so the drawing itself is his and the class file's version history shows it; the board's AI acknowledgement says where AI helped (the concept round, the coordinates, the board layout, the first draft of the copy). The four-color logo concepts in [assets/logos](../private/design/assets/logos/README.md) are retired.

Colors in the mark:

- On white: V `#006822`, play `#80B491` at 73% opacity (as drawn).
- On the brand green and other dark grounds: V `#FFFFFF`, play `#CDE8D3`.
- On black in dark mode: V `#009B37` (the dark-mode lift from decision 29), play `#80B491`.

At 16 px the play disappears into a dot and the V carries the mark; nothing smaller than 16 px.

## The app icon

The brand green tile with the white V and the pale play, the mark at 63% of the tile's height, centered. Rafa singled it out to keep ("the app icon with the green background looks awesome"). `app-icon-1024.png` is the App Store master: 1024 square, no rounded corners and no transparency, because iOS applies its own mask. The rounded tiles on the board are previews.

## Wordmark and lockup

"Verso" in Inter Semi Bold, tracking -2%, in `#006822`. In the lockup the mark sits left of the word with a gap of half the mark's width, the apex on the text baseline.

## Color and type on the board

Four colors on white, the class's rule: Verso green `#006822` (base, buttons, active state), play tint `#80B491` (accent, the play in the logo), light grey `#F2F2F7` (cards and surfaces), dark grey `#6E6E73` (secondary text). Inter only, in Bold, Semi Bold and Regular.

## Voice and key message

The words below are Rafa's as approved on the board (his dictation, recorded minus filler; the tagline and chips were drafts he kept unchanged).

- Tagline: "See if it's worth it before you press play."
- Paragraph: "In an age of AI, the most valuable resource is human time. Verso learns your taste from the movies you rank and watches movies in seconds with your point of view. It makes personalized recommendations based on what it thinks you would like, so you never waste your time."
- Voice: Direct, Personal, On your side.
- Subline: "Rank what you watch, and Verso finds what's next."

His two corrections, which hold for all Verso copy: lead with what the AI does for the person (it watches the film with their point of view and recommends), not with the ranking mechanic, and never say "two at a time" ("it sounds kind of dumb"); and a surface that shows recommendations is labelled as recommendations, never in words that read like the person's own list.

## Touchpoints on the board

A 14:48 freeway billboard (mark and tagline on the green), the marketing-site hero with the movie compare stage (Dune: Part Two against Interstellar), the app icon on an iPhone home screen, and movies Home (design H, branded, with TMDB posters). Rafa chose movies over games for the published version because they are more relatable.

## Not done here, for the Verso session

1. Record the logo and the app icon as a decision in `ROADMAP.md`, dated, and point `CLAUDE.md`'s "Where things are" at this file.
2. Movies Home design H (143:173 on `Structure round · movies`) still titles its first row "You wanted to watch these". Rafa's correction says it should read as recommendations; the board used "Based on your rankings" because "Recommended based on your rankings" did not fit beside "See all".
3. Replace the placeholder `VersoMark` in the app and the site's typeset-V slot (nav, favicon, share image) with `verso-mark.svg`, and set `app-icon-1024.png` as the Expo app icon. **Done 2026-10-08** in #82 (the app, the icons, the splash, the holding page's favicon) and #81 (the site).
4. Retire the four-color concepts in `assets/logos/` and the `medium/*` remnants if any remain.
