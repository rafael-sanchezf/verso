# UI brief: the first screens

Written 2026-09-15 as the starting point for the design discussion. The idea: agree on what each screen has to do and what you care about, then Claude drafts two or three structural variants per screen in Figma, you react, and the winners get a visual direction applied. Answer inline, in bullets, or by voice memo; short is fine. Each question has Claude's default so silence means "go with the default."

## Proposed process, three rounds

1. **Structure round.** Grayscale, real layout, placeholder type. Two or three variants per screen, differing in what is on screen and how the interaction flows, not in color. React to structure only. No name needed yet.
2. **Direction round.** Once the name exists, two or three visual directions (color, type, corner radius, density, light and dark) applied to the winning comparison screen only. Pick one.
3. **Fidelity round.** The chosen direction applied to every winning structure, components extracted, tokens exported to `packages/tokens`. Then implementation starts.

Reason for splitting structure from direction: reacting to three variants that differ in both layout and color makes it hard to tell which you are reacting to, and the name changes the identity anyway.

## Home screen direction (Rafa, 2026-09-15)

Recorded as stated, before critique. See the "Home screen: agreed refinements" section below for what changed in discussion.

- Every medium gets a color: games green, books a warm Apple Books orange-yellow, movies blue, TV purple. Colors are provisional.
- The home screen is per medium. The top of the screen names the medium in its color, with a small icon of the neighboring medium on each side in that medium's color. Swiping left or right moves to the neighbor, endlessly around the loop of four. This switcher is the heart of moving between media and should be designed with care.
- Each medium's home is tailored, not a shared template. Build games first, but with the end state of four homes in mind.
- Rule of three for the games home: currently playing (one big tile), then the backlog as a queue of the next three or so games in order, then upcoming releases from the wishlist. The developer feels strongest about currently playing and backlog. Wishlist and "coming soon" are different lists (a wishlist can hold released games not yet bought); the third block should highlight upcoming releases.
- Principles to follow: rule of three, and what the two design courses cover, with Krug's "Don't Make Me Think" as the current reading.



Beli's product is a rating flow plus two lists plus a detail page. Ours is the same shape.

## Home screen and navigation: decisions (2026-09-15)

Outcome of the discussion. Numbers refer to the pushback list that was here; the list itself is in git history.

Decided:

- **Medium is a global mode with hard walls.** The app is always in exactly one medium. Every tab shows only that medium. Cross-media ranking and cross-media features are deliberately minimal. (Pushback 1, agreed.)
- **Media switcher: a tap row, not a swipe.** At the top of Home, all four media icons are visible in their colors. Tapping one morphs it into the medium's name with a smooth animation; the previously active one shrinks back to its icon. No horizontal swipe anywhere for switching media, so iOS edge-swipe-back and in-page horizontal lists keep working. (Replaces the endless-swipe idea; pushback 9 agreed.)
- **Bottom tab bar** for the main destinations: Home, Ranked, Backlog, Wishlist. Tab icons are drawn per medium (a controller for games, a film reel for movies, and so on), so the bar itself reinforces the mode. Where Search lives is still open (see below).
- **Colors stay as proposed:** games green, books Apple Books orange-yellow, movies blue, TV purple. (Pushback 10 declined; icon plus label is still used everywhere, so color is never the only signal.)
- **Multiple currently-playing games** on Home: one hero plus smaller tiles. (Pushback 5, agreed.)
- **V0 ships one medium.** The other three slots in the switcher exist as quiet placeholders, whichever treatment looks cleanest; placeholder data is acceptable in design. (Pushback 4, agreed.)
- **Empty and logged-out states are designed screens.** Logged out: a simple sign-in or create-account screen (email only in V0). A richer "suggest some games first, then sign in" flow is a later idea. Each home block gets an empty state. (Pushback 6, agreed.)
- **Header is compact after the first glance:** large colored title that collapses on scroll. (Pushback 8, agreed.)
- **Wishlist is its own status and its own tab.** The Wishlist tab toggles between not yet released and already released. Home's "Coming up" block shows only wishlist items that are not yet released, ordered by release date. Backlog stays "things I can play now." (Pushback 7, agreed, with the split defined.)

Held, not decided:

