# iPhone Duo brief

Proposed 2026-10-21 from Rafa's ask of that day: build the iPhone Duo versions of the screens, with the controls on the right of the outer display and, on the inner display, the things the phone stacks vertically laid out side by side, the Playing block bigger on the left and the rest on the right. This document is the plan: the device as measured, what Apple gives for free and what this codebase gets of it, the layout model, the column, the two-pane screens, what waits on Rafa, and the pull requests. The research behind it is [docs/research/iphone-duo.md](../research/iphone-duo.md); Apple's page is [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo) (2026-09-09). The card is VER-257.

## The device, measured

Read on the iPhone Duo simulator of Xcode 27.1 (iOS 27.1, the only runtime the device type accepts) on 2026-10-21. Apple publishes no point table; these are the simulator's numbers, so the code treats them as readings, never as constants.

| Display | Points | Width class | Where iOS puts its bars |
|---|---|---|---|
| Outer, closed | 466 by 678 | compact | the right edge, under the status bar and the camera |
| Inner, open, portrait | 669 by 951 | regular | the bottom, as on any iPhone |
| Inner, open, landscape | 951 by 669 | regular | the right edge |
| Inner, Split View, one pane | about 475 by 669 | compact | the right edge for the right pane, the left edge for the left one |

- The column iOS reserves on the right is about 84 points wide. On the outer display it holds, top to bottom: the time, the Wi-Fi and battery glyphs with the camera under them (the top 160 points or so), the app's controls, and the home indicator. Safari puts its back and bookmarks buttons at the top of that band and its new-tab and tabs buttons at the bottom. The window reports it as a trailing safe-area inset of 84 with a top inset of 0; the inner display in portrait reports a top inset of 82 and no side inset.
- The scale is 3. The outer display is 1398 by 2034 pixels, the inner 2007 by 2853.
- Closed, the device is a squat phone: 466 wide against the iPhone 17 Pro's 402, and 678 tall against its 874. Every phone layout fits; what changes is the bar.
- Half open, the fold is a reserved region down the middle of the inner display, or across it in the laptop pose; flat, it has zero width. Apple gives no number for it. Two panes that meet at the middle survive it; a control across the middle does not.

## What Apple gives for free, and what this codebase gets

Apple's claim that the Duo is easy holds for apps built from UIKit's and SwiftUI's own containers. Verso is Expo, and the shell is drawn, so the gift is partial:

- **The scene life cycle is already in.** Apps built with the iOS 27 SDK must adopt it or they fail to launch, and `plugins/with-ios-scene-lifecycle.js` did that in #22. The app builds and runs on the Duo simulator today.
- **Full screen needs the iOS 27.1 SDK.** Built with anything older, the app keeps to the left of the status column on the outer display and sits in a familiar-sized box on the inner one. This Mac has Xcode 27.1; EAS builds pin no image and would use Xcode 26 until `eas.json` says otherwise (PR 4).
- **The tab bar gets nothing.** iOS moves only the bars it owns. `TabBar` is a drawn row of Pressables, so the column is ours to draw (below). Expo Router's JS tabs do take `tabBarPosition: 'right'`, which keeps the screens clear of the column; the column itself is drawn once at the root, over everything.
- **The native stack headers may move on their own.** The game page, the movie page, Settings and the rest use react-native-screens' native headers, which are UIKit navigation bars; what they do on the outer display is checked on the simulator in PR 1 and recorded here.
- **The sheets are the system's.** The five form-sheet routes and the alerts move clear of the fold without help. The in-screen `Sheet` and the web `Dialog` are drawn and are checked in PR 4.
- **The fold is not readable from React Native 0.86.** The only library, `react-native-reserved-regions`, needs the New Architecture and was tested on 0.88. V0 does not read the fold; it avoids it by shape (two panes that meet at the middle).
- **The portrait lock is a preference on the inner display.** iOS does not rotate the app to honor it there; it resizes the app into whatever space the pose gives. The screens must survive 466 by 678, 669 by 951, 951 by 669 and a half-width pane whether or not the lock stays.

