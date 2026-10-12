# Development toolchain

Written 2026-09-08 against the recommended stack in [tech-stack.md](tech-stack.md). Grouped by when each tool is needed, with a section on what carries over from Xcode and Python.

## Install before scaffolding

- **Xcode 26.3 or later**, from the Mac App Store, plus the Command Line Tools and at least one iOS Simulator runtime. Required even on Expo: `expo run:ios` compiles the native project with your local Xcode, and the iOS Simulator is how you see the app during development. Also the only way to inspect a native crash.
- **CocoaPods.** Expo's iOS prebuild still installs native modules through it.
- **Node.js LTS** and **pnpm** (the monorepo uses pnpm workspaces). Install Node through a version manager such as fnm or nvm so the project can pin a version.
- **Git**, and a **GitHub** repository for this project. The folder is not a git repo yet; making it one is the first scaffolding step. GitHub Actions will also run the IGDB import script on a schedule, so the repo is part of the backend.
- **Expo CLI** (runs through `npx`, nothing global) and **EAS CLI** for cloud builds, store submission, and over-the-air updates.
- **Watchman** (optional, speeds up Metro file watching on macOS).
- **Supabase CLI** for local development, migrations, and generating TypeScript types from the database schema. Local Supabase runs in **Docker Desktop**, so install that too. Running the whole backend locally means migrations and RLS policies are tested before they touch the hosted project.
- **Figma desktop app** (installed) with the Claude Code Figma plugin (installed, authorized by you).

## Machine setup status (checked 2026-09-08, evening)

Done: Xcode 26.6 with matching Command Line Tools and license accepted; Docker Desktop; iOS 26.5 simulator runtime with iPhone 17 family devices; Homebrew; Node 26; Git and GitHub CLI (logged in); CocoaPods; pnpm; Watchman; Supabase CLI; EAS CLI; Figma MCP plugin (connected); Xcode MCP bridge registered with Claude Code at user scope. 45 GB free after clearing Downloads.

Verified 2026-09-08: the Expo app builds and launches on the iPhone 17 simulator from `pnpm ios`. Two local quirks worth knowing: CocoaPods needs a UTF-8 locale (`export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` if `pod install` crashes with an encoding error), and `expo run:ios` leaves the Metro dev server running afterward by design, so the command does not "finish" until you stop it.

Still to do, all need you:

1. **Xcode MCP server**: enabled 2026-09-08 (the handshake succeeds). If `claude mcp list` still shows a tools timeout, approve the permission dialog Xcode shows when an agent connects.
1b. **System-wide Xcode selection.** The CLI falls back to Xcode correctly, but the explicit selection link is missing, which blocks Claude Code's simulator integration. Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` once.
2. Docker Desktop: installed and the daemon is running.
3. **Accounts** in the next section. Only Supabase and a Twitch developer app are needed for V0.

Not needed: editing the Xcode project by hand, Interface Builder, or configuring signing in Xcode. Expo prebuild generates the project and EAS manages signing.

## Accounts and keys, split by when they are actually needed

**Needed for V0** (building and using the app yourself on the simulator and your own iPhone):

- **Supabase project**, Free tier. The whole backend. Keep it active with a daily ping or it pauses after seven days. Done 2026-09-08: project `gaming-beli`, since renamed `verso` (us-west-2; the ref is in `docs/private/CONTEXT.md`), CLI logged in and linked, database password in the local `.env` only. The ping is a GitHub Action; see "Database keep-alive and CI" below.
- **Twitch developer application** for IGDB. Done 2026-09-08, see [igdb-setup.md](igdb-setup.md). Secret rotated after an accidental exposure and verified by the developer.
- **GitHub repository** (account already logged in). Hosts the code and runs the IGDB import on a schedule. Repo not created yet; happens at scaffolding.

Not needed for V0: the Apple Developer Program. A free Apple ID gives a Personal Team that can sign builds onto your own iPhone from Xcode, with a profile that expires every seven days and a limit of three apps. The simulator needs no signing at all. V0 auth is email only, which sidesteps Apple's Sign in with Apple rule (it only applies once a third-party login such as Google is offered, and only for a published app).

**Needed when the first build goes to someone else's phone or to TestFlight** (late V0 or V1):

- **Apple Developer Program**, 99 USD per year. Unlocks TestFlight, Sign in with Apple, push notifications, App Store submission, and EAS device builds. Enrollment can take days.
- **Expo account**, free, for EAS Build and Submit. Local simulator builds and `expo start` never need it. Account created 2026-09-08 via GitHub sign-in. CLI login: `eas login` uses a browser flow by default (the password prompt appears only with `--no-browser`). The app is not linked to an EAS project yet; that happens with `eas init` at the first cloud build.
- **Google account for Google and Apple OAuth** configuration in Supabase Auth, once third-party login is added.

**Needed for V1 enrichment:** Steam Web API key (free, tied to your Steam account), Vercel project on Hobby for the website and daily cron, OpenCritic on RapidAPI, IsThereAnyDeal API key.

**Needed for Android release:** Google Play Console, 25 USD once, plus the 12-tester, 14-day closed test for new personal accounts.

**Needed for V3:** TMDB API key.

**When users exist:** PostHog and Sentry free accounts.

## Database keep-alive and CI

Added 2026-09-15.