- **Same skeleton across media** (pushback 2). Not settled, and should not be. Home should show what is most relevant per medium, which may differ in structure, not just wording. Example: movies probably have no backlog; a movie home might lead with a suggestion feature instead. Movies are far off and the suggestion feature needs real tech behind it, so this waits until games are done.
- **Primary action on Home into the log flow** ("Finished? Rank it", pushback 3). Held until the app is in daily use and the need is visible.
- **Testing with three people** (pushback 11). Not discussed; still recommended after the structure round.

Settled later the same day (2026-09-15):

- **Search is a tab**, placed toward the left because it is one of the most used destinations.
- **Backlog and Wishlist merge into one tab**, working name "What should I play next" (short label to be chosen: Next, Up next, Queue). Backlog and wishlist remain separate statuses in the data; the tab shows them as two modifiers or segments of one view, with the wishlist half split by released / not yet released.
- **Bottom tabs for games:** Home, Search, Ranked, Next, Profile. Exact order is a structure-round variant; Search sits left of center.
- **Media switcher lives only on Home.** A lighter escape hatch on other tabs may come later; not now.
- **Tab sets may differ per medium.** Decided yes.
- **Per-medium icons apply to both rows:** each medium has its own icon in the top switcher, and the bottom tabs also get medium-specific icons.

Consequences noted when this was settled (kept for the record):

- Where Search lives. It is how every item enters the app. Options: a fifth tab (iOS allows five), a search button in every tab's header, or both.
- Whether the media switcher appears only on Home, or as a compact persistent row on every tab. With hard walls between media, switching from inside Ranked or Backlog may be common.
- Whether the tab set itself may differ per medium (movies without a Backlog tab), given that it already differs in icons. Krug's persistent-navigation rule argues for a stable set; the per-medium relevance argument pulls the other way. Can wait until movies are real.
- The catalog stores only a release year today. "Coming up" ordering needs the full release date, which means a small catalog change and migration (see the roadmap work queue).

## Structure round, reactions (Rafa, 2026-09-15)

- **Home, Playing:** variant A (hero card plus two small tiles).
- **Home, Up next:** variant B (numbered cards that slide sideways).
- **Home, Coming up:** variant B (date-led list, month and day as the leading element).
- **Media switcher:** variant C, the large title on the left with the other three media as small icons on the right, provided the animation is clean: tapping an icon morphs it into the medium's name on the left while the previous name shrinks back into its icon. Fallback if the animation cannot be made clean: variant B's four segments without the gray track behind them.
- **Signed out:** variant B, the cover wall, but as a collage: fewer, bigger covers in varied sizes (three by three or three by four), showing the top games people are playing, with the bottom sheet as drawn.
- **Next step:** the same treatment for the remaining tabs, Search, Ranked, Next, Profile, with a Beli-styled variant as one option for each, adapted to this product.

## Structure round, part 2: specs (Claude, 2026-09-15, to build when Figma's tool-call cap clears)

Grayscale, same rules as part 1. Each screen gets a note above it. "Beli-style" means the pattern Beli uses for the equivalent screen, adapted to games; see docs/research/beli-ranking-algorithm.md for what is confirmed about Beli's screens.

**Home, composite.** One screen assembling the picks: switcher C (large "Games" title left, three small medium icons right), Playing A (hero card plus two small tiles), Up next B (numbered cards sliding sideways), Coming up B (date-led list). Plus a second frame showing the switcher mid-transition (icon halfway to word) so the morph can be judged as a Smart Animate prototype.

**Signed out, collage.** Variant B with a 3-by-4 collage of covers in three sizes (large 2-by-2, medium, small) filling the top two-thirds, labeled "What people are playing", and the bottom sheet as drawn.

**Search A, Beli-style.** Search field pinned at the top with a cancel affordance. Below, "Recent" as plain rows, then "Popular this week" as rows with cover, title, year, platforms, and a trailing plus to add to Next without opening the page. Results state uses the same row.

**Search B, Explore-first.** Search field at the top, then a browse surface: "New releases" as a horizontal cover row, "Top rated" as a numbered list, genre chips. Results replace the browse surface when typing.

**Ranked A, Beli-style list.** Filter chips (All, genre, platform, year). One continuous list ordered by rank: rank number, cover thumb, title, year and genre line, score badge on the right tinted by tier. Tier changes marked by a thin colored divider, not headers. Long-press drag handle hinted.