## The model

`src/lib/layout-model.ts` holds the rules; `src/lib/use-layout.ts` reads the window and the safe area and asks them. Two questions, asked separately:

- **How wide is the window?** `compact` under 600 points, `regular` from 600, `wide` from 1024. The web brief's two widths stay where they were (decision VER-110, 1024); the Duo adds `regular` between them, because its inner display at 669 is too wide for a phone's single column and too narrow for the web's sidebar. The web gets the class as a side effect: a browser between 600 and 1023 wide, a tablet, lays out as the inner display does.
- **Where is the tab bar?** `bottom`, or `side` where iOS has moved its own bars: a top inset of zero with a trailing inset of 48 or more, on iOS only. A phone in portrait has a top inset and no side; the inner display in portrait has a top inset; the outer display and the inner one in landscape have no top inset and an 84-point side. The left pane of Split View reports no inset on either side and gets a bottom bar, which is the one case the signal misses; a native read of UIKit's `verticalBarEdge` trait, a twenty-line Expo module, replaces the heuristic if that pane matters.
- **How wide is the content?** `useContentWidth()`: the window, less the column when the bar is on the side. The column math on Home's Playing cards, the Ranking grid, the movies row pages and the Watchlist grid divides this, never the window. Screens outside the tabs (the stack) get the same clearance as a padding on the root stack's content; the tabs screen alone takes the whole window, because its rail is what fills the column.

The window is read from the safe-area frame rather than `useWindowDimensions`: the frame is layout-driven, and under the scene life cycle React Native 0.86's window events are not confirmed to fire when the device folds.

## The column

The outer display, and the inner display in landscape. Rafa's reaction to the first cut (2026-10-22): moving the five tabs to the side and leaving everything else where it was looked lazy and unnatural, the hairline made the column read as something beside the screen rather than part of it, and the screen's own controls, the media switcher first, belong in the column too. The cut that shipped copies what the system draws for its own apps, measured on a native probe on the simulator and on Safari and Settings ([docs/research/iphone-duo-column.md](../research/iphone-duo-column.md); the probe's captures sit beside Verso's in the private screenshots folder):

