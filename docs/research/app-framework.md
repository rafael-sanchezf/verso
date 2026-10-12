# App framework choice for a mobile-first "Beli for video games" app

Research date: September 8, 2026. Everything version-specific below was checked against official docs, changelogs, package registries, or dated 2026 posts. Where a claim rests on a search snippet rather than a fetched page, it is flagged.

## 1. What the project actually needs from a framework

The roadmap has five properties that matter more than any benchmark:

1. Mobile first, but a real web version too. The core loop (search, backlog, head-to-head ranking, ranked list with a 0 to 10 score, filters, drag to reorder) has to feel like an app on a phone, and the same loop should work in a browser.
2. Animation quality on two specific interactions: the comparison card flow (binary-search insertion, so the user sees a handful of quick A versus B choices with satisfying transitions) and list insertion and reordering.
3. A social layer later (friends, feed, match percentage) and more media types later (movies, TV). That means one product surface that keeps growing, on every platform, maintained by one person.
4. Intentional design done in Figma first, with a token workflow that survives contact with code.
5. A solo developer who is strong in TypeScript, React, and Next.js, has shipped on Vercel with Supabase, uses Python for scripts, and writes most code with Claude Code.

Point 5 is decisive. The framework that lets Claude Code and the developer move fastest with the least platform-specific debugging is the one that ships. A stack where the developer cannot read what Claude wrote is a stack where bugs hide.

## 2. Store and account facts that apply to every path

These are the same whichever framework you pick.