**Ranked B, Tier sections.** Four tier sections with headers and counts, each a list of rows with position number and cover; score shown small at the right. Collapsible sections.

**Ranked C, Poster grid.** Three-column cover grid ordered by rank with a small rank badge on each cover and the score on tap only. Tier as a subtle colored top border on each cover.

**Next A, Segmented.** Segmented control at the top: Backlog | Wishlist. Backlog: rows with cover, title, platform, time to beat, sort menu (added, release, time to beat). Wishlist: a second toggle Not yet released | Released, rows carrying a release date.

**Next B, One queue.** No segments. "Up next" pinned top three with a drag hint, then "Later" for the rest of the backlog, then "Wishlist" as a section with released and unreleased mixed and dates on the unreleased.

**Profile A, Beli-style.** Avatar, display name, handle, stats row (Ranked, Next, Wishlist, and a Friends slot reserved), a "Share my top 10" action, then recent activity rows. Settings gear top right.

**Profile B, Minimal for V0.** Avatar and name, stats row, settings list (account, email, notifications later, sign out), no activity. Honest about the social layer not existing yet.

**Comparison flow** (the core loop) is next after these: tier picker sheet, comparison screen with two covers and the prompt, confirm placement strip. Two structural variants of the comparison screen: side by side, and stacked.

## Structure round part 2, reactions and decisions (Rafa, 2026-09-15)

Decided:

- **Signed out:** collage stays; the covers extend behind the sheet and the sheet is translucent so games show through.
- **Search:** A (Beli-style). Genre and date filters appear after a query, not as a browse surface. Search is for finding a specific game, usually one you just played. Discovery ("give me something to play") is a separate future feature, not Search.
- **Ranking:** A (Beli-style list). The tier divider becomes a labeled rule: the line stops, the tier name sits in the gap, the line continues, so everything below it reads as that tier. Add a grid toggle (a small four-squares icon under the header) that opens the poster grid view (C), which should zoom out to a whole-collection wall and be shareable, in the spirit of Pokémon TCG Pocket's collection. Header reads "Ranking," not "Ranked."
- **Next:** A (segmented), reluctantly; B rejected. Backlog is user-ordered by long-press drag. Rows need an information hierarchy for when hours played are unknown (see below). The segments get their own icons. Second segment is renamed away from "Wishlist" (working label: Want to play), split into Available and Upcoming instead of Released and Not yet released. Header is a question, not the tab word. From either list, one tap on a game starts it ("I'm starting this").
- **Profile:** A (Beli-style). Recent activity shows rankings only, not backlog or wishlist changes. The stats row links to Ranking and Next. A Friends area (list, what they are playing, a taste-similarity score) comes with the social phase.
- **Log a game:** Compare A (side by side) for now, to be validated in use; the two cards must be identical in size regardless of title length. Confirm placement is loved and kept. The tier sheet is rejected as drawn: a bottom sheet with an empty top reads as unfinished. Redesign it.

Backlog row information hierarchy (proposal, to confirm): line one is title; line two is platform plus time to beat (available for most games from the catalog); line three is the first of: hours played (Steam or manual), "Started {date}" (the day the game moved to Playing), "Added {date}". Never show an empty hours field. "Purchased on" needs data we do not have, so it is not in the hierarchy unless entered by hand.

Open, to resolve in the next round:

- Tier step redesign. Two candidates to draw: (1) a full-screen first step in the same shell as the comparison screens, big cover on top, four tier buttons, progress dots counting it as step one; (2) inline on the game page as a four-way control under "I played this," with Continue leading into comparisons.
- Header wording for Next. Rafa suggested "What are you playing next?"; at large-title size that wraps to two lines. Candidates: "Up next," "Play next," "What's next."
- Whether the collection wall's zoom and share are V0 or later. Proposal: grid toggle in V0, zoom and share image in V1.

## Round 3 focus: getting games in and interacting with them (Rafa, 2026-09-15)

Decisions from the pushback: "Up next" is the Next header; "Want to play" stays; the tier step is a bottom sheet over the game page that expands to full screen on tap and runs the comparisons inside; playtime, started, and purchased dates are hand-enterable and the row hierarchy is held until usage; collection wall is V1; suggestion feature is V1; one more Figma round before code.

