# The iPhone Duo outer-display column: what Apple and others actually draw

Research of 2026-10-22, the day before the device goes on sale. There are two kinds of evidence:

- **Web sources.** Apple's HIG page and three tech talks, the first reviews (2026-10-21), and developer write-ups. Each has a URL and a date.
- **Measured on the simulator (marked SIM).** A throwaway iPhone Duo simulator (iOS 27.1 runtime 24A94425, Xcode 27.1 27A9275), separate from the Verso one, was used and then deleted. It showed Apple's Settings and Safari on the outer display (466 by 678 pt). It also ran a 120-line SwiftUI probe linked against the iOS 27.1 SDK. The probe uses a native `TabView` with five tabs, a `NavigationStack`, toolbar icons (grid toggle, gear, ellipsis menu), a segmented picker, a text button, a pushed detail page and a scrolled list. Native SwiftUI draws exactly the column the system gives any opted-in app, so these screenshots show the column Verso should copy.
  - Screenshots: the probe captures `p-tabs` and `p-pushed` are filed beside the Verso ones in `docs/private/design/screenshots/duo-shell/`; the rest were not kept (`01-settings-root-outer.png`, `03-safari.png`, `04-settings-dark.png`, `p-tabs.png`, `p-pushed.png`, `p-segment.png`, `p-text.png`, `p-segment-content.png`, `p-crowded.png`, `p-bottombar.png`, `p-searchtab.png`, `p-userscroll.png`, `p-scrolled.png`, `p-notabs.png`).
  - Measurements were read from the 3x PNGs and divided by 3. Treat them as ±1 pt.

Do not use `p-` shots taken before the SDK fix. A first build stamped SDK 27.0 rendered in compatibility mode, with a black strip and horizontal bars. Everything listed here is from the corrected 27.1 build.

---

## 1. Vertical order inside the column

**Sources**

- Apple's order rule: put primary navigation (Back or Close) at the top of the vertical axis, then prominent actions such as Done. Remaining toolbar items keep their groupings, and "the system provides a vertical space between items from the top and bottom bars". Items overflow bottom to top. Text labels stay in a horizontal bar. Apple's own overflow menu replaces the app's. HIG "Designing for iPhone Duo", new page 2026-09-09: https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo.
- "Toolbar buttons at the top of your app move to the top of this vertical space, while toolbar buttons on the bottom move to the bottom... if you have a tab bar, it stays bottom aligned." Also: "Toolbar items that are too wide for the space on the right, like a text button or a segmented control, should stay put in the nav bar." The column also holds "the new redesigned status bar, and the Dynamic Island, which expands vertically as Live Activities arrive." Tech talk "Design for iPhone Duo" (111466), Sept 2026: https://developer.apple.com/videos/play/tech-talks/111466/
- Navigation, toolbar and tab bar items share one region; "imagine rotating 90 degrees into a vertical stack". Prominent actions use `topBarPinnedTrailing` or `pinnedTrailingGroup`. Text-only items such as Edit "continue to stay on the horizontal axis". A custom item that toggles between a symbol and text should be `.horizontalOnly`. Text that carries standalone information, such as a cart total, stays horizontal. The ellipsis is reserved for the overflow menu. Flexible spacers are zero-size on the vertical axis. Navigation-focused views compress the toolbar first (Podcasts); task-oriented views compress the tab bar first (Games). Tech talk "Raise the bar with iPhone Duo" (111462): https://developer.apple.com/videos/play/tech-talks/111462/
- Vertical bar contents from the top: Live Activities, status, navigation items, toolbar items, and the tab bar at the bottom. In Mail the "Select" text button stays at the top of the content. In Music, Back, Share and More sit near the top with the tabs below. Sarun W., 2026-09-13: https://sarunw.com/posts/adapting-controls-for-iphone-duo/
- Simulator probe positions. The strip is 84 pt wide and controls are 48 pt circles or 48 pt-wide capsules, 12 pt from the strip's inner edge and 12 pt apart. The first control is at y 170 in portrait. Bottom-bar items end 24 pt above the bottom edge. The tab bar is an icon-only capsule at the bottom of the strip (four tabs measure 48 by 212), and the search tab sits below it. GitHub issue liquid_glass_widgets #348, 2026-09-24/29: https://github.com/sdegenaar/liquid_glass_widgets/issues/348
- Apple's iOS 27 Figma kit v27.1.0, as reported by Appetite UI on 2026-10-04 and 10-08: 84 pt = 12 inside + 48 + 24 outside. The vertical status group is 48 by 86. Tab bars of two to five tabs run 48 by 110 to 48 by 260, and the minimized tab bar is 48 by 48. The reserved region shape is 84 by 169. https://www.appetiteui.com/blog/design-for-iphone-duo-in-figma
- Music: the tab bar's "New" and "Library" move to the right column, and so do the playlist button and the three-dot menu. 9to5Mac review, 2026-10-21: https://9to5mac.com/2026/10/21/iphone-duo-review/
- With a Live Activity showing, the time and status move down. Unforgetful's Close and Done then collapse into one "···". Daring Fireball, 2026-10-21: https://daringfireball.net/2026/10/the_iphone_duo