- **The column is the page.** No edge, no fill of its own: the page's background runs to the screen's right edge. Apple's kit splits the 84 points as 12 inside, 48 of control, 24 outside, so every capsule is 48 wide at 12 from the content's edge. `ui/side-column.tsx` draws it once at the root, over every screen.
- **Two glass capsules**, `bg/surface` with a soft shadow, each a column of 48-point cells; a capsule with one cell is a circle. The selected cell gets a 44 by 58 `bg/canvas` pill behind a `brand/text` icon, the segmented control's own idiom stood on end.
- **Top capsule: the screen's own controls**, its top edge 173 points down, under the clock, the glyphs and the camera, where the system puts the first control. A screen hands its cells to the column with `useSideColumn()` while it is the one in front and leaves its horizontal slot empty: Home's other media and the "+" (the active medium's word stays on its row, alone, as brand-build.md wants it); Ranking's list and grid cells with the current one selected; Profile's settings; a game or film page's overflow. On a pushed page the native Back that UIKit already moved into the column is its own circle at 173, and the capsule starts 59 lower. Text-based controls stay horizontal, the HIG's rule and Apple's answer on segmented controls: the medium chip, Next's segmented control, Ranking's filter chips, Search's field.
- **Bottom capsule: the five tabs, icons alone**, as the system's vertical tab bar draws them, the active one on its pill in `brand/text`, the capsule's bottom edge 24 points above the screen's. They show only while the tabs are the screen in front; a page pushed over the tabs hides the bar on a phone and the column drops them too, which is what Safari's page view does with its own bottom group. The labels are gone from this bar on purpose (rule 32 is kept by the pill and the color); the system shows them on a long press, which V0 does not reproduce.
- **No band of system chrome at the top of the content.** The tab screens get 24 points above their large title, near where Settings puts its own (its title's cap height starts at 37); a pushed page keeps its native header for the swipe and the Back, with the header's hairline off, since an empty bar with a line under it reads as a stripe across the page.
- Not reimplemented in V0: the long-press labels, the Large Content Viewer, the compression of the top capsule into "···" when a Live Activity or the keyboard shortens the column. The HIG review of PR 4 says whether any is owed before the store.

Every tab screen keeps its layout: the large title, the medium chip, the word on Home. The content column is 382 points wide on the outer display, between the phone's 375 and 402, so nothing new is drawn for it.

## The inner display: two panes where the phone stacks

Rule 24 holds, same loop, own product: each medium's screens decide from their own use. Rule 3 holds: Home keeps three blocks. What the regular width adds is room, and the room is spent on putting side by side what the phone stacks, with the seam at the middle so the fold falls on it. Proposed, for Rafa's reaction on the simulator:

| Screen | Phone (compact) | Inner display (regular) |
|---|---|---|
| Home, games | Switcher, ask button, Playing, Up next, Coming up, one column | Switcher and ask button across the top; the left pane is Playing with the hero at the pane's width and the also-playing cards under it; the right pane stacks Up next over Coming up. Rafa's words: Playing bigger on the left, the rest on the right. |
| Home, movies | The question button, then rows by reason | Unchanged in shape: the button across the top, the rows across both panes, each row showing more posters. The first row's large carousel stays large (decision 28). |
| Search | Field, then the list | One column, capped at 640 and centered. |
| Ranking | List, or the grid at three columns | The list one column; the grid at four columns, an even number so the fold splits it cleanly (the HIG's own advice). |
| Next, games | Backlog and Upcoming behind a segmented control | Backlog in the left pane, Upcoming in the right, no segmented control; the seam at the middle. |
| Watchlist and Calendar, movies | The same control, the poster grid | The same two panes; the poster grid at four columns. |
| Log flow, compare step | Two cards side by side | The same, the cards at their larger size (the web brief's 200 wide). |
| Profile, Settings, game page, movie page | One column | One column, capped at 640 and centered. The game page's header could sit beside its facts; that is a design, not a stretch, and waits for a frame. |
| Onboarding deck and session | One column | Unchanged, capped at 640; the deck's slider keeps the phone's width so the tier positions keep their meaning. |

Inner display in portrait (669 wide): the panes apply from 600, so Home, Next and the grids split there too, each pane 320 or so, which is a phone's width less the margins. The bar is at the bottom. Landscape (951 wide): the column on the right, the panes wider.

**Built 2026-10-22, in the same PR as the column, on Rafa's go of that day.** `ui/pane.tsx` is the row and its two halves; a pane measures itself and hands its width down as the content width, so the Playing cards and a grid inside it divide the pane without knowing it is in one. Games Home, Next (Backlog beside Upcoming) and the movies Watchlist (beside the Calendar) take the panes from 600; the Ranking grid goes to four columns; Search, Profile and every stack screen are capped at the reading width, 640, and centered (`readingInsetFor`, under test). Movies Home keeps its rows. Seen on the web at 669 by 951 and 951 by 669, where the layout code is the same as the device's; the simulator's inner display waits on Device Hub (PR 4). Not done here: the compare step's larger cards and the game page's header beside its facts, which are designs for a frame.

## What waits on Rafa

Filed as Decisions on the board, each with the default the build uses until he answers:

1. **The third width.** The web brief fixed two widths at 1024 (VER-110). The Duo's inner display adds `regular` at 600, and the web inherits it. Default: yes, three widths, the web's `wide` untouched.
2. **A drawn column or the system's bar.** Switching the shell to NativeTabs (`expo-router/unstable-native-tabs`) would make the Duo's vertical bar automatic, and would also change the bar on every iPhone to the iOS 26 glass bar with SF Symbols, which the shell spec declined. It also needs react-native-screens 4.30 or later for the Duo. Default: the drawn rail; NativeTabs stays the later option it already was.
3. **The portrait lock.** Keeping it makes the outer display portrait-only, which is right, and does nothing on the inner display, where iOS resizes the app anyway. Unlocking it in `app.json` would be a native change and a rebuild of the dev client, with no gain the Duo does not already take. Default: keep it, verify every pose on the simulator.
4. **Frames or the simulator.** The rule is Figma before code (figma-workflow.md). The column and the width cap are conventions and were coded first (rule 7); the two-pane Home is a design. The Figma connector is signed out in this session. Default: Rafa reacts to simulator screenshots of the two-pane screens, letters by screen, and the approved layouts are drawn back into Figma afterwards; if he wants frames first, PR 2 waits on them.

## The pull requests

1. **VER-258, the shell** (this PR). The layout model with tests; the column, with the screens' own controls in it; the content width in the four places that divided the window; the root stack's clearance of the column; this brief and the research. Verified on the Duo simulator, outer display, every tab in light and dark, and the game page's native header. No native change.
2. **Home at regular width.** Games Home's two panes; movies Home's rows at the pane's width. The screenshots for Rafa's letters.
3. **The lists at regular width.** Next's two panes, the Watchlist's and Calendar's; the grids at four columns; the reading cap on Search, Profile, Settings and the detail pages; the compare step's larger cards.
4. **The poses and the build.** The HIG review on the simulator in every pose Device Hub offers (closed, partly open, open, Split View); the in-screen `Sheet` and the web `Dialog` clear of the fold and the column; the home-indicator inset under a side bar; `eas.json` pinned to an Xcode 27.1 image so TestFlight builds get the full screen; the Duo screenshots the store wants from April 2027.

**Seen on the simulator, 2026-10-22, PR 1.** The outer display, light and dark, Home, Ranking, Next and Profile with the column, the sign-in screen and the game page:

- The column iOS reserves reports as a trailing inset of 84 with a top inset of 0, as the research's third-party table said; the column fills it and the content is 382 points wide. Nothing on the five tabs needed redrawing.
- With the status bar in the column there is no top inset, so a large title sat on the top edge; the tab screens now get a 24-point band when the bar is on the side, which is near where Settings puts its own title. Stack screens have their native header, hairline off.
- The native stack's Back button moved into the column on its own, under the status glyphs, where Safari's back sits: react-native-screens' header is a UIKit navigation bar, so Apple's rule holds for it. The game page's own menu button now sits under it in the column, 59 points lower, in its own capsule.
- The sign-in screen's cover wall runs under the column while its sheet stops at it, which is the HIG's "background spans, content stays inset".
- Home's Up next cards are a horizontal row and the second card clips at the column's edge, as it clips at the screen edge on a phone (rule 29).
- Not yet seen: the inner display in any pose, Split View, the in-screen `Sheet`, the form sheets, the deck. Those are PR 4 and the inner display's PRs.

Verification, as of PR 1: the simulator's outer display is driven from the command line (`xcrun simctl`, Device Hub's device type `iPhone Duo`). Folding, opening and the poses are buttons in Device Hub, and this session cannot press them (no assistive access for scripts), so the inner display is checked on the web at 669 and 951 wide, where the layout code is the same, and on the simulator by Rafa or by a session with Device Hub in reach. PR 4 closes that gap.

## Sources

- Apple, [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo), 2026-09-09; [Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo); the tech talks 111461 to 111464 (prepare, raise the bar, strike a pose, multiple displays).
- The measurements above, taken on the simulator on 2026-10-21; the research notes in [docs/research/iphone-duo.md](../research/iphone-duo.md), which carry the URLs and dates for every claim, and the third-party inset table they cite.
- [web-brief.md](web-brief.md) for the two widths this extends; [specs/shell.md](specs/shell.md) for the bar this redraws; [ui-principles.md](ui-principles.md), rules 3, 7, 24 and 32.