The game page is the center of this round. Requirements: box art large with the title under it; critic and player scores (labeled by source); platforms the game is on, with the ones you own marked; hours played when known; release date; a big primary button "I finished this"; secondary ways to change status. Other entry points: long press on Home's Playing tile for a quick "finished" (tap opens the page); the plus on a Search row opens an add-to sheet (Backlog, Want to play, Playing, Played). Menus and sheets that appear on tap are part of the design, not an afterthought.

Data implications: `owned_platforms` per user entry (which platforms you have it on), `purchased_at` optional, `started_at` (already queued), manual `playtime_minutes` (exists). Critic and player scores come from `external_scores` by source.

Built 2026-09-15 for reaction: Game page A / B / C, tier sheet v2 (sheet and expanded states), Home long-press menu, Search add-to sheet, and the four revisions (Next A v2, Ranking A v2, Compare A v2, Signed out v2). All on the Structure round page, rows six and seven, with notes above each frame.

## Round 3 reactions and decisions (Rafa, 2026-09-15)

- **Game page: B.** Changes: Critics and Players both labeled Metacritic (see the data caveat below); Steam reviews as a phrase for Steam games only; the "You" score hidden until ranked; games use "Add to backlog" and "Backlog"; empty personal fields hidden, with a plus next to Details to add purchased date, hours, and the like; time to beat shown as one figure with the other two behind a tap (proposal: "~25 h · up to 40 h to 100%"); Platforms shows every platform the game is on, checks mark the ones you own it on; "I have this game" is a first-class action there, independent of status.
- **Tier sheet v2: keep.** Tier colors must not be the medium colors; a tier palette comes in the direction round.
- **Expanded compare state: keep the tier chip and the progress count together.** Center the cards lower on the screen, pull the top elements up, bring the escape hatches up under the cards. Add a genre cue and a genre-specific prompt when the pivot shares a genre ("Which RPG did you enjoy more?").
- **Home long press:** Mark as finished, Log hours, Move to backlog. Drop Open game page (a tap does that).
- **Search add-to sheet: good.** Ownership needs a place in it.
- **Next tab: A v2 does not work yet** because Backlog and Want to play mean the same thing. New model: Backlog holds every released game you intend to play, owned or not; the second segment is Upcoming (unreleased). Drag handle is essential; the play button stays; the row is slightly cluttered.
- **Ranking A v2: exactly right.** Score badges get a gradient across the tier palette, as Beli does.
- **Signed out v2: good.**

Data caveat to resolve: Metacritic's user score has no legitimate source (no API; scraping is forbidden by its terms). Options: label Players as IGDB's user rating, or as Steam's review percentage for Steam games, or show Metacritic critics only. Decision pending; see research in docs/research/game-data-sources.md.

Next session, in order: revise Game B, the compare screen, and Next with the points above (structure); then the direction round on Home, Game B, and Compare: the unified color treatment, the tier palette, the logo that carries all four colors and shifts per medium; then the fidelity round; then code. Plumbing (auth, data hooks) can be built unattended before that.

## Structure fixes and the direction round, built (Claude, 2026-09-16)

Structure round page, row eight, one note above each frame: Game B v2 · revised, Log · expanded v2 · compare inside sheet, Next v3 · Backlog, Next v3 · Upcoming, Home · long press v2, Search · add-to sheet v2. Every point from the round 3 reactions is drawn. Two details to confirm: the genre prompt is 22px so "Which platformer did you enjoy more?" fits one line, and the single time-to-beat figure is "~25 h ›" with rushed and 100% behind the tap.

Direction round page: three rows, one per direction, each applied to Home, Game B v2, and the expanded compare, with real IGDB cover art and the games-state logo mark in the switcher. A dark-mode Home sits at the right of each row. Row four: the tier palette board (four chips in light and dark; the score-badge gradient with hard stops at the tier band edges 4.0, 6.5, 8.5), the Ranking A v2 frame with badges colored continuously across the palette, and the logo board (v-bars, tiles, ring; all-media and games-active states, sources in assets/logos). The color math and contrast checks are in [direction-round-prep.md](../private/design/direction-round-prep.md). Claude's recommendation: Ink and accent, with Harmonized as the runner-up; Metallic needs the light and shadow only the fidelity round could add.