**Measured (SIM).** Outer display, portrait, top to bottom. x positions are in a 466 pt frame.

| y (pt) | What | Shape |
|---|---|---|
| 0 to about 80 | Camera / reserved region; nothing drawn | — |
| 86 to 98 | Time, bold, centered at x ≈ 417 | text |
| 110 to 150 | Circular status mark (Wi-Fi arc and cellular dots) | ring |
| 173 to 222 | **Back** on a pushed screen: its own 48 by 48 glass circle | circle |
| next group, 11 pt below | Remaining top toolbar icons in one glass capsule, about 52 pt pitch. The probe's grid, gear and ellipsis menu fill 173 to 326 (48 by 153). With Back present, Share and ellipsis fill 233 to 334. | capsule |
| flexible gap | Page background (65 pt in the probe; about 12 pt when crowded) | — |
| bottom group | **Tab bar**: one glass capsule, bottom-aligned. Five tabs fill 391 to 654 (48 by 263), about 50 pt pitch. Its bottom edge sits 24 pt above the screen edge. | capsule |

- **Horizontal placement.** Every control is 48 pt wide at x 393 to 442. That is 11 pt from the content edge (x 382) and 24 pt from the screen edge. Their centerline is x ≈ 417.5. Time and status are centered on the same line.
- **Safari.** Back is a circle at 173 to 222 and Reader is a second circle at 233 to 282. The bottom-bar items, New Tab (+) and Tabs, sit in one capsule at the bottom (541 to about 650). The address field is a wide text-bearing control, so it stays horizontal as a glass capsule along the bottom of the content area (x about 22 to 345). The text "Edit" button also stays in the content.
- **Settings root (no tab bar).** The search button is a single 48 pt circle at the bottom of the column (605 to 654). Nothing else sits in the column.
- **App toolbar items go above the tab items.** Top-bar items sit in the top group. Bottom-bar items sit just above the tabs (Safari shows this), or fold into overflow when space is short.
- **Overflow (SIM `p-crowded`, `p-bottombar`).** The probe had five top icons plus two bottom-bar icons. The toolbar capsule kept the first icons and gained a system "···" at its end. The tab capsule stayed whole, which matches navigation-focused compression. When the app's own ellipsis menu was also present, two ellipses showed. That is why Apple says to fold your menu into `ToolbarOverflowMenu`.
- **Search tab (SIM `p-searchtab`).** `Tab(role: .search)` adds a magnifier as a sixth cell at the bottom of the same tab capsule.

**Placement by control type**

| Control | Where it goes |
|---|---|
| Segmented control | Stays horizontal; see §6 |
| Filter menu (icon) | Goes vertical, as an icon in the top capsule |
| Search button | Bottom circle (Settings) or the last tab cell |
| "Switch section" control | Not found as a named pattern. If it is text, it stays horizontal; if it is an icon menu, it goes in the top capsule. |
| Page's ellipsis | Merged into the single system overflow, which is always the last item of the top toolbar capsule |
| Text-only buttons | Stay in a horizontal capsule at the top-trailing of the content area (SIM `p-text`: "Select" at x 303 to 383, y 24 to 72), on the same row as the large title |