- Apple Developer Program: 99 USD per year. Membership includes TestFlight (up to 10,000 external testers) and App Store distribution. Source: Apple Developer Program page.
- Since April 28, 2026, every App Store submission must be built with Xcode 26 and the iOS 26 SDK (search snippet from Capawesome citing Apple's developer news). Every cross-platform toolchain has caught up with this; Expo SDK 55 already set Xcode 26 as the minimum.
- Google Play: 25 USD one-time registration. Google may ask for a government ID and a card in your legal name.
- Google Play personal accounts created after November 13, 2023 must run a closed test with at least 12 testers opted in continuously for 14 days before they can apply for production access. Google scopes this to personal accounts; organization accounts (which need a D-U-N-S number) are widely understood to be outside it. Plan for this early: it is a calendar constraint, not a technical one.
- Sign in with Apple (App Review Guideline 4.8): if the app uses a third-party or social login (Google, Facebook, and so on) to create the primary account, it must also offer an equivalent option that limits data collection to name and email, lets the user hide their email, and does not collect interaction data for advertising without consent. Sign in with Apple satisfies this; so does any provider meeting those three criteria. If the app only uses its own email and password system, 4.8 does not apply. For this project (Steam link later, and probably Google sign-in), assume Sign in with Apple is required on iOS.
- Over-the-air JavaScript updates: App Review Guideline 2.5.2 says apps may not download or execute code that introduces or changes features or functionality. The Developer Program License Agreement clause 3.3.1(B) (moved from 3.3.2 in June 2022, revised October 2025) permits interpreted code run through Apple's frameworks as long as it does not change the app's primary purpose or add features not disclosed at review. In practice: EAS Update, CodePush successors, and Capacitor live-update tools are fine for bug fixes, copy, layout, and small UI changes; shipping a whole new feature area over the air is the thing to avoid. Google Play's policy is comparable in spirit.
- Minimum functionality (Guideline 4.2): "Your app should include features, content, and UI that elevate it beyond a repackaged website." This is the rule that bites web-view wrappers.

## 3. Path 1: Expo + React Native + Expo Router universal app

One codebase for iOS, Android, and web.

### 3.1 Current state (September 2026)

- Expo SDK 57 shipped June 30, 2026 on React Native 0.86 and React 19.2; npm latest is 57.0.20, published about four days ago. SDK 56 (May 21, 2026) was on React Native 0.85; SDK 55 (February 25, 2026) on 0.83. Expo releases three SDKs per year and is now exploring shipping non-breaking React Native releases "almost immediately, as optional upgrades" between SDKs, because React Native itself moved to a bimonthly cadence with every second release having no user-facing breaking changes (0.85 April 7, 0.86 June 11, 0.87 August 11, 2026).
- New Architecture: mandatory. SDK 54 was the last SDK where it could be disabled; SDK 55 removed the `newArchEnabled` flag; React Native 0.84 (February 2026) removed the legacy architecture components from iOS and Android. This is done, not in progress. The practical consequence is that any library you pick must be New Architecture ready, and the ones below all are.
- `expo prebuild` now clears and regenerates the native `android` and `ios` folders by default (SDK 57), which is the right default for a continuous native generation workflow: you never hand-edit native projects, you write config plugins.
- Exact pins in SDK 57 (from `bundledNativeModules.json` on the `sdk-57` branch): react-native-reanimated 4.5.1, react-native-worklets 0.10.1, react-native-gesture-handler ~2.32.0, react-native-web ~0.21.0, react-native-screens ~4.26.0, react 19.2.3, react-dom 19.2.3.

### 3.2 Expo Router and the web story

Expo Router is the file-based router that gives you native stacks and tabs on mobile and routed pages on web from the same `app/` directory.

- Router v55 (February 2026) added experimental server-side rendering, experimental data loaders (`useLoaderData`), server headers in app config, the `expo-server` package (runs on EAS Hosting, Express, Vercel, Netlify, Cloudflare Workers, Bun), Native Tabs (Material 3 on Android, iOS bottom accessory views), a composable Stack header API, a dynamic Color API, native iOS toolbars with Liquid Glass, and `withAppleZoom` shared-element transitions.
- Router v56 (May 2026) forked the React Navigation internals Expo Router depends on. Imports move from `@react-navigation/*` to `expo-router/react-navigation` via a codemod; a compatibility layer covers one release cycle. Streaming SSR shipped behind `unstable_useServerRendering: true`, plus `generateMetadata` for type-safe per-route metadata, `createStaticLoader` and `createServerLoader`, and per-layout `SuspenseFallback`.
- Router in SDK 57 was a small release (toolbar badges).
- Native Tabs are still documented as alpha with an API subject to change, even though they have been shipping since SDK 54.

Web rendering modes, from the official docs:

- Static (`web.output: "static"`): `npx expo export --platform web` produces a `dist` folder of real HTML files per route (not a single-page app), with a `<Head>` component, a customizable `+html.tsx` root, and font preloading. Dynamic routes such as `game/[id]` need `generateStaticParams()` to enumerate what to pre-render. Host on Vercel, Netlify, Cloudflare Pages, GitHub Pages, or EAS Hosting.
- Server (`web.output: "server"`): request-time rendering. The docs still label SSR alpha, require SDK 55 or later, require a deployed server (no static hosting), and say you cannot mix static and server rendering in one project. Metadata must come from `generateMetadata`, not `<Head>`.
- React Server Components are in early preview.
- DOM components (`'use dom'`) let you drop real HTML and React DOM into a native screen; on native they render inside a WebView (`@expo/dom-webview` is the default from SDK 56), on web they are ordinary React. They do not support static rendering or RSC and cannot take children, so they are an escape hatch for rich text, markdown, WebGL, or auxiliary pages, not a general layout tool.

What this means for this app: the app surfaces (backlog, ranking, list, filters, profile) work well as a static-shell web app that fetches from your backend. Public, indexable game pages for a catalog the size of IGDB cannot be statically enumerated at build time, so real SEO for game pages needs either the alpha SSR mode or a separate web app. That is the one place where "web is a compromise" is true today.

### 3.3 Is Expo web first class or a compromise?

Honest answer: first class for app-like web, second best for document-like web.

- Expo's docs position web as "first-class support for building full-stack websites with React," with react-native-web mapping `View`, `Text`, and `Image` onto DOM primitives and Metro bundling all three platforms. Expo notes X.com runs on react-native-web.
- Bluesky ships web, iOS, and Android from one React Native and Expo codebase; the web app is react-native-web served by a small Go service. That is the largest public example of shipping the web version from the universal codebase rather than building a separate site. Bluesky uses `.web.tsx` files for browser-specific components.
- react-native-web itself is in maintenance mode. Latest is 0.21.2, published about a year ago. On December 6, 2025 the maintainer said he will "continue to review PRs and merge fixes" but does not expect to put significant time into major development, and was open to adding maintainers from Shopify and Expo. Expo effectively owns the web story now (Metro web, Router, DOM components, react-native-css), which reduces the risk but does not eliminate it.
- Costs reported in 2026 comparisons (search snippet from React Native Relay): react-native-web adds roughly 30 to 40 KB gzipped, and a content-heavy site chasing Lighthouse 100 would be built with React DOM directly. Accessibility and semantic HTML are workable but require care (RNW emits divs unless you set `role` and `aria-*` props).
- Expo's own guide on using Next.js for web says it "is not an official part of Expo's universal app development workflow," uses `@expo/next-adapter`, does not support the Next.js app directory, and requires running the Next.js CLI separately. In other words, Expo wants you on Expo Router for web, and the adapter path is legacy.

How much of the web do people actually ship with Expo web versus a separate Next.js site? There is no survey data. The observable pattern in 2026 is: consumer apps whose web is a mirror of the app (Bluesky, many indie apps) ship Expo web; products whose web is a marketing site plus SEO content run a separate Next.js app and share packages. The choice is driven by whether web is a product surface or an acquisition surface.

### 3.4 Animation and gestures for the comparison and reorder interactions

- Reanimated 4 went stable July 23, 2025 and requires the New Architecture. It adds a CSS animations and transitions API for state-driven animations and keeps the worklet API for gesture-driven and scroll-linked work. Worklets moved to `react-native-worklets`. SDK 57 ships Reanimated 4.5.1. The SWM team's own estimate is that the CSS API covers most state-driven animations and worklets remain the tool for gesture-driven ones, which is exactly the split this app has (card transitions are state-driven, drag-to-reorder is gesture-driven).
- On web, Reanimated runs a pure JavaScript implementation, needs the Babel plugin (or manual dependency arrays), and is less efficient than native. It works; it is not as smooth as native for heavy gesture work.
- Gesture Handler 3.0 shipped May 28, 2026: hook-based API compatible with React Compiler, SharedValues directly in gesture config, New Architecture only, starts at React Native 0.82; 3.2.x supports 0.83 through 0.87 and the latest is 3.2.1. Expo SDK 57 still pins the 2.32 line. You can install 3.x on SDK 57 since it supports 0.86, but you are off Expo's tested pin until SDK 58. The 2.x API remains supported in 3.x, so either choice is safe; the hook API is nicer for new code.
- Drag to reorder: react-native-sortables (1.10.0, published about a month ago; grid and flex layouts, varying item sizes, auto-scroll, layout animations for add and remove, haptics, built on Reanimated and Gesture Handler) and react-native-reorderable-list (Reanimated-powered, drop indicators, autoscroll thresholds) are the two current choices. Both are New Architecture ready. Web support for sortables is not documented on its landing page; assume you will verify drag on web yourself or use a DOM-based sortable inside a `.web.tsx` variant.
- Native feel beyond animation: Expo UI became stable in SDK 56 and is in the default template. One import gives SwiftUI on iOS and Jetpack Compose on Android for layout primitives, text inputs, switches, sliders, `FieldGroup`, `List`, and drop-in replacements for eight community packages including bottom sheet, picker, segmented control, and menu. Web implementations exist but are experimental and "not at the same quality bar as native yet." Expo UI composes with ordinary React Native views, Skia, and DOM components in one tree. This is the single biggest "native feel" upgrade Expo has shipped, and it lands squarely on this app's needs (native sheets for game detail, native pickers for filters, Liquid Glass toolbars).

### 3.5 Styling, and which options produce good web output

- NativeWind: latest stable is 4.2.6 (Tailwind v3). v5 is still a pre-release (dist-tag `preview`, 5.0.0-preview.4): Tailwind v4, CSS-first `@theme` config, CSS variables, a thin wrapper over `react-native-css`. v4 emits real CSS on web and StyleSheet objects on native. Good web output; the v5 wait is the risk.
- Uniwind: from the Unistyles author, introduced September 2025, latest 1.11.0 (about two and a half weeks ago). Same `className` API as NativeWind, full Tailwind v4 today, compiled at build time, claims about 2x NativeWind's runtime performance, supports iOS, Android, tvOS, web, and desktop. React Native Reusables' README now says "Nativewind/Uniwind," which signals it is a credible drop-in. This is the pragmatic way to get Tailwind v4 tokens now.
- Tamagui: v2.0.0 shipped May 23, 2026 after release candidates from December 29, 2025; latest 2.7.7 on August 15, 2026. Optimizing compiler with CSS extraction, so web output is real CSS classes; ships its own component kit (Sheet, Menu, ContextMenu new in v2). Peer dependency is only `react >= 19`. Strong web output and a complete design-token system, at the cost of learning Tamagui's styled API and a heavier config surface. Best choice if you want one styled-system that is native and web from the same tokens and you do not want Tailwind.
- Unistyles 3 (3.3.0, published about two months ago): C++ core on native, a custom web parser that emits CSS classes, all pseudo-classes on web, themes as CSS variables. Excellent for a designer-driven token system with typed themes; no Tailwind vocabulary.
- Plain `StyleSheet`: react-native-web compiles it to atomic CSS. Works, but you build every token and variant yourself.

For a Figma-first token workflow, Tailwind v4's `@theme` (via Uniwind now, NativeWind v5 later) or Tamagui tokens are the two workflows where Figma variables map cleanly to code and the same tokens hit web CSS and native styles.

### 3.6 Component libraries

- React Native Reusables: shadcn/ui port for React Native on NativeWind or Uniwind, copy-paste ownership model, 8,648 stars, last push July 2, 2026, backed by the Vercel OSS Program. Same mental model as shadcn on the web, which is a direct advantage for someone who has shipped Next.js.
- gluestack-ui: copy-paste components on NativeWind; v3 shipped in 2025 (Next.js 15 and RSC, Expo SDK 53) and v5 in 2026 with NativeWind v5 (Tailwind v4) and an Expo Router first orientation (search snippet from gluestack's blog). Comparable to Reusables with a larger pattern catalog.
- Tamagui: its own kit, as above.

Any of the three is fine. For intentional design from Figma, the copy-paste model (Reusables or gluestack) is preferable because you own every component's code and can match the Figma exactly rather than theming someone else's opinions.

### 3.7 EAS costs, free tier, OTA rules

From the official pricing page:

- Free, 0 USD: 15 Android and 15 iOS builds per month on a low-priority queue, EAS Update for 1,000 monthly active users, 100 GiB edge bandwidth, no overage charges (you hit the cap and wait for the month to reset).
- Starter, 19 USD per month: 45 USD build credit, 3,000 update MAU included then 0.005 USD per MAU, 100 GiB bandwidth then 0.10 USD per GiB, high-priority queue.
- Production, 199 USD per month: 225 USD build credit, 50,000 MAU, 1 TiB bandwidth, two build concurrencies, priority support.
- EAS Hosting on all plans: 100,000 requests and 1M CPU-ms per month included, then 2 USD per 1M requests and 0.04 USD per 1M CPU-ms.
- EAS Submit is available on every plan including Free.

For a solo pre-launch app, Free covers development and TestFlight if you lean on local builds and development builds; Starter at 19 USD is the realistic monthly cost once you are iterating on store builds weekly. Since SDK 55, `eas update` requires the `--environment` flag.

OTA rules are the ones in section 2: JavaScript and asset updates only, no native changes, no new undisclosed features.

### 3.8 Figma to code for React Native

- Figma's MCP server is framework-agnostic: it exposes design context (layout, variables, components), code generation from a selected frame, and Code Connect mapping to your real components. The remote server is available on all seats and plans; the desktop server requires a Dev or Full seat on a paid plan.
- There is no first-party "React Native" output mode the way there is a SwiftUI skill. The workflow that works in 2026 is: Claude Code reads the Figma node via MCP, maps Figma variables to your Tailwind `@theme` or Tamagui tokens, and writes React Native components using your component library. A Simform engineering post from August 2026 describes exactly this with Claude Code (fetch was blocked; only the search summary was available, which said it "made the UI development process much smoother").
- Figma Make generates web React plus Tailwind, which is useful for prototyping flows but not for the native app.
- The practical payoff of Tailwind or Tamagui tokens is that Figma variables can be exported to a single CSS `@theme` block or token object and consumed identically on web and native.

### 3.9 Sign in with Apple on Expo

`expo-apple-authentication` is iOS and tvOS only, works in Expo Go, needs the config plugin and `ios.usesAppleSignIn: true`, and the docs restate the 4.8 requirement. On Android and web you use Apple's OAuth flow through your auth provider (Supabase supports Apple as a provider; this was not re-verified in this pass).

### 3.10 Risks specific to this path

- react-native-web is maintained but not developed. Expo is the de facto steward.
- Expo Router's fork of React Navigation is new (May 2026). Third-party navigation-adjacent libraries may lag one cycle.
- SSR is alpha; SEO for a large catalog is the weak spot.
- Expo UI web output is experimental, so any Expo UI component you use on native needs a web fallback or a `.web.tsx` variant.
- Gesture Handler 3 versus Expo's 2.32 pin: harmless, but a small version-management chore.
- Styling churn: NativeWind v5 has been in preview for a long time; picking Uniwind or Tamagui sidesteps the wait.

## 4. Path 2: Expo for mobile + Next.js for web, shared TypeScript monorepo

Separate UI per platform; shared types, API client, ranking logic, and design tokens.

### 4.1 Tooling state

- Next.js: 16.3.4 LTS as of August 2026; Next.js 15 reaches end of support October 21, 2026.
- Expo's official monorepo guide supports Bun, npm, pnpm, and Yarn workspaces, auto-configures Metro for monorepos since SDK 52, and supports isolated dependency installs since SDK 54 with a warning that some React Native libraries will still break. Duplicate React or React Native versions in the tree are unsupported. Turborepo and Nx are not mentioned in that guide but Turborepo maintains a community `with-react-native-web` example (Expo native app, Next.js web app, shared `@repo/ui` React Native library).
- Solito 5 (October 22, 2025) dropped react-native-web and became web-first: on web it is pure Next.js, on native it is React Native, and it shares navigation API and screen structure rather than UI components. Its compatibility page lists Next.js 16, React 19.1, Expo SDK 54, React Native 0.81 or 0.82. There is no published testing against SDK 55 to 57 (which changed React Navigation internals). Solito is a small navigation shim now, and for a two-UI monorepo you can skip it entirely.
- The old Expo plus Next.js adapter path is officially "not an official part" of Expo's workflow.

### 4.2 Is it worth it for a solo developer?

Sharing is cheap and valuable for: `packages/core` (domain types, the ranking and tier insertion algorithm, score derivation, filter logic), `packages/api` (typed client for your backend, IGDB proxy DTOs), `packages/tokens` (design tokens exported once from Figma to CSS variables and a TypeScript object). None of that requires react-native-web or any special tooling; it is plain TypeScript in pnpm workspaces.

The cost is the second UI: every screen twice, every animation twice, every social feature twice. Reports from teams who tried to share React Native components into Next.js describe slower builds, suppressed build errors, and slower production pages (search snippet, DEV Community). For one person that doubling is the real cost, and it grows with the roadmap (social, movies, TV).

Verdict: worth it as a structure (monorepo from day one), not worth it as a strategy (two UIs from day one). Start with one universal UI and add a Next.js app only for the pages that need SEO or marketing polish, importing `packages/core` and `packages/tokens`.

## 5. Path 3: Native SwiftUI for iOS + separate web app, Android later or never

### 5.1 State in 2026

- Xcode 26.3 (February 3, 2026) has Claude Agent built in. Anthropic's announcement: Claude can view SwiftUI interfaces through Xcode Previews and iterate visually, analyze whole project structures, work toward high-level goals, and read Apple's documentation. Apple's newsroom adds updating project settings and iterating through builds and fixes; MCP is supported for other agents and tools.
- Hands-on reports (Claude Lab, March 19, 2026): requires Xcode 26 or later, macOS 15 or later, and a Claude Pro, Max, or Team subscription signed in via Intelligence settings; strengths are natural-language component generation with preview support and end-to-end task execution; failure modes are usage limits on long sessions and preview capture only in 26.3 and later. Recommended pattern: a project `CLAUDE.md` plus build hooks that run `xcodebuild` so Claude gets a generate, build, fix loop. XcodeBuildMCP (now under Sentry, per a 2026 guide) does the same from the terminal: build, boot a simulator, install, tap through the UI, read logs. A well-known pitfall is Claude reaching for `AnyView` to silence type errors, which hurts SwiftUI diffing; guides recommend keeping view models free of SwiftUI imports and using Swift Package Manager so Claude never edits `.xcodeproj`.
- Figma has a first-party SwiftUI skill (design to SwiftUI and SwiftUI to Figma), and this environment has it loaded. That is the best Figma-to-code path of any option here.
- Native feel and animation are the ceiling: SwiftUI animations, matched geometry, Liquid Glass, haptics, and native drag are all first party.
- Android later: Skip (free and open source) compiles Swift natively for Android via the official Swift 6.3 Android SDK (March 26, 2026) and bridges SwiftUI to Jetpack Compose; 2,200 Swift packages build for Android. It is credible for logic sharing and increasingly for UI, but it is a second toolchain to learn and debug.

### 5.2 Cost for a solo developer

Two UI codebases from day one (SwiftUI and a web app, presumably Next.js), plus a third if Android ever happens. The developer's languages are TypeScript and Python, not Swift; Claude Code is strong at Swift, but the developer will be reviewing code in a language they do not read fluently, and SwiftUI's failure modes (view identity, state ownership, `@Observable` versus `ObservableObject`, concurrency annotations) are exactly the kind that look right and behave wrong. The social layer doubles again.

### 5.3 Publication path

Standard: 99 USD per year, Xcode 26, TestFlight, App Store Connect. No extra tooling needed. Sign in with Apple is trivial in SwiftUI.

## 6. Path 4: Flutter

### 6.1 State in 2026

- Flutter 3.47.0 shipped August 12, 2026 (after 3.44, 3.41, 3.38, 3.35). Headline items: Material and Cupertino are now optional standalone packages (`material_ui`, `cupertino_ui`) updated weekly; Impeller is default on desktop; Wasm is being prepared as the web default and can be used now with `--wasm`; Widget Previews are stable; minimum iOS is 15.
- 2026 roadmap: Wasm as the web default, finish Impeller on Android, MCP servers for Dart tooling, top-tier Gemini CLI support, GenUI SDK.
- Web quality: Wasm compilation with WasmGC has been production-viable since 3.22 and gets faster each release. But Flutter's own docs are direct: "text-rich, flow-based, static content such as blog articles benefit from the document-centric model that the web is built around," and Flutter web renders to canvas, so SEO and semantic HTML are weak. Google's own docs and marketing sites moved to Jaspr (a Dart DOM framework), not Flutter web. For this app, the web version would be a canvas app: fine for the logged-in loop, wrong for indexable game pages.
- iOS fidelity: Apple's Liquid Glass (iOS 26) is not yet in Flutter's Cupertino widgets; the tracking issue is one of the most-watched in the repo and community packages such as `cupertino_native` host real UIKit controls via platform views to fill the gap.
- Claude Code proficiency: there is an official Flutter plugin for Claude Code (`flutter/agent-plugins`, `dart-flutter`) bundling skills, the Dart and Flutter MCP server (analyzer diagnostics, symbol resolution, tests, runtime inspection, hot reload, screenshots), and an accessibility agent. The MCP server is marked experimental. This is a genuinely strong agent setup, on par with Xcode 26.3's.
- Figma tooling: Very Good Ventures published (May 18, 2026) a Claude Code skill that uses the Figma MCP to fetch design context, map Figma tokens to `ColorScheme`, `TextTheme`, and spacing constants, translate Auto Layout to widgets, run a visual comparison loop, and generate golden tests. Community Figma plugins and Builder.io's Visual Copilot also target Flutter. So Figma to Flutter is well served, arguably better than Figma to React Native.
- Animation: first party and excellent (implicit and explicit animations, `ReorderableListView` built in, Rive and Lottie support, 120 Hz on Impeller).

### 6.2 Fit for this project

Flutter is a coherent, well-tooled choice for a mobile-first app with a canvas-style web build. The cost is Dart: a new language for the developer, no shared TypeScript with the backend or a future Next.js site, and a web output that is the wrong shape for public content. If web were not a requirement and the developer were not a TypeScript specialist, Flutter would rank second.

## 7. Path 5: Capacitor or Ionic wrapping a Next.js app, or a PWA

### 7.1 State in 2026

- Capacitor 8 shipped December 8, 2025 (Swift Package Manager default for new iOS projects, Android edge-to-edge, about 1 million weekly downloads). Capacitor 9 is forecast for the end of November 2026: optional Cordova layer, Objective-C fully converted to Swift, multi-window foundations, explicit "AI agent optimization" of docs and APIs, and official Contacts, Calendar, and Health plugins.
- Ionic Framework 9.0.1 shipped August 26, 2026; v9's stated scope was catching up (React Router 6 with a path to 7, Vue Router 5, Angular 21 and 22), with the modular rewrite pushed to v10. Ionic's commercial products (Appflow, Identity Vault, Portals) stopped new sales in February 2025 and are winding down; the open-source Framework and Capacitor remain maintained by OutSystems.
- Store review: Guideline 4.2 rejects apps that are "a repackaged website." Capacitor apps get approved routinely when they behave like apps (native navigation feel, push notifications, offline handling, no browser chrome). A Next.js app in a WKWebView that is just the responsive site is the classic rejection.
- Native feel: this is a web view. Scrolling and CSS animations are fine; native transitions, sheets, haptics, and keyboard behavior need plugins and careful CSS. For a comparison-card flow and drag to reorder you would use Framer Motion or dnd-kit inside the web view, which look good but do not run on the UI thread the way Reanimated or SwiftUI do, and 120 Hz gesture tracking in a web view is noticeably worse on iOS.
- Sign in with Apple works via plugin. OTA updates via Capgo or similar are subject to the same 2.5.2 and 3.3.1(B) rules.
- PWA only: Apple does not accept PWAs in the App Store; Google Play accepts Trusted Web Activities (not re-verified in this pass). A PWA alone fails the "published on the iOS App Store" requirement.

### 7.2 Fit

Maximum reuse of the developer's Next.js skills, minimum native feel. It is the fastest way to a store listing and the slowest way to an app that feels intentional. Given that animation quality is explicitly important, this is the wrong trade.

## 8. Path 6: Tauri 2 mobile and Kotlin Multiplatform, briefly

- Tauri 2 (stable October 2024, core crate 2.11.5 as of July 2026) supports iOS and Android using the system WebView with a Rust core and optional Swift or Kotlin plugins. The team's own stable post says "We are not completely happy about the developer experience" on mobile and that not all official plugins support mobile. It inherits every web-view limitation of Capacitor with a smaller mobile plugin ecosystem and adds Rust. Not credible for this project.
- Kotlin Multiplatform with Compose Multiplatform: iOS has been stable since May 2025; 1.11.0 (May 2026) added an experimental native iOS text input and made concurrent rendering default; web (Kotlin/Wasm with a Kotlin/JS fallback) has been beta since September 2025 and JetBrains still notes web scrolling "has been trailing" native. It is credible for Android-first teams that already write Kotlin. For a TypeScript developer who needs a document-style web presence and Figma-driven design, it is three new things at once (Kotlin, Compose, Skia-rendered web).

## 9. Comparison table

| | 1. Expo universal | 2. Expo + Next.js monorepo | 3. SwiftUI + web | 4. Flutter | 5. Capacitor / PWA | 6. Tauri 2 / KMP |
|---|---|---|---|---|---|---|
| Maturity 2026 | High. SDK 57, New Arch only, Expo UI stable, Router v56 fork is fresh | High per side; the sharing layer is thin and Solito lags SDK 55+ | Highest on iOS; Xcode 26.3 agent | High mobile; web canvas, Wasm going default | High as a runtime; Ionic in catch-up mode | Tauri mobile still rough; CMP iOS stable, web beta |
| Solo DX with Claude Code | Best fit: TS, React, one codebase, huge training corpus | Good, but two UIs to keep in sync | Strong tooling, unfamiliar language to review | Strong official plugin and MCP; new language | Best raw familiarity; native quirks live in plugins | Weak (Rust or Kotlin, small corpora for mobile) |
| Web output | Good app shell; static HTML per route; SSR alpha; SEO for big catalogs weak | Excellent (Next.js 16) | Excellent (separate Next.js) | Canvas; poor SEO by Flutter's own docs | Excellent (it is the site) | Web is the site (Tauri) or Skia canvas (CMP) |
| Native feel and animation | Very good: Reanimated 4.5, GH 2.32/3.x, Expo UI SwiftUI and Compose, sortables | Same as 1 on mobile | Best | Very good, but Liquid Glass lagging | Weakest; web view animations | Web view (Tauri); Skia (CMP) |
| Store path and cost | 99 USD/yr + 25 USD; EAS Free or 19 USD/mo | Same | 99 USD/yr; no Android | 99 USD/yr + 25 USD | 99 USD/yr + 25 USD; 4.2 risk | 99 USD/yr + 25 USD |
| Figma to code and tokens | MCP + Tailwind @theme or Tamagui tokens; no first-party RN mode | Same tokens on both UIs | First-party Figma SwiftUI skill | MCP + VGV skill, golden tests | Web tooling, best in class | Thin |
| Biggest risk | RNW in maintenance; SSR alpha; Router fork churn | Double UI cost grows with social roadmap | Two or three UI codebases for one person | Dart plus canvas web | Rejection under 4.2; feel | Immaturity |

## 10. Ranked recommendation

### 1. Expo + React Native + Expo Router, universal, in a monorepo layout from day one

Reasoning tied to the roadmap:

- Mobile first: Expo UI (stable in SDK 56) plus Native Tabs, native Stack headers, and Liquid Glass toolbars give this app native sheets, pickers, and navigation without leaving TypeScript. Reanimated 4.5 with the CSS API covers the comparison-card transitions; worklets plus Gesture Handler plus react-native-sortables cover drag to reorder and list insertion on the UI thread.
- Web too: static output gives a real multi-page web app for the logged-in loop today, deployable on Vercel or EAS Hosting for free. Bluesky proves the pattern at scale.
- Social later: one codebase means the feed, friends, and match percentage ship to iOS, Android, and web in one pass. This is where the two-UI paths fall behind fastest.
- Intentional design: use Figma MCP with Claude Code, export Figma variables into one Tailwind v4 `@theme` (Uniwind now, NativeWind v5 when stable) or Tamagui config, and build on React Native Reusables so every component is yours to match the Figma.
- Solo developer with Claude Code: the largest React Native and TypeScript corpus, one language across app, packages, and (if you want) backend, and no code the developer cannot review.

Structure the repo as `apps/mobile` (Expo, includes the web build) plus `packages/core`, `packages/api`, `packages/tokens` in pnpm workspaces. That costs nothing now and keeps option 2 open.

### 2. Add Next.js for web later, sharing packages (Path 2 as an evolution, not a start)

Trigger to add it: when public, indexable game pages or user profile pages become an acquisition channel, or when Expo Router SSR is still alpha at that point. Import `packages/core` and `packages/tokens`; do not try to share React Native UI into Next.js. Skip Solito unless you want its Link and navigation shims.

### 3. SwiftUI for iOS with a separate Next.js web app

The best-feeling iOS app and the best Figma pipeline, at the cost of two UI codebases immediately and Android via Skip or never. Choose this only if Android is genuinely off the table and web is explicitly a secondary, lower-fidelity surface. For a solo developer on this roadmap it is a maintenance trap once the social layer lands.

### 4. Flutter

Coherent and well tooled for Claude Code, with a strong Figma skill, but it adds Dart, breaks TypeScript sharing with the backend, and its web build is the wrong shape for public content. Would move to second if web were dropped.

### 5. Capacitor wrapping Next.js

Fastest to a store listing, weakest on the two things the brief says matter (animation quality, intentional native feel), and carries the 4.2 review risk. Reasonable only as a temporary stopgap, and stopgaps become permanent.

### 6. Tauri 2 mobile, Kotlin Multiplatform

Not credible for this developer and roadmap in 2026.

## 11. Concrete starting stack for path 1 (September 2026)

- Expo SDK 57 (React Native 0.86, React 19.2), TypeScript strict, Expo Router with `web.output: "static"`, continuous native generation (never edit `ios/` or `android/`).
- Animation: Reanimated 4.5.1 and react-native-worklets 0.10.1 (SDK pins). Gesture Handler: stay on the 2.32 pin for SDK 57 and move to 3.x when SDK 58 adopts it, or opt in now knowing you are off the pin.
- Reorder: react-native-sortables (or react-native-reorderable-list for a plain list). Verify web behavior early; fall back to a `.web.tsx` variant with a DOM sortable if needed.
- Native surfaces: Expo UI for sheets, pickers, segmented controls, menus, and the game detail bottom sheet; provide web fallbacks.
- Styling and tokens: Uniwind (Tailwind v4) with tokens in `packages/tokens` exported from Figma variables; React Native Reusables for base components. Alternative: Tamagui 2 if you prefer a styled-system with its own compiler and kit.
- Auth: Supabase with Sign in with Apple (expo-apple-authentication on iOS, Apple OAuth on web and Android) plus Google; Apple is required by 4.8 the moment Google is offered.
- Backend: separate service from day one (FastAPI in Python if you want to practice it, or a TypeScript service) proxying IGDB and later Steam; the app only talks to your API.
- Delivery: EAS Free during development, Starter (19 USD per month) once you submit weekly; EAS Submit for both stores; EAS Update for JavaScript-only fixes within the OTA rules. Web on Vercel or EAS Hosting free tiers.
- Store accounts: Apple 99 USD per year now; Google Play 25 USD now and, if it is a personal account, start the 12-tester, 14-day closed test the moment you have a build, because the calendar is the bottleneck.

## 12. Things to re-check at project start

- Whether Expo SDK 58 (expected around October 2026 on the three-per-year cadence) adopts Gesture Handler 3 and promotes Native Tabs or SSR out of alpha.
- NativeWind v5 stable status versus Uniwind adoption; pick one and do not switch mid-project.
- react-native-sortables web support.
- Supabase's current Sign in with Apple flow on web and Android for Expo.
- Google Play Trusted Web Activity policy if a PWA on Play is ever considered.

## Sources

Expo, React Native, and the universal path

- [Expo SDK 57 page](https://expo.dev/sdk/57)
- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57)
- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)
- [Expo SDK 57 bundledNativeModules.json (sdk-57 branch)](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/bundledNativeModules.json)
- [Expo Router v55: more native navigation, more powerful web](https://expo.dev/blog/expo-router-v55-more-native-navigation-more-powerful-web)
- [Expo Router v56 ships SSR and breaks free from React Navigation (Expo on DEV)](https://dev.to/expo/expo-router-v56-ships-ssr-and-breaks-free-from-react-navigation-4pfb)
- [Expo Router static rendering docs](https://docs.expo.dev/router/web/static-rendering/)
- [Expo Router server rendering docs](https://docs.expo.dev/router/web/server-rendering/)
- [Expo Router native tabs docs (search snippet)](https://docs.expo.dev/router/advanced/native-tabs/)
- [Develop websites with Expo](https://docs.expo.dev/workflow/web/)
- [Expo DOM components guide](https://docs.expo.dev/guides/dom-components/)
- [Using Next.js with Expo for web](https://docs.expo.dev/guides/using-nextjs/)
- [Expo monorepos guide](https://docs.expo.dev/guides/monorepos/)
- [Expo UI stable in SDK 56](https://expo.dev/blog/expo-ui-stable-sdk-56)
- [Expo Application Services pricing](https://expo.dev/pricing)
- [Expo billing plans (search snippet)](https://docs.expo.dev/billing/plans/)
- [EAS Update introduction (search snippet)](https://docs.expo.dev/eas-update/introduction/)
- [expo-apple-authentication docs](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [React Native blog (0.85, 0.86, 0.87, legacy architecture removal)](https://reactnative.dev/blog)
- [Reanimated 4 stable release (Software Mansion)](https://swmansion.com/blog/reanimated-4-stable-release-the-future-of-react-native-animations-ba68210c3713/)
- [Reanimated web support docs](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/)
- [Gesture Handler 3.0 announcement (Software Mansion)](https://swmansion.com/blog/introducing-gesture-handler-3-0-hook-based-api-deeper-reanimated-integration-more-9185b0c8e305/)
- [react-native-gesture-handler on npm (search snippet)](https://www.npmjs.com/package/react-native-gesture-handler)
- [React Native Sortables docs](https://react-native-sortables-docs.vercel.app/)
- [react-native-sortables on npm (search snippet)](https://www.npmjs.com/package/react-native-sortables)
- [react-native-reorderable-list (search snippet)](https://github.com/omahili/react-native-reorderable-list)
- [Future of React Native Web, discussion #2816](https://github.com/necolas/react-native-web/discussions/2816)
- [react-native-web registry metadata](https://registry.npmjs.org/react-native-web)
- [Bluesky social-app repository](https://github.com/bluesky-social/social-app)
- [Bluesky social-app README](https://raw.githubusercontent.com/bluesky-social/social-app/main/README.md)
- [React Native Web + Expo Guide 2026 (search snippet, bundle size)](https://reactnativerelay.com/article/react-native-web-expo-cross-platform-2026)
- [Using React Native components in a Next.js web app via the Expo Next adapter (search snippet)](https://dev.to/isaacaddis/using-react-native-components-in-a-nextjs-web-app-via-exponext-adapter-3497)

Styling and components

- [NativeWind homepage](https://www.nativewind.dev/)
- [NativeWind registry metadata (dist-tags)](https://registry.npmjs.org/nativewind)
- [NativeWind v5 migration guide (search snippet)](https://www.nativewind.dev/v5/guides/migrate-from-v4)
- [Uniwind homepage (search snippet)](https://uniwind.dev/)
- [Introducing Uniwind (search snippet)](https://reactnativecrossroads.com/posts/introducing-uniwind-the-fastest-tailwind-bindings-for-react-native/)
- [Tamagui 2 announcement](https://tamagui.dev/blog/version-two)
- [Tamagui v2.0.0 release (GitHub API)](https://api.github.com/repos/tamagui/tamagui/releases/tags/v2.0.0)
- [Tamagui latest on registry](https://registry.npmjs.org/tamagui/latest)
- [Unistyles 3 getting started (search snippet)](https://www.unistyl.es/v3/start/getting-started/)
- [react-native-unistyles on npm (search snippet)](https://www.npmjs.com/package/react-native-unistyles)
- [React Native Reusables README](https://raw.githubusercontent.com/founded-labs/react-native-reusables/main/README.md)
- [React Native Reusables repository metadata (GitHub API)](https://api.github.com/repos/founded-labs/react-native-reusables)
- [gluestack v3 release post (search snippet)](https://gluestack.io/blogs/gluestack-v3-release)
- [gluestack-ui repository (search snippet)](https://github.com/gluestack/gluestack-ui)

Figma tooling

- [Guide to the Figma Dev Mode MCP Server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Dev-Mode-MCP-Server)
- [Figma MCP with Claude Code in React Native, Simform (search snippet; page fetch blocked)](https://medium.com/simform-engineering/figma-mcp-with-claude-code-in-react-native-f1a2fab10eaf)
- [Figma-to-Flutter with a Claude Code skill and golden tests (Very Good Ventures)](https://verygood.ventures/blog/figma-to-flutter-claude-code-skill-golden-tests/)

Monorepo and Next.js

- [Solito compatibility](https://solito.dev/compatibility)
- [Solito releases](https://github.com/nandorojo/solito/releases)
- [Solito 5 is now web-first](https://dev.to/redbar0n/solito-5-is-now-web-first-but-still-unifies-nextjs-and-react-native-2lek)
- [Turborepo with-react-native-web example](https://github.com/vercel/turborepo/tree/main/examples/with-react-native-web)
- [Next.js end-of-life dates (search snippet)](https://endoflife.date/nextjs)
- [Next.js blog (search snippet)](https://nextjs.org/blog)

SwiftUI and Xcode

- [Apple newsroom: Xcode 26.3 unlocks the power of agentic coding](https://www.apple.com/newsroom/2026/02/xcode-26-point-3-unlocks-the-power-of-agentic-coding/)
- [Anthropic: Claude Agent SDK in Xcode](https://www.anthropic.com/news/apple-xcode-claude-agent-sdk)
- [Claude in Xcode 26 guide (Claude Lab)](https://claudelab.net/en/articles/claude-code/claude-code-xcode-ios-development)
- [Agentic coding in Xcode 26.3 (Swiftjective-C)](https://swiftjectivec.com/Agentic-Coding-Codex-Claude-Code-in-Xcode/)
- [XcodeBuildMCP guide 2026 (search snippet)](https://mcp.directory/blog/xcodebuildmcp-complete-guide-2026)
- [Claude Code with Swift: SwiftUI, SPM, Xcode workflow (search snippet)](https://claudify.tech/blog/claude-code-swift)
- [Apple Developer Program](https://developer.apple.com/programs/)
- [Apple's Xcode 26 requirement for Capacitor apps (Capawesome, search snippet)](https://capawesome.io/blog/xcode-26-requirement-for-capacitor-apps/)
- [Skip: official Android support in Swift 6.3](https://skip.dev/blog/swift-63-android-support/)
- [Skip repository (search snippet)](https://github.com/skiptools/skip)

Flutter

- [Flutter and Dart 2026 roadmap](https://flutter.dev/blog/flutter-darts-2026-roadmap)
- [What's new in Flutter 3.47](https://flutter.dev/blog/whats-new-in-flutter-3-47)
- [Flutter release notes](https://docs.flutter.dev/release/release-notes)
- [Web support for Flutter](https://docs.flutter.dev/platform-integration/web)
- [Dart and Flutter MCP server and Claude Code plugin](https://docs.flutter.dev/ai/mcp-server)
- [Liquid Glass support tracking issue (search snippet)](https://github.com/flutter/flutter/issues/170310)
- [cupertino_native package (search snippet)](https://pub.dev/packages/cupertino_native)

Capacitor, Ionic, Tauri, Kotlin Multiplatform

- [Announcing Capacitor 8](https://ionic.io/blog/announcing-capacitor-8)
- [The road to Capacitor 9](https://ionic.io/blog/the-road-to-capacitor-9)
- [Ionic Framework v9 community update](https://outsystems.canny.io/ionic-feature-requests/p/ionic-framework-v9-community-update)
- [The future of Ionic's commercial products (search snippet)](https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products)
- [Tauri 2.0 stable release](https://v2.tauri.app/blog/tauri-20/)
- [Compose Multiplatform 1.11.0](https://blog.jetbrains.com/kotlin/2026/05/compose-multiplatform-1-11-0/)
- [Compose Multiplatform 1.9.0: web goes beta (search snippet)](https://blog.jetbrains.com/kotlin/2025/09/compose-multiplatform-1-9-0-compose-for-web-beta/)

Store policies and fees

- [App Store Review Guidelines (2.5.2, 4.2, 4.8)](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Console: get started (registration fee, verification)](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)
- [Google Play: app testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [What app stores allow with OTA updates (Bitrise, search snippet)](https://bitrise.io/blog/post/what-app-stores-allow-with-ota-updates-apple-and-google-policy-explained)
- [Expo OTA updates: what EAS Update can and cannot ship (ShipNative, search snippet)](https://www.shipnative.dev/blog/expo-ota-updates)
- [Fixing an App Store 4.8 login rejection (search snippet)](https://ptkd.com/journal/app-store-rejection-4-8-sign-in-with-apple-requirement-fix)