Reactions (Rafa, 2026-09-16): row eight is right, with one change to the compare screen, now applied: prompt, cards, and hatches form one stage with small gaps, cards centered on the phone's midpoint. Tier palette and gradient badges: keep exactly as drawn. Logo: a V carrying the four colors appeals, but a dedicated logo session comes later; nothing locked, the v-bars mark stays a placeholder in the switcher. Direction: undecided, leaning Harmonized. Defaults accepted: prompt wording, score display, "Upcoming", the single time-to-beat figure.

Metacritic recommendation (Claude, 2026-09-16): Players is Steam's review phrase for Steam games and IGDB's user rating otherwise, each labeled by source; Critics is Metacritic where Steam licenses it, otherwise OpenCritic or IGDB's aggregate, labeled. This is what Game B v2 draws. Decided 2026-09-16 (Rafa): Players is Steam's review phrase. OpenCritic noted as a later critic source through its official API, and Steam concurrent players requested for the game page.

## Fidelity round, built and approved (2026-09-16)

Fidelity round page: the fourteen winning screens (Signed out, Home, Search, Search add-to sheet, Game page, Home long press, Log tier sheet, Log compare, Log confirm, Ranking, Ranking grid, Next Backlog, Next Upcoming, Profile) in light, and the same fourteen in dark below them. Every color is a variable, so the Harmonized working assumption can be swapped for another direction by changing values. Real box art from IGDB, Lucide icons in the tab bar, switcher, and glyph slots, the tab bar as a component with five active states, the tier palette on the tier sheet and Ranking, and the compare layout as approved.

Reactions (Rafa, 2026-09-16): approved. Home, Search, the long press, the tier sheet, the confirm step, Ranking, Profile, and the dark set as drawn ("dark mode is looking pretty sharp"); Harmonized confirmed by approving the frames as drawn. Changes, now rules 29 to 33 in [ui-principles.md](ui-principles.md) and coded from the specs: Signed out loses "What people are playing" and the headline, the wall bleeds off the top of the screen, and once other catalogs have covers it shows the medium in view or cycles through the four in the switcher's order (games, books, movies, TV); box art is never cropped anywhere (fetch a differently shaped asset if a slot needs one); every cover gets a subtle edge so dark art (Outer Wilds) does not merge with the dark canvas and white art with the light one; the active tab is marked more strongly than a weight change; on the game page "I have this game" drops any "on these platforms" wording, platforms are glyphs rather than words ("Nintendo Switch 2" takes too much room; full names stay in the Ranking platform filter and the platforms sheet), and ownership shows up to three glyphs in line, none past three, the tap opening the full list; the compare step shows dots at the top with the tier label under them instead of "1 of 3"; Next's segment squares are icons (the code already draws `layers` and `calendar`). Still open by design: the logo, tier icons, per-medium tab icons, and the Profile avatar.

## States round, built and approved (2026-09-16)

The first-run and empty states the fidelity round left undrawn, on the Fidelity round page below the dark set (light at y 4200, dark at y 5220, a note above the row). Sign-in steps are not here: decided the same day that the whole sign-in flow is built plainly, with Google login joining email (specs/signed-out.md).

- One pattern, `EmptyState`, as a component on the Components page: icon 32 in `text/secondary`, title 17 semibold, one line 15 `text/secondary`, centered, and an optional primary small button for the one thing to do next. Inside a `bg/surface` card when it stands in for a block (Home, Profile); bare and centered in the list area when it stands in for a whole list (Search, Ranking, Next). iOS's own ContentUnavailableView is the same shape (rule 7); the button is green because it is the only action on the screen (rule 10).
- Home, Playing empty: "Nothing playing", "Start a game from your backlog.", "Pick from backlog" → Next. The everyday between-games state; Up next and Coming up unchanged.
- Home, first run, two variants: A is a dedicated card (title "Add your first game", three step rows with the Search, Ranking and Next icons, "Add a game" → Search) and nothing else on the screen; B is the block titles in place with an empty card under each (Playing without a button, since the backlog is empty too; Up next with "Search games") and Coming up hidden. Claude's lean: A, because B shows two dead cards on the first screen a new user sees, and A doubles as a tour of the tab bar.
- Search, no results: the typed query with a clear icon, "No games match “silksnog”", "Check the spelling or try a shorter title.", no button.
- Ranking, empty: filters and the view toggle hidden, "Nothing ranked yet", "Finish a game and rank it from its page.", "Find a game you've played" → Search.
- Next, Backlog empty: sub row hidden, "Your backlog is empty", "Add games you want to play from Search.", "Search games". Upcoming empty: "Nothing upcoming", "Unreleased games you add land here.", no button.
- Profile, empty: counts at 0, "Share my top 10" hidden (rule 20), a "No rankings yet" card under "Recent".

