# Web brief: the web app at parity with V0, and the public URL

Written 2026-10-07 by the orchestrating session (Fable) from Rafa's ask of the same day. **Status: a proposal.** Nothing here is decided until Rafa's letters on the web round and his answers to the questions at the end (two of which are reworded for the public tree, the originals in the private context); no code is written from this document until he says go. It plans against [ROADMAP.md](../../ROADMAP.md) (milestones M1 to M3, waves A to D), the stack in [tech-stack.md](tech-stack.md), the process in [figma-workflow.md](figma-workflow.md), and the screen specs in [specs/README.md](specs/README.md).

## What the URL has to do

*Amended 2026-10-07, evening:* a marketing site sits in front of the app (its brief is kept with the private context): the public URL is that site at the domain's root, the app lives at `app.<domain>` behind a lock (Sign in and Request access on the web, no sign-up), and the landing drawn in the web round becomes the app's sign-in page rather than the public front door. The app itself still serves three readers: a visitor with no account and twenty seconds, who needs to see that the thing exists and is real; a beta tester without an iPhone, who needs the real app behind sign-in at phone width and at desktop width; and the developer demoing a ranking and a pick on a big screen with the keyboard.

The visitor will not create an account, install an app, or rank ten games. So the URL needs three things, proposed here as the default (questions 3 and 4): `/`, the signed-out landing, which is the cover wall the app already has plus one product line and a way in; `/u/<username>`, a public, read-only ranking page, opt-in and off for everyone by default, with the developer's own list switched on as the demo (this is V2's "public profile page" pulled forward; it costs one read policy, one function, one frame); and the app itself behind sign-in. The landing's sentences are Rafa's; until he gives them, the product line is the placeholder.

## Where the web stands today

Facts from the code and the work queue, checked 2026-10-07.