- **Keep-alive.** `.github/workflows/db-keepalive.yml` runs daily (09:17 UTC, also on demand from the Actions tab) and opens a `psql` session against the hosted project to run `select now()`. Direct SQL rather than a REST call because the Free-tier pause is measured on database activity and a PostgREST read is not guaranteed to count. No migration, no heartbeat table.
- **Where the secret lives.** The workflow reads `DATABASE_URL`, a repository secret under GitHub Settings > Secrets and variables > Actions. Its value is the "Session pooler" URI from the Supabase dashboard Connect panel with the password filled in (the session pooler is IPv4-reachable; the direct connection is IPv6-only on Free, which GitHub runners cannot reach). The same secret feeds the catalog-sync workflow. Until it is added, the keep-alive run fails on its first step with a message naming the missing secret. The password itself stays in the local `.env` as `SUPABASE_DB_PASSWORD` and in that one GitHub secret, nowhere else.
- **CI.** The `db` job in `.github/workflows/ci.yml` installs the Supabase CLI (pinned to the version on this machine), starts a trimmed local stack on the runner's Docker (Postgres plus auth; studio, storage, realtime, edge runtime, analytics, and the API gateway are excluded with `supabase start -x`), and runs `supabase test db`. Migrations apply during `supabase start`, so a fresh stack needs no `db reset`. When you bump the CLI locally, bump the `version` in the workflow too.

## Install for Android, before the first Android build

- **Android Studio** with an SDK and one emulator image. Not needed for V0 if you build iOS first, but the Play closed-test calendar means starting Android a few weeks before you think you need it.

## Claude Code integrations that matter here

- **Figma plugin**, installed. Drafts screens onto the canvas and reads approved frames back.
- **Apple design skill** (`dickwu/apple-design-skill`), installed 2026-09-29 user-wide at `~/.claude/skills/apple-design` as a git clone, pinned at commit `6237cc1` (2026-09-29; its HIG mirror was pulled from developer.apple.com on 2026-09-22). A design reviewer grounded in Apple's Human Interface Guidelines, run by the `hig-review` agent at the two review points in [figma-workflow.md](figma-workflow.md). Update with `git -C ~/.claude/skills/apple-design pull`, then reread its `SKILL.md` before trusting it, since it is third-party instructions loaded into context; record the new commit here.
- **iOS Simulator tools**, built into this desktop app. Claude can build the app with Xcode, install it on a simulator, take screenshots, tap through flows, and open a live simulator panel for you to watch. This is how a coded screen gets checked against its Figma frame without you driving the simulator by hand.
- **Xcode 26.3 as an MCP server.** Xcode now exposes its build, test, preview, and documentation-search capabilities over MCP, and Claude Code can connect to it. Relevant when debugging the native side of an Expo build or writing custom SwiftUI views for Expo UI. Not needed for day-to-day TypeScript work.
- **Supabase MCP server**, official, for schema inspection and running migrations from Claude Code. Add when the backend is scaffolded.
- **Expo MCP or docs skill**, check availability at kickoff. Expo's docs change three times a year with each SDK.

## What carries over from Xcode and Python

**Xcode and SwiftUI.** More of this transfers than it might seem, for three reasons.

1. **Expo UI is SwiftUI.** Since SDK 56, Expo UI components render real SwiftUI views on iOS from a JavaScript import: sheets, pickers, segmented controls, toolbars, lists. Knowing SwiftUI's layout model, modifiers, and component vocabulary tells you what Expo UI can and cannot do and why it behaves the way it does.
2. **You can write SwiftUI directly when needed.** Expo supports inline native modules and extending Expo UI with your own SwiftUI views. If the comparison card or the ranked-list insertion animation needs something Reanimated cannot do well, a small SwiftUI view is a legitimate escape hatch, and it is exactly the skill SwiftUI practice builds.
3. **The tooling around Xcode is the iOS design toolkit.** The Simulator, Xcode Previews for quick SwiftUI prototypes, the Accessibility Inspector, Instruments for animation performance, the SF Symbols app for iconography, and Apple's Human Interface Guidelines all apply to this app regardless of what language the screens are written in. Previews in particular are a fast way to prototype an interaction natively before committing to it in Figma or React Native.

What does not transfer: Interface Builder and storyboards, UIKit view controllers, and Xcode project configuration for a pure Swift app. Expo generates and owns the Xcode project; never edit the `ios/` directory by hand because prebuild regenerates it.

On the question of how well Xcode plays with AI tooling: since version 26.3 it plays very well. Apple built agentic coding into Xcode with Claude as a first-party option, and Xcode itself is an MCP server that Claude Code can drive. So anything you build in Xcode can be built with the same Claude Code workflow you use here.

**Python.** The IGDB import and nightly delta script is the natural place to use Python: a standalone scheduled process on GitHub Actions with no shared types. Later, analysis of the comparison log (how consistent are your answers, how many comparisons per insert, genre bias) is a good Python notebook exercise. The default for shared code stays TypeScript.

## Not needed

- A separate API server. The app talks to Supabase directly; Edge Functions and the scheduled script cover the rest.
- Expo Go for day-to-day development once native modules are in. Use a development build installed on the simulator instead.
- A Mac mini or CI Mac. EAS builds in the cloud; local Xcode is for the simulator and debugging.

## Sources

- [Expo: create a debug build locally](https://docs.expo.dev/guides/local-app-development/)
- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57)
- [Expo UI is stable in SDK 56](https://expo.dev/blog/expo-ui-stable-sdk-56)
- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [Xcode 26.3: use AI agents from Cursor, Claude Code and beyond](https://dev.to/arshtechpro/xcode-263-use-ai-agents-from-cursor-claude-code-beyond-4dmi)
- [Using Xcode MCP with Claude Code](https://danielsaidi.com/blog/2026/04/30/using-xcode-mcp-with-claude-code)
- [Xcode 26.3 and Claude Agent: model swapping, MCP, skills](https://fatbobman.com/en/posts/xcode-263-claude/)