Reactions (Rafa, 2026-09-16): the empty states are good as drawn, dark included. First run: no explicit pick, so it stays as built (B) until he says otherwise; the Playing-empty card keeps "Pick from backlog"; "Share my top 10" and the Ranking filters hide on empty as drawn. A later idea, not drawn: a Beli-style first run that shows popular games to add in one tap, once adding needs no status choice.

## Media structure round (Claude, 2026-09-16, awaiting reactions)

Movies, TV, and books drawn at structure level on the Figma page `Structure round · media`, one row per medium: two Home variants, the detail page, the Next tab, a rows board, and for TV a seasons screen. The information decisions (what a film, a series, and a book page show; what replaces Playing, ownership, and time to beat in each medium; which scores can be shown honestly; awards as a fact) are in [media-brief.md](media-brief.md), with ten questions for Rafa and a default for each. The short version: movies lead Home with a "Tonight" pick from your list filtered by your streaming services; TV keeps the games skeleton with a season-and-episode pointer and a seasons screen; books keep ownership by format and add a page pointer; IMDb is not drawn (licensing), TMDB's score is, and awards get their own line.

## The screens to design for V0

Beli's product is a rating flow plus two lists plus a detail page. Ours is that plus a Home with the media switcher, a Wishlist tab, and the signed-out screen. In the order the structure round takes them:

0. Signed-out screen (email sign-in or create account) and the empty states of every block.
0b. Home: media switcher row, large collapsing title, the three blocks (Playing, Up next, Coming up), with two or three structural variants.
0c. Wishlist tab with the released / not released toggle.

Then the four below.

### 1. Log a game (tier picker, comparisons, confirm)

One flow, three steps, launched from a game's detail page or from search. This is the product.

- Tier picker: four tiers, loved, liked, fine, did not like. Q1: full-screen step with big targets, or a sheet over the game's page? Default: sheet over the game page, so the cover stays visible.
- Comparison: the new game versus one already-ranked game, one fixed prompt, two escape hatches. Q2: two covers side by side (Beli style) or stacked top and bottom with the prompt in the middle? Default: side by side in portrait, tap a card to pick. Q3: should the escape hatches be visible buttons under the cards or a smaller text link, given they should be rare? Default: one row of two small secondary buttons. Q4: progress indicator ("2 of about 4")? Default: yes, subtle dots. Q5: prompt wording. Candidates: "Which would you rather play again tonight?", "Which did you enjoy more?", "Which is the better game?" Default: "Which did you enjoy more?"
- Confirm: "lands between X and Y, look right?" with nudge up and down. Q6: show three rows (neighbor, new game highlighted, neighbor) or a short strip of five? Default: five rows with the new game centered, so context is visible.
- Q7: what animation matters most: the card choice, the insertion into the list, or the score reveal? Default: the insertion, since it is the payoff.

### 2. Ranked list

Your ordered games, with the derived 0-10 score. Q8: default grouping by tier with headers, or one continuous list with tier shown as a chip? Default: grouped by tier. Q9: how prominent is the number? Options: big score at the right edge of every row, small score, or rank position only with score on tap. Default: small score at the right, rank number at the left. Q10: filters (genre, platform, year) as chips above the list or behind a filter button? Default: horizontal chips. Q11: reorder by long-press drag, always, or in an explicit edit mode? Default: long-press drag always. Q12: row content: cover thumbnail, title, year, genres? Default: cover, title, year, small genre text.

### 3. Backlog

Want-to-play list with status. Q13: one list with a status segment (backlog, playing, played, dropped) or separate tabs? Default: one screen, segmented control at the top, backlog selected. Q14: sort options: date added, release date, time to beat. Default: date added, with a sort menu. Q15: a "play next" nudge at the top, or leave that for V1? Default: leave for V1, but reserve the slot. Q16: is Playing a distinct top section ("currently playing" hero) or just a filter? Default: a small "currently playing" strip above the backlog.