- **The export works and the sign-in screen runs in a browser** (work queue, 2026-09-16, #48, against a local stack). Found then and still true: the Backlog sort menu (`@expo/ui` MenuView) and Home's long-press menu (`Link.Menu`) are inert on web; every screen behind the gate is unseen on web; the export needs the two `EXPO_PUBLIC_` variables at build time.
- **The output mode has to change.** `app.json` sets `web.output: "static"`, which pre-renders one HTML file per route and needs `generateStaticParams` for a dynamic route like `game/[id]`; there are 69,183 games, so that is not viable. The logged-in app is the `single` output: one `index.html`, routing in the browser, and one rewrite on the host (Vercel: every path to `/`). Public indexable pages, if they ever matter, come from the `server` output or the Next.js site of decision 4, not from this build.
- **The client already knows about web.** `lib/supabase.ts` drops the encrypted store and turns on `detectSessionInUrl` on web; the session then lives in the browser's local storage, as Supabase defaults to. PKCE stays on. What is missing is the web side of the links: the redirect URLs are the two `verso://` deep links only (`config.toml` and the hosted dashboard), `+native-intent.tsx` keeps `auth/callback` and `auth/recovery` off the router on native only, so on web those two URLs land on Unmatched Route, and Google opens through `openAuthSessionAsync`, which on web is a popup where the convention is a full-page redirect.
- **What has no web implementation**, each with its web convention: the two menus above (a dropdown); `ActionSheetIOS` and the `Alert` confirms with buttons (sign out, delete account, import, "already ranked"), which react-native-web does not draw (a dialog; to confirm in the spike); the five `formSheet` routes (add, log, hours, details, platforms), which on web render as a plain pushed screen (a centered dialog at wide, a sheet at compact); `expo-sharing` for the JSON and CSV exports (a download); `react-native-sortables` for drag to reorder on Ranking and Next (its repository has a web example and its docs name only iOS and Android; the spike settles it, and the fallback is the "Move up" and "Move down" actions the HIG review of 2026-09-29 asks for anyway).
- **What works on web as is:** react-native-web 0.21 (maintenance mode, as the stack doc notes), Uniwind on Tailwind v4 (the sign-in screen proved it), Reanimated and Gesture Handler, `expo-image`, `expo-blur`, `expo-document-picker` (a file input), Expo Router's `single` output, the drawn tab bar and every primitive in `src/ui`, TanStack Query. `expo-glass-effect` and `expo-secure-store` are native-only and already unused or bypassed on web.
- **No layout tokens exist for width.** `tokens.json` has colors, spacing, radius and type; `useWindowDimensions` is read in three places (the Playing cards, the Ranking grid, the filter sheet) for carousel and column math, not for layout.

## The shape: one codebase, two widths

Decision 4 already chose one Expo codebase that builds for iOS, Android and the web. The web app is that build, not a second app. Two widths (question 5):

- **Compact, under 1024 px:** the phone layout as built and as approved in the fidelity round, rendered in the browser. Parity here costs only the mechanics above. This is what a classmate on Android gets.
- **Wide, 1024 px and up:** the web-exclusive layout. A left sidebar replaces the tab bar and carries the medium switcher (rule 4, one medium at a time, holds; the switcher moves from Home's top to the sidebar's top) and the account at the bottom. The content sits in a column of at most about 1100 px, so a ranking row or a reason line never runs wider than a line can be read. Every route-level sheet becomes a centered dialog with the same chrome (Cancel, title, Save). Menus are dropdowns. Covers keep rules 29 and 30. The large titles stay.

In code: a `breakpoint` pair in `tokens.json` and a `useLayout()` hook that returns `compact` or `wide`; `.web.tsx` files only where web needs a different component (the tabs layout, the sheet presentation, the menus, the share and confirm helpers); every screen file renders both widths from the one hook, so a screen agent never forks a screen. Rule 7, conventions first, reads on the web as the web's conventions: a sidebar, dialogs, hover, keyboard, a URL per state.

Five web rules proposed for [ui-principles.md](ui-principles.md) once Rafa reacts to the round (numbered here as W1 to W5, not as rules until then):

- **W1. The keyboard does what the thumb does.** `/` focuses search, left and right pick a compare card, Enter confirms, Esc closes a dialog, up and down move a selected row where drag would.
- **W2. Hover reveals, never hides.** What a long press shows on the phone (the Playing card's menu, the row actions) is an ellipsis that appears on hover and is always there on touch. Nothing is reachable only by hovering.
- **W3. A sheet is a dialog at wide and a sheet at compact.** Same content, same chrome, one component with two presentations.
- **W4. The URL is the state.** Every screen, filter and item is a link that can be sent: `/ranking?genre=rpg`, `/game/1234`, `/u/rafa`. Expo Router gives this; the screens keep their params in the URL rather than in memory.
- **W5. One column, never two products.** Wide adds room and a sidebar; it never adds blocks the phone does not have. Parity runs both ways.

## Screen by screen: what web adds, and what each waits on

Mobile status is as of 2026-10-07. "Wide" is the web-exclusive layout; "mechanics" are the web conventions that replace native parts at both widths. The last column is the trigger that frees the web work, so an agent can start the moment it fires.

| Screen | Mobile status | Wide layout | Web mechanics | Waits on |
|---|---|---|---|---|
| Shell: tab bar, theme, primitives | Built, approved | Sidebar with the switcher and the account; content column; `+html` title, meta, fonts, favicon | `useLayout`, breakpoint tokens, dialog presentation for the five sheet routes, focus rings, hover states on `Button`, `Chip`, `ListRow` | The web round's letters (shell frame) |
| Signed out, the landing | Built, approved | Cover wall full-bleed, the sign-in card on the right, one product line | Google as a full-page redirect; `auth/callback` and `auth/recovery` as web routes; confirmation and recovery links pointing at the web origin | Rafa's sentences; the redirect URLs on the dashboard |
| Home (games) | Built, approved; the Tonight block comes in wave C | Two columns: Playing left, Up next and Coming up right | The long-press menu as a hover ellipsis with a dropdown | Nothing now; the Tonight block when wave C lands |
| Search and the add sheet | Built; #62 (search smarter) is backend only | The field in the content header, results as the list, the add sheet as a dialog | `/` shortcut, Enter adds the first result | The add sheet's rows change with item 35 (ownership out): the dialog chrome now, the rows after wave A |
| Game page and its three sheets | Built; items 32 and 35 change it | Cover and actions left, details right; the sheets as dialogs | The ellipsis menu as a dropdown, link-outs in a new tab | Wave A (items 32 and 35 merged) |
| Log flow: tier, compare, confirm | Built, approved | One centered dialog for the three steps; the compare cards side by side at 200 wide | Left and right pick, Enter confirms, the hatches as buttons with their keys shown | Nothing for the single-game flow; the batch session (item 36) is bulk entry's |
| Ranking, list and grid | Built; filters merged in #61 | The list in the column with the tools row pinned; the grid at five or six columns | Filters in the URL; drag if sortables proves out, else Move up and Move down on hover | Nothing; the platform filter's fix (phone entry 4) is mobile's |
| Next: Backlog, Upcoming | Built; item 35 removes the owned filter | The two segments as the list in the column | The sort menu as a dropdown; Start on hover; drag as on Ranking | Wave A (item 35) |
| Profile and Settings | Built | Stat tiles in one row; Settings as a page of sections | Export as a download; import as a file input; the confirms as dialogs | Nothing |
| Questionnaire and bulk entry: which media, platforms, deck page, session, review, Link Steam | Round 2 approved 2026-10-07 except the slider (A by silence); coded in wave A (items 35, 36) | The deck page as a grid of ten cards with the slider under each title; the session as the compare dialog; the review as the ranking list with the new rows marked | The slider by keyboard (left and right); Steam as a redirect | Items 35 and 36 merged and the mobile screens coded; the onboarding brief's ten questions |
| Steam link screens | Backend built (#44); screens are wave A, from conventions | A settings page with the privacy checklist | The OpenID round trip as a redirect to the web origin (the Edge Function already verifies it) | Wave A |
| Movies: Home | Decided 2026-10-07 (decision 28, frame H); coded in wave B | The rows as full-width carousels; the question button opens a dialog (E1) | Arrow keys through a row | Wave B |
| Movies: page, log sheet and diary, Watchlist, Calendar, Ranking banner, Profile diary | Eight frames wait for Rafa's letters (item 8, mid-October); wave B | Same mapping as the games screens | Same mechanics | Item 8, then wave B |
| The finder: Tonight block, request sheet, three picks, permission | Drawn and coded in wave C (November) | The request as a dialog; the three picks as three cards in a row | Enter asks; the permission as a dialog | Wave C |
| Letterboxd import | Built on the branch `letterboxd-import`, unmerged; screens from conventions on Rafa's word; wave C | The review screen in the column | The file input is the natural home; the CSV never leaves the browser until confirmed | Rafa's word, then wave C |
| Public profile `/u/<username>` | Does not exist (V2) | The ranked list read-only, the top ten, the medium switcher | A share button that copies the URL | Questions 3 and 4; a migration and a frame |

## W0, the spike: what the browser showed (2026-10-07)

Run the same day Rafa said go, in the worktree `web-spike`, against the local Supabase stack with a throwaway account; nothing touched the hosted project. The export was served by a static server with the single-page fallback, which is what Vercel's rewrite does. Thirteen real games were seeded into the local catalog with Steam app ids so the covers would render.

**What the export is.** With `web.output: "single"`, `expo export --platform web` produces one `index.html`, one script of 3.6 MB (873 KB gzipped, `__DEV__` false, no code splitting), 10 KB of CSS, the Inter fonts and a favicon; `vercel.json` at the repository root holds the install and build commands, the output directory and the one rewrite. The two `EXPO_PUBLIC_` variables are inlined at export time from `apps/mobile/.env` or the shell. Direct loads of `/search`, `/ranking`, `/settings` and `/game/<id>` all work behind the rewrite.

**What works on web as it is, at both widths.** Sign-up and sign-in by email, the session gate, sign-out (which has no confirm on any platform, by the code), the password-reset request. Home with its blocks and the Playing card. Search with the debounce, recent searches, Popular, and the add sheet's three actions, which return to Search. The whole log flow: the tier sheet, the compare stage with covers and the genre-aware prompt, the confirm step with its nudges, Done. Ranking's list, the grid toggle, the Genre filter sheet. Next's segments and rows. The game page with every fact, the details sheet's hours and notes, the platforms sheet. Profile, Settings, Edit profile. Every route is a URL, the page title is "Verso", buttons are real `<button>` elements with their labels as names, and the compare stage at 1024 px (two cards side by side, centered) already looks like a web screen. At 375 px the layout is the phone's.

**What breaks or is silent, ranked, each with its web convention.**

1. **`Alert.alert` is a no-op in react-native-web** (its `Alert` class has an empty `alert`). Every confirm, menu and error that goes through it is silent: the game page's More menu and the status Change menu (`showActionSheet` falls back to `Alert` off iOS), the Time to beat row's breakdown (`showInfo`), Settings' Delete account (so an account cannot be deleted on web), "Export failed", "Import complete", "Could not save" on a Ranking move, the add sheet, the platforms sheet and Home's actions, "Already ranked". Convention: a `Dialog` primitive (modal, focus trap, Escape and Enter) and a `Menu` primitive (dropdown), wired into `native-menus.ts` on web, and the existing `ErrorLine` for the save errors.
2. **`@expo/ui` MenuView** (the backlog's Sort menu) renders its trigger and fires nothing; the console says so, and the click falls through to the row beneath it (it opened Hades). Convention: the `Menu` dropdown.
3. **`Link.Menu`** on Home's Playing card shows nothing on click or right-click; the card is a plain link to the game page. Convention: W2, a hover ellipsis that opens the dropdown.
4. **The five form-sheet routes** (add, log, hours, details, platforms) render as full pages: no backdrop, no grabber, no close control. Cancel exists only where `SheetFrame` draws it (details, platforms); the add sheet and the tier sheet have no way out but the browser's back button. Convention: W3, a centered dialog at wide and a bottom sheet at compact, each with a close control and Escape.
5. **DateTimePicker "is not supported on web"**: the details sheet's Started and Purchased rows set a default date with no picker. Convention: a native `<input type="date">` on web.
6. **expo-file-system "is not supported on web"**: Export as JSON and as CSV fail, silently because of item 1. Convention: build the file in memory and download it through a Blob URL. Import through `expo-document-picker` is a file input on web and is expected to work; it was not exercised, because a native file dialog cannot be driven from the browser pane.
7. **The auth links are native-only.** The reset email's link ends in `redirect_to=verso://auth/recovery`, which a browser cannot open; the sign-up confirmation (when confirmations are on) and Google's callback have the same shape, and `+native-intent.tsx` keeps the two paths off the native router only. Convention: on web the redirects are `${origin}/auth/callback` and `${origin}/auth/recovery`, both exist as routes, Google runs as a full-page redirect, and the web origin is added to `additional_redirect_urls` and the Site URL (runbook section 9).
8. **The URL keeps `?log=1`** after Done (`/game/<id>?from=Search&log=1`), so a shared or reloaded link would reopen the flow on an unranked game, and a direct load of `/game/<id>` with no `from` draws no back control at all. At 375 px the game page's back label did not show in the screenshot even with `from` set; W1 re-checks it. Convention: W4, consume `log=1` by replacing the URL, always draw a back control on web.
9. **Hover and keyboard do nothing.** No hover state, no visible focus ring, arrow keys ignored on the compare step, Escape closes the Genre filter sheet but not the Edit profile sheet. Convention: W1 shortcuts, focus-visible rings, Escape on every dialog and sheet.
10. **Everything stretches at 1024 px.** The tab bar spans the viewport, rows run 976 px wide, the sign-in sheet is full width with the cover wall's three columns in the top-left corner and black to the right, and the Ranking grid shows two posters of about 470 px because its column math divides the window width. Convention: the content column and the sidebar of the web round; the grid's columns from the column width, not the window's.
11. **Drag to reorder is unproven.** A mouse drag did not reorder Ranking rows and logged no error; the library activates on a long press the browser pane cannot hold, so sortables on web stays open either way. W1 settles it by hand; Move up and Move down remain the fallback.
12. **Share my top 10** goes through react-native-web's `Share`, which calls `navigator.share` where the browser has it and rejects otherwise; the rejection would surface through `Alert`, so it is silent. Convention: copy to the clipboard with a toast when `navigator.share` is missing.
13. **One 3.6 MB script.** Fine for the beta; W1 notes lazy routes for the log flow and the bulk-entry deck.

Not findings: the fifteen 404s on the sign-in wall are the local catalog's fake cover ids; the Steam CDN fallback renders cross-origin on web. The HIG review's two mechanical findings (label weight, hit regions) hold on web as they do on the phone.

**What this settles for W1.** The primitives list stands as written below, with two additions from the spike: a web `DatePicker` and a `download()` helper beside `share`. The auth work is three small changes (the two web routes, the origin-based redirects, the Google redirect flow) plus Rafa's five minutes on the dashboard. The hosting choice stands: the single-page output behind one rewrite worked first time.

## What is not blocked now: wave W0 and W1, in order

Every item below builds on the approved fidelity round and merged code, touches no screen a mobile agent has open, and ships as one PR from `main`.

1. **W0, the spike** (about two agent-days, on Rafa's go). Switch the output to `single`; export; a Vercel preview on a `*.vercel.app` URL against the hosted project; sign in with email and Google in the browser; walk every screen at both widths and write the list of what breaks, per screen, into this brief; settle sortables and `Alert` on web. Output: the findings here, a runbook section 9 (the Vercel project, the variables, the domain, the two redirect URLs and the Site URL), and the `vercel.json` rewrite.
2. **The web primitives, from conventions** (about three agent-days). `Dialog` (replaces `Alert` with buttons, the action sheets, and the sheet routes at wide), `Menu` (a dropdown behind the same props as `Link.Menu` and MenuView use today), `download()` beside the share helper, hover and focus styles on `Button`, `Chip`, `ListRow`, `FilterChip`, a `useShortcut` hook, and the two auth web routes. Rendered on `app/preview.tsx` like every primitive.
3. **The pipeline** (about one agent-day plus Rafa's 15 minutes). A `web` job in `ci.yml` that exports on every PR; the Vercel project connected to the repository with a preview per PR and the two public variables; the head tags (under the `single` output there is no `+html.tsx`; the one hook is `public/index.html`, which the export fills in, so the title, description, theme colors and Open Graph tags live there, generated from a template and the tokens), document titles per route, the favicon and a share image; the domain.
4. **The web round in Figma** (about one agent-day plus Rafa's 20 minutes). Four grayscale frames at 1280 wide on a new page `Web round`: the shell with the sidebar on Home, the Ranking list, the compare dialog, the signed-out landing. Drawn by one Opus agent from a drawing brief with a desktop variant of the kit (`kit.js` draws 402-wide phone frames; `desktop()`, `sidebar()` and `column()` helpers are added and recorded in `figma-kit/web-round.md`), reviewed by the `hig-review` agent with the skill's cross-platform lens before Rafa sees it, then his letters. Everything not in the four frames is coded from the approved phone frames plus web conventions (question 6).
5. **The shell at wide** (about two agent-days, after the letters). `useLayout`, the breakpoint tokens, the sidebar, the column, the dialog presentation for the five sheet routes, `.web.tsx` for the tabs layout only.
6. **The games screens at wide** (about five agent-days of parallel agents, one per screen, no simulator). Now: Home, Search's field and list, Ranking, Profile, Settings, the log flow. After wave A merges: the game page, Next, the add sheet. Each agent verifies in a browser against the local stack at compact and wide and with the keyboard; one integration agent checks the whole at the end of the wave.
7. **The landing** (a day once Rafa's sentences exist). The layout from the round; the copy his.
8. **The public profile** (about two agent-days, if question 3 stands). A `profiles.public` flag off by default, a `security invoker` read function that returns a public user's ranking and nothing else, pgTAP for the two-user case, the `/u/[username]` route, and one frame in the round.

## What waits, and the trigger that frees it

1. **Bulk entry and the questionnaire on web** wait for items 35 and 36 to merge and the six mobile screens to be coded (wave A, October), the slider letter (A by silence), and the onboarding brief's ten questions. The deck page is the web's best screen (ten cards in a grid, a slider under each title) and the one most worth a frame of its own in the second web round.
2. **Movies on web** wait for Rafa's letters on the eight remaining frames (item 8, mid-October), the TMDB token (item 4), and wave B's screens (mid-October to November). Home is decided and could be laid out at wide as soon as wave B codes it.
3. **The finder on web** waits for wave C (November): the Tonight block, the request sheet, the three picks, the permission screen.
4. **The Steam link and the Letterboxd import on web** wait for wave A's and wave C's screens respectively, and the import for Rafa's word that its screens skip Figma. Both are simpler on web (a redirect, a file input) and need no new design.
5. **The movies deck variant** is not drawn (a wave C proposal) and waits with it.

Other changes that touch the web, so the plan does not forget them: the name and the domain (decision 14 keeps the name open until the store; the public URL must survive a rename, see item 18); the HIG review's findings of 2026-09-29 are native except the hit regions and the Move up and Move down actions, which the web needs for the keyboard; the `events` table and the crash-reporting choice of wave A apply to the browser too (the same "never sold" rule picks the browser SDK); the privacy policy and the account-deletion page need a static route on the web before the store anyway (M3), and the web is where they live.

## Orchestration: the web waves against the milestones

| Wave | When | Contents | Done when |
|---|---|---|---|
| W0 | Two days after Rafa's go | The spike (item 1 above) | A `*.vercel.app` URL signs in and shows the tabs; the breakage list is in this brief |
| W1 | October 13 to October 31 | Primitives, pipeline, the web round and its letters, the shell, the games screens at wide, the landing, the domain | The URL on a domain works with games at both widths; a visitor sees the landing; Rafa demos his ranking with the keyboard |
| W2 | November, about a week behind waves A and B | Bulk entry and the questionnaire on web; movies Home and the movie screens as wave B lands; the Steam link; the second web round (deck page, movies Home at wide) | A stranger reaches ten ranked games in the browser; movies work end to end |
| W3 | December, with waves C and D | The finder, the Letterboxd import, the public profile if agreed, beta hardening at three widths | Parity with V0 at M2; the web URL is a second door into the beta cohort |

The process is mobile's: agents in parallel worktrees, one PR each from `main` and never on another open PR, each reviewed by diff in the orchestrating session before it merges, CI green including the new `web` job. Differences: web agents verify in a browser (the desktop app's browser pane against the local stack, or the PR's preview URL) rather than the simulator, so they never contend for it; the shell agent owns `_layout.tsx`, the tabs layout, `src/ui` and the tokens, and no web agent edits the game page, Next or the add sheet until wave A merges; the `hig-review` agent reviews the web frames and the built screens with the skill's cross-platform lens, and pushback against a numbered rule goes to Rafa as it does on mobile.

Rafa's time: the letters on the web round (about 20 minutes), the domain (10 minutes), the Vercel project (15 minutes), the Supabase dashboard (5 minutes), the landing's sentences, and the twelve answers below. Everything else is Claude's.

## Costs

| Item | Cost | Note |
|---|---|---|
| Vercel Hobby | 0 USD | Custom domains included; non-commercial under its fair-use policy, which holds until the paid tier (then Vercel Pro at 20 USD a month, already in the stack doc's cost table) |
| The domain | About 15 to 25 USD a year | `verso.app` is registered and `verso.gg` is free (RDAP, 2026-10-07); seven other candidates hit the lookup's rate limit and are unchecked |
| EAS Hosting, the alternative | 0 USD without a custom domain; 19 USD a month for one | Free plan: 100,000 requests a month, 1 GB, no custom domain, 30-day retention. Expo-native previews per deployment. Not the default because the public URL needs the domain |
| Crash reporting in the browser | 0 USD | Sentry's free tier, chosen with wave A's rule |
| Agent time | W0 two days; W1 about two weeks of waves; W2 and W3 about a week behind each mobile wave | Rafa's hours stay at the reactions |

## What this does not change

The three milestones and waves A to D stand; the web follows them and never pulls a mobile decision forward. Decision 4 stands: this is the Expo web build the stack always planned, and a Next.js site for public indexable pages remains a later addition if it ever matters. Decision 5 stands: the app talks to Supabase directly, the browser included, with Row Level Security as the boundary. The Figma-first rule stands for web-exclusive UI, which is why the shell gets a round; the mechanics that merely replace a native control with a web one are coded from conventions, like the sign-in steps and the Steam link screens.

## Inferences to flag

1. The URL goes public once the landing and the games screens work at wide (W1), not at parity; a visitor needs the front door, not bulk entry.
2. The hosting is Vercel Hobby, because the stack doc chose Vercel for the site and the public URL needs a custom domain the free EAS Hosting plan does not give.
3. The output is `single`; public indexable pages, if ever, come later and elsewhere.
4. The public profile page is pulled forward from V2 as the demo page, opt-in and off by default.
5. Two widths at 1024 px, not three; iPad is unsupported on mobile (`supportsTablet: false`) and a tablet gets the compact layout.
6. Four frames in the web round; everything else is coded from the phone frames plus conventions.
7. The web is a second door into the beta cohort.

## A thought for the desktop, 2026-10-12

Rafa on the site's How it works, step 3 (six films on the watchlist, three of them numbered as the picks, the first one's reason): the app should never show films it is not recommending, but the picks numbered over the list "is something to consider, maybe for the desktop version". Recorded for the web round's finder at the wide width, where the list and the picks can share the screen; not drawn on the phone (movies-brief.md, third pass, point 4).

## Questions for Rafa, with the defaults

Silence means the default.

1. **The domain, now or at the final name?** Default: buy a domain for the working name this week (`verso.gg` is free; `.app` is taken), because a rename before the store is one redirect and the public URL keeps working. The alternative is a `*.vercel.app` URL as the public address until decision 14 settles the name.
2. **Hosting.** Default: Vercel Hobby. Alternative: EAS Hosting at 19 USD a month for the custom domain.
3. **What a visitor sees without an account.** Default: the landing plus a public, read-only ranking page of your own list. Alternatives: the landing only, or a demo account with seeded data.
4. **Public profiles.** Default: opt-in, off for everyone, a switch in Settings, your own on. A public page shows the ranked list, the tiers and the scores, never notes, hours, the backlog or comparisons.
5. **Two widths at 1024 px.** Default: yes.
6. **The web round: four frames** (shell on Home, Ranking, the compare dialog, the landing), the rest from conventions. Default: yes. Alternative: a frame per screen, which costs a second reaction round.
7. **Keyboard in the compare step.** Default: left and right pick, Enter confirms, the hatches show their keys.
8. **Drag to reorder on web.** Default: the spike decides; if sortables fails on web, Move up and Move down on hover and by keyboard, and drag stays on the phone.
9. **The milestone placement.** Default: W1 by the end of October with games, parity at M2. Alternative: everything after the TestFlight friends (W1 in November), which delays the URL by a month.
10. **The web as a beta door.** Default: yes, the cohort may join through the URL, and the funnel events count them with a `platform` column.
11. **The session in the browser's local storage.** Default: yes, Supabase's default, signed out on the device by the Settings row as on the phone.
12. **The landing's copy.** Default: the product line as the placeholder until Rafa gives the sentences.