---

## 2. Separator, background, content edge

- **Sources.** By default a vertical bar has no scroll-edge effect. It "does have a background when the reduced transparency accessibility setting is enabled" (talk 111462, link above). With Reduce Transparency on, the strip gets an opaque background and a hairline divider (liquid_glass_widgets #348, link above). With Reduce Transparency, the bar gets a solid (white) background (Sarun W., 2026-10-04: https://sarunw.com/posts/adapt-custom-toolbar-views-for-iphone-duo/). Content should be inset by the horizontal safe area, with the option of "a full-width background image or header with scrollable foreground content that's inset" (talk 111466). The status rail and vertical tab bar give an 84 pt right inset, and content that ignored it "ran underneath" (Cap-go/mimesis PR #23, 2026-10-11: https://github.com/Cap-go/mimesis/pull/23). Pages stop at the rail's column while the sky still runs under it (6pm PR #459, 2026-10-16: https://github.com/at6pm/6pm/pull/459).
- **Measured (SIM).**
  - **No separator and no column background.** At mid-height the pixel at x 458 matches the page exactly: #F2F2F7 in Settings (light grouped background), pure black in Settings dark, white in the probe.
  - **The only materials are the glass circles and capsules.** They have a soft shadow and a thin light rim.
  - **Content stops at the column.** Settings' inset-grouped cards run from x 20 to x 382. They stop exactly at the safe-area edge, with no extra trailing margin, because the column's own 11 pt inner padding gives the gap. Probe rows with a 16 pt SwiftUI padding run from 16 to 366.
  - **Scrolling content never passes under the column.** The scroll view lays out inside the safe area, so the column always shows page background beside the glass.

---

## 3. Large titles and the top of the content

- **Sources.** The top inset is 0 on the outer display; the insets are (L, T, R, B) = (0, 0, 84, 34) (liquid_glass_widgets #348; the same readings on the Verso simulator, docs/design/duo-brief.md). Folded roots show the system title at the top. "Titles scroll away under the vertical rail in both large and inline modes (system behavior)", because "under the vertical rail iOS has no top bar to collapse the title into". A pinned-title prototype was dropped as against "don't override the default bar placement" (FestivalNativeApps PR #377, 2026-10-07: https://github.com/SFenton/FestivalNativeApps/pull/377). The large title is the standard 34 pt and the inline title is 17 pt (PR #419, 2026-10-08: https://github.com/SFenton/FestivalNativeApps/pull/419).
- **Measured (SIM).**
  - **Settings root.** The "Settings" large title has glyphs from y 37 to 63 (cap top to baseline) and starts at x 20. The first card begins at y ≈ 81. There is no band, no tint and no hairline above or below the title; it sits on the page background.
  - **Probe root.** "Home" is at the same y 37 to 63, at x 20, and the first row starts at y 82. The row from y 24 to 72 is the leftover horizontal nav row. It holds the title at leading, text buttons at trailing, and a `.principal` item centered over the 382 pt content width.
  - **After a real scroll (`p-userscroll`).** The title scrolled off with the content and nothing replaced it. There is no inline title and no bar.
  - **When the list was launched already mid-scroll (`p-scrolled`).** A soft blur band appeared behind the large title, covering only the content width (x < 383, y 0 to 81) and never the column. Treat that as a launch-state edge effect, not the steady state.

---

## 4. The tab bar in the column

- **Sources.** The tab bar stays bottom-aligned (talks 111462 and 111466). It is an icon-only vertical capsule. Under compression it collapses to the selected tab's circle, and in outer landscape it collapses on its own (issue #348). On touch-and-hold of about 200 ms the capsule widens and grows upward into a labelled form, with each label under its icon. A glass lens follows the finger, and lifting the finger selects the tab (liquid_glass_widgets #406, 2026-10-07: https://github.com/sdegenaar/liquid_glass_widgets/issues/406). Appetite UI's kit draws the selected tab as a 44 by 58 capsule filled with `systemFill`, the selected icon in the tint color and the others in `label` (Appetite UI docs, 2026-10-08: https://www.appetiteui.com/docs/screens-iphone-duo). One bug report says the vertical tab bar ignores the tab bar tint and shows system blue (cachly #5882: https://github.com/cachly/issues-tracker/issues/5882). Reviewers list the Music tabs Home, New, Radio, Library and Search, and Instagram's and Google's tabs, in the right column (MobileSyrup, 2026-10-21: https://mobilesyrup.com/2026/10/21/apple-iphone-duo-review-in-progress/).
- **Measured (SIM `p-tabs`).**
  - **Shape.** One glass capsule, 48 by 263 for five tabs. It is bottom-aligned, with its bottom at y 654, which is 24 pt above the edge.
  - **Icons.** Filled SF Symbols about 24 to 26 pt tall at about 50 pt pitch, with no labels.
  - **Selected tab.** A light gray pill about 44 by 59 (RGB about 235 in light mode) sits behind the selected icon, and the icon takes the tint (system blue). Unselected icons are near-black (`label`).
  - **Spacing.** The capsule sits as low as it can, not just under the toolbar group. The space between the two groups is empty page.
  - **Scrolling.** After scrolling (`p-userscroll`) the tab capsule was unchanged. There is **no minimize-on-scroll in the column**; it collapses only through vertical compression (`prefersToolbarItems`) or in landscape.

---

## 5. Pushed screens

- **Sources.** The back button is added automatically at the top of the vertical bar. A custom back or close uses `.cancellationAction`, or a leading item with `leftItemsSupplementBackButton = false` (talk 111462; Sarun W. 2026-09-22: https://sarunw.com/posts/opt-in-to-vertical-bars-on-iphone-duo/). "The title stays horizontal at top-leading" (issue #348). Gruber finds a back chevron on the right edge odd ("feels wrong"), while swiping from the left edge still works (Daring Fireball, 2026-10-21). Live Activities push the status down and shrink the space left for the toolbar (same post).
- **Measured (SIM `p-pushed`).**
  - **Title.** The inline title "Hollow Knight" (17 pt semibold) is **left-aligned at x 21**, glyphs at y about 41 to 56. It is not centered and not in the column. A 34 pt in-content heading further down is the page's own.
  - **Back.** Back is its own 48 pt circle at y 173 to 222, directly under the status ring with a 23 pt gap. The trailing items (Share, ellipsis) form a second capsule 11 pt below it. The tab capsule stays in place.

---

## 6. Third-party apps moving their own controls into the column

- **Apple's position.**
  - A segmented control "is not considered a good candidate for the vertical bar". Bar items should be glyph-based and able to overflow, and there is no supported way to reproduce exclusive selection (Apple forums Q&A via Anton Gubarenko, 2026-09-30: https://antongubarenko.substack.com/p/iphone-duo-uikit-q-and-a-forums).
  - There is "no API that moves a custom tab bar for you". Reposition it yourself with reserved regions and `verticalBarEdge`, or move to standard components (Apple forums thread 847644: https://developer.apple.com/forums/thread/847644).
  - Apple's custom examples are a compass view opted in with `.verticalPreferred`, and an action panel (Crop, Filter, Adjust) that "hides its titles and becomes slightly shorter when vertical" (talk 111462; Sarun W. 2026-10-04).
  - A menu with a shape-and-text label moves to the vertical bar only with `.verticalPreferred` and only if it is small enough. A 180 pt slider stays horizontal (Nil Coalescing, 2026-09-21: https://nilcoalescing.com/blog/ConfiguringSwiftUIToolbarsOnIPhoneDuo/).
- **Measured (SIM `p-segment`).**
  - A segmented "Games / Movies" picker in `.principal` stayed horizontal. It renders as a glass capsule (about 135 by 48, at y 24 to 72) centered over the 382 pt content area, and it **replaced the large title** on that screen.
  - As an in-content control (`p-segment-content`), the same picker sits under the large title across the content width (x 16 to 366). The grid, gear and ellipsis icons went to the column either way.
- **Third parties.**
  - **6pm** (Oct 16) built a custom side rail of Add, Settings, the tabs "stood on end" and Scan. It is 84 pt wide, starts 12 pt below the Dynamic Island, and the pages stop at the rail. The hero's Add and Settings were removed from the content because they now live in the rail (https://github.com/at6pm/6pm/pull/459).
  - **OdoKeep** (React Native, Oct 18) got the native tab bar into the column by patching `react-native-screens`. Toasts that ran under the rail now add the side inset (https://www.odokeep.com/blog/iphone-duo-react-native-fold).
  - **United Airlines** puts "navigation on the right side of the display" (Apple Newsroom, 2026-10-22: https://www.apple.com/newsroom/2026/10/developers-bring-incredible-new-app-experiences-to-iphone-duo/).
  - **Things** has "controls in a vertical bar within reach of the user's thumb", with no outer detail (MacRumors, 2026-10-21: https://www.macrumors.com/2026/10/22/things-updated-for-iphone-duo/).
  - **Not found:** any shipped app moving a text segmented control, a mode switcher or filter chips into the column; and any Duo-specific description from Flighty, Overcast, Ivory, Halide, Carrot, Craft or Bear beyond Newsroom one-liners. 9to5Mac names Threads, Overcast, Instagram and TikTok as well optimized, without layout detail.
- **The 382 pt content.** Every source and every measurement shows content simply laid out in 382 pt (Settings cards 20 to 382, a four-column grid in the kits). No app widened content under the column, except a full-bleed background or hero that is allowed to run under it while foreground content stays inset (talk 111466; 6pm).

---

## What Verso should do with its column

1. **The column is 84 pt on the trailing edge with no separator and no background of its own.** It shows the page's own background color, with no hairline and no tint. The only materials in it are glass circles and capsules 48 pt wide, centered at x = W − 48.5 (11 pt from the content edge, 24 pt from the screen edge). Add an opaque fill and a hairline only under Reduce Transparency.
2. **Leave y 0 to about 160 to the system.** That space holds the camera, time and status ring. The first drawn control's top edge is at y 173; read it from the reserved region or status inset if the app can, and use 173 only as a fallback.
3. **Top group, from y 173.** On a pushed screen, Back (or Close on a modal) is its own 48 by 48 circle. Then, 11 pt lower, all of the screen's icon controls go in one capsule at about 52 pt pitch, in this order: the list/grid toggle, the settings gear, then the single "···" last. The page's own overflow items go inside that one ellipsis menu; no second ellipsis.
4. **Bottom group: the five tabs as one glass capsule.** It is 48 by about 263, bottom edge 24 pt above the screen bottom, icon-only filled symbols at about 50 pt pitch, with no labels. The selected tab gets a 44 by 58 `systemFill` pill behind a tint-colored icon; the others use `label`. Optionally show labels on a 200 ms touch-and-hold. It does not minimize on scroll.
5. **The space between the groups is flexible empty page, at least 12 pt.** When the groups would collide (landscape, keyboard, Live Activity), move toolbar icons into "···" from the bottom up and keep all five tabs. These are navigation screens.
6. **Text-bearing and segmented controls stay out of the column.** The Games/Movies media switcher stays horizontal, as a glass segmented capsule 48 pt tall, centered in the content's top row (y 24 to 72) where it replaces the title, or placed under the large title in the content. Never stack it vertically. A text button sits as a capsule at the top-trailing of the content row.
7. **Titles: no header band.** The root large title is 34 pt bold at x 20 with its baseline at about y 63, and content starts at about y 82. A pushed screen shows a 17 pt semibold inline title left-aligned at x 20, y about 41 to 56, not centered. Both scroll away with the content; no pinned or collapsing bar.
8. **Content is laid out in the 382 pt to the left of the column, and scrolling content stops at x 382.** Only a full-bleed hero image or background may run under the column, with its foreground inset.