### 4. Game detail and search

Search is how everything enters. The detail page is where you set status and start the log flow.

- Search: Q17: a search tab, or a search field at the top of backlog and ranked? Default: a dedicated search entry point in the tab bar; results as rows with cover, title, year, platforms. Q18: should a result row let you add to backlog in one tap without opening the page? Default: yes, a small plus.
- Detail: cover, title, year, developer, platforms, genres, summary, your status, your rank and score if ranked, buttons for "add to backlog" and "I played this" (starts the log flow). Q19: how much V1 data to reserve space for now (critic scores, playtime, time to beat, where to play)? Default: reserve one row of stat tiles and leave it empty in V0. Q20: hero layout: large cover with blurred backdrop (common in game apps) or a compact header with the cover at the left? Default: compact header; the blurred-backdrop look is a direction-round question.

### Navigation shell

Falls out of the above. Q21: tabs, and how many? Default: three tabs, Ranked, Backlog, Search, with profile behind a top-right avatar until the social layer exists. Q22: light and dark from day one? Default: yes, both, dark first since it is what game apps and Beli users expect at night.

## What you care about overall

- Q23: three apps whose feel you want to be near, and one you want to avoid.
- Q24: density: airy and editorial, or dense and information-rich?
- Q25: is the cover art the hero of every screen, or is typography? Default: covers.
- Q26: anything from Beli you specifically want to keep or avoid?

## Media structure round: Rafa's reaction (2026-09-22)

His first interaction with the movies, TV, and books frames of `Structure round · media`: a lot of it was built by reusing the games UI elements, with the other media not treated as their own products that may not want the same features. In general it looked good. Asked what Claude would concede, Claude listed eight transplants (the movie queue, "I finished this" on a returning show, watched implying ranked, the diary behind a plus, hours for TV, a single-player movie Home, TV Home led by the show for parity, identical tabs) and what it would defend (where to watch, the Watching hero, Coming up, the cast row, the ranking loop).

Rafa's answers, recorded in full in [movies-brief.md](movies-brief.md) and as rules 34 to 38:

- Agreed with every point but one: TV keeps its total hours; seeing how long a whole show takes is useful.
- TV's ranking unit is an open question he pinned: per season (his lean, with the show's score entered by hand or averaged from its seasons), per episode (heavy for long series), or the whole show. TV holds until it is answered; books hold with it (inferred).
- Movies Home is functional, not informational: "What do you want to watch today?" with filters, because you use the app to find the next movie while sitting on the couch, whereas when you want to play a game you just play it.
- Streaming and theaters are separate: a watchlist for what you will stream, a calendar for the theatrical releases you care about, and a date you set when you have tickets.
- Scope: rebuild only the movies piece, and movies are the only medium beside games in V0.

The movies round is redrawn on the page `Structure round · movies`; the ten questions with defaults are at the end of the movies brief.


## Bulk entry round: Rafa's reaction (2026-10-06)

By voice, on the thirteen frames of `Structure round · bulk entry` (93:2). Decoded in full in [../feature-ideas.md](../feature-ideas.md#1-bulk-entry), third pass; the ten questions with defaults are there.

- Platforms: neither A nor B as drawn. Families first, then the generations of the families tapped, plain names (`PS5`, `PS4`), and backward compatibility assumed, never shown or unticked.
- Seed games: yes, as drawn.
- Deck: B, the list, because ten at once invites "I played this, I played this" where one at a time invites "no, no, no". The "Want to play" answer goes; the deck asks one thing per game.
- Ownership is out of the product, everywhere, not only here (decision 26): the app tracks what you have played and what you are thinking of playing; owning is "a collector's app".
- The review ("Look right?"): liked, twice.
- The compare step: agreed as explained, but batched into one session after the page, with an optimized number of questions rather than three per game; the arithmetic is in [ranking-algorithm.md](ranking-algorithm.md#the-batch-session-2026-10-06).
- Account links at the end, inferred from the platform answer, never a second question. Steam is the only link that can exist (the research of 2026-09-25); the screen shows it to PC players and is skipped for everyone else.
- The last three frames (the banner, the doors, "Add many"): liked as "name the games you know you played and haven't ranked"; the implementation is the same session over played-not-ranked games.
