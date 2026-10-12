# Figma workflow

Written 2026-09-07. How UI design for this app happens, and how Claude Code and Figma talk to each other.

## Why Figma sits in front of the code

The app is meant to be published. Letting the first implementation define the interface tends to produce screens that are neither consistent nor reusable. So every screen is designed in Figma first, reviewed and adjusted there, and only then built. The design file, not the codebase, is the source of truth for how things look.

## Setup status

- The official Figma plugin for Claude Code is installed at user scope (`figma@claude-plugins-official`, version 2.2.107). It configures the remote Figma MCP server at `https://mcp.figma.com/mcp` and ships several skills.
- **Authentication is not done yet and has to be done by you.** From an interactive `claude` terminal, run `/plugin`, go to the Installed tab, select `figma`, press Enter to open the authentication page, and click Allow access. Then `/plugin` should show the server as connected. In the desktop app, the MCP connections panel offers the same authorize flow.
- The Figma desktop app is installed. The desktop MCP server (Dev Mode, local at port 3845) is not needed. It requires a Dev or Full seat on a paid plan and the remote server has the broader feature set, including all write tools.
- The remote server works on all seats and plans. Writing to the canvas is free during Figma's beta.

## The design file

- **Current file (2026-09-15):** https://www.figma.com/design/<figma-file-key> (the key is in `docs/private/CONTEXT.md`), named Verso, in the Verso team (the plan's MCP budget is 200 tool calls per day, 10 per minute). The first file, in the old Starter team's drafts, is superseded and can be deleted.
- Pages: Foundations, Structure round, Direction round.
- Foundations: `Colors` (medium/games, books, movies, tv plus canvas, surface, placeholder, text primary and secondary, separator; one mode, dark values in each variable's description), `Spacing` (4-pt steps), `Radius` (8/12/16/24/pill), ten text styles on the iOS scale in Inter (SF Pro does not render in Figma's screenshot pipeline or in a browser; swap in the fidelity round if wanted), and a token board.
- Structure round, part 1 reactions folded in and part 2 built the same day: Home composite in two switcher states (Games active, Movies active) for a Smart Animate prototype of the icon-to-word morph; Signed out collage; Search A (Beli-style) and B (explore-first); Ranked A (Beli-style list), B (tier sections), C (poster grid); Next A (segmented, two states) and B (one queue); Profile A (Beli-style) and B (minimal); the log flow: tier sheet, Compare A side by side, Compare B stacked, confirm placement. Each frame has a note above it. Placeholder shapes stand in for icons and covers.
- Round 3 (2026-09-15, same file): Game page A (poster-led), B (Beli-style compact header), C (action-first with the button pinned at the bottom); tier sheet v2 over the real game page plus its expanded-to-compare state; Home long press with an iOS context menu; the add-to sheet from a Search row; and revisions from round 2: Next A v2 (Up next header, icon slots on segments, Want to play with Upcoming | Available, drag handles, row hierarchy), Ranking A v2 (labeled tier dividers, list/grid toggle), Compare A v2 (equal cards), Signed out v2 (translucent blurred sheet over a full-height collage). Also a global fix: auto-layout frames default to a white fill, so every inner text container had one cleared, and the Ranked tab was renamed Ranking everywhere.
- 2026-09-16: Structure round row eight holds the revisions from the round 3 reactions. The Direction round page holds three directions over Home, Game B v2, and the expanded compare with real covers (uploaded through `upload_assets` as image fills on the placeholder rectangles), the tier palette board, the Ranking frame with gradient badges, and the logo board (SVG concepts imported with `createNodeFromSvg`; sources in `docs/private/design/assets/logos/`).
- 2026-09-16, fidelity round: two new pages. `Components` holds an Icons section (25 Lucide icons as components, 24px, stroke bound to `text/primary`) and the `Tab bar` component set (Active=Home|Search|Ranking|Next|Profile). `Fidelity round` holds the fourteen winning screens twice: light at y 120 and 1140, dark at y 2160 and 3180 (the dark clones set the Colors collection's Dark mode explicitly). The Colors collection now has Light and Dark modes, the tier palette is five variables, every variable carries WEB code syntax (`var(--color-medium-games)`), and `packages/tokens/tokens.json` is exported from it. Real covers are image fills uploaded with `upload_assets`.
- 2026-09-16, states round: the Fidelity round page gained a fourth and fifth row (light at y 4200, dark at y 5220, a note above): the first-run screen in two variants, the Home Playing-empty state, and the empty states of Search, Ranking, both Next segments, and Profile. The Components page gained the `EmptyState` component set (Action=Button|None) with Title, Body and Label text properties and an Icon instance-swap property, so every empty state on the canvas is an instance. Awaiting reactions.
- 2026-09-16, media structure round: a sixth page, `Structure round · media` (42:2), holds the grayscale frames for movies (row at y 120), TV (y 1160), and books (y 2480): two Home variants, the detail page, the Next tab, and a rows board per medium, plus a seasons screen for TV. Drawn by one Opus agent per medium from a shared kit script and a written brief, with the orchestrating session deciding the content ([media-brief.md](media-brief.md)); the kit hides the Plugin API behind a dozen helpers so every frame shares one visual language, and both are saved in [figma-kit/](../private/design/figma-kit/README.md) for the next round. Awaiting reactions.
- 2026-09-22, movies structure round: a seventh page, `Structure round · movies`, twelve frames drawn from [figma-kit/movies-round.md](../private/design/figma-kit/movies-round.md). 2026-09-28, bulk entry structure round: an eighth page, `Structure round · bulk entry` (93:2), thirteen frames drawn by one Opus agent from [figma-kit/bulk-entry-round.md](../private/design/figma-kit/bulk-entry-round.md), reviewed by the orchestrator from screenshots (five images come back per `use_figma` call, so a thirteen-frame review is three read-only calls). Awaiting reactions.
- 2026-09-29, HIG calibration run: the `hig-review` agent reviewed the `Fidelity round` page (26:2; light frames 26:4 to 26:809, dark 32:593 to 32:1311) against the local HIG mirror. Report in [reviews/2026-09-29-fidelity-round-calibration.md](../private/design/reviews/2026-09-29-fidelity-round-calibration.md): two mechanical Critical findings (primary-button label weight, eight controls under 28 pt needing `hitSlop`), one High that is really a deferred decision (opaque tab bar versus iOS 26's glass bar), and seven pushback items on decided rules awaiting Rafa. Nothing on the canvas was changed.
- 2026-10-07, brand color: three boards on the Foundations page, drawn by the orchestrating session in one call each (`Brand green round · 2026-10-07` 176:2, `Brand green round 2` 180:2, `Brand green round 3` 184:2), carried Rafa's four reactions to decision 29 (deep green `#006822`, the tier palette as four deep solids with white labels). A new page, `Brand color round` (186:2), holds the two Homes recolored by one Opus agent from [figma-kit/brand-color-round.md](../private/design/figma-kit/brand-color-round.md): light and dark, the icon board, nine calls. The Colors collection is unchanged until adoption; the record is [../research/brand-color.md](../research/brand-color.md).
- Signing in: the remote server's grant does not carry between desktop-app sessions. When a session lists `plugin:figma:figma` as needing authentication, Rafa types `/mcp` in that session's message box, picks figma, and signs in there; the tools load the same turn. A terminal is not needed.
- Budget rule: batch at most nine `use_figma` calls per minute, one screen per call with an inline screenshot, and read before write only when the file has changed since the last call.

## What the connection can do

Read side, used when moving from design to code:

- Get the structured design context for a frame (layout, components, variables), a screenshot of it, and the variables and styles it uses.
- Get a sparse outline of a page or file to navigate it without pulling everything.
- Search connected design-system libraries for components, variables, and styles.
- Download exported assets such as icons and images.

Write side, used when drafting designs from this side:

- Create a new Design or FigJam file in drafts.
- Write real, editable Figma content: frames, components, variants, variables, auto layout, text. This is the general-purpose canvas writing tool, driven by the `figma-use` skill.
- Upload images into a file, for example real box art to test layouts with.
- Generate FigJam diagrams from text or Mermaid, for flows and the data model.
- Capture a running web UI as editable Figma layers. Claude Code only. Less relevant for a native mobile app, but useful if a prototype is built in a web view.

Skills the plugin ships that matter for this project (each loads automatically when the matching task comes up):

- `figma-generate-library` builds a design system in Figma from scratch or from a codebase: variables and tokens, component libraries with variant sets and variable bindings, light and dark theming, foundations documentation. This is the tool for step 1 and 2 of the loop below.
- `figma-generate-design` (with `figma-use`) lays out full screens on the canvas using existing design-system assets. This is how Claude drafts a screen.
- `figma-design-to-code` is the mandatory read-side skill for implementing an approved frame as code.
- `figma-swiftui` translates in both directions between Figma and SwiftUI, relevant if the iOS-native path is chosen.
- `figma-implement-motion` and `figma-use-motion` cover animation, which the ranking insertion and comparison transitions will need eventually.
- `figma-code-connect` maps published Figma components to the code components that implement them, so generated code reuses our components instead of re-creating them. Matters once a component library exists in code.

## The working loop

1. **Foundations before screens.** Set up a design file with the standard page structure Figma recommends: Cover, Getting Started, Foundations, Components, Utilities, then one page per feature area. Define variables for color, spacing, radius, and typography before drawing any screen. Every color and spacing value on every screen is a variable, never a raw number.
2. **Components for anything repeated.** Game card, cover thumbnail, tier chip, comparison card, score badge, status pill, list row, tab bar. Build with variants and auto layout. The ranking flow alone reuses the comparison card dozens of times.
3. **Claude drafts, you decide.** For a new screen, Claude writes a first pass onto the canvas using the existing components and variables, and takes a screenshot to check the result. You review and edit in Figma directly. Nothing is built until you are happy with the frame.
4. **HIG review before you react.** (Added 2026-09-29.) Once a round is drawn and before your reaction round, the orchestrator runs the `hig-review` agent (`.claude/agents/hig-review.md`) over the frames. The agent follows the `apple-design` skill installed at `~/.claude/skills/apple-design`, a local mirror of Apple's Human Interface Guidelines with a five-lens audit (accessibility, platform conventions, visual craft, interaction, writing), files the full report under `docs/private/design/reviews/<round>.md`, and returns three ranked findings. The orchestrator fixes accessibility and convention findings on the canvas before you see the round, so your reaction is spent on the product, not on a 3:1 contrast miss. Findings that contradict a numbered rule in [ui-principles.md](ui-principles.md) or a decision in [ui-brief.md](ui-brief.md) are shown to you as pushback with the citation, never applied. The skill is invoked by name only; it is not allowed to fire on its own when a round's screenshots come back for reactions.
5. **Read back, then build.** When a frame is approved, Claude pulls its design context and variables and implements it. Because the values are variables, the code gets tokens rather than magic numbers.
6. **HIG review after the build.** (Added 2026-09-29.) When a screen is implemented, the same agent reviews simulator screenshots of the built screen next to its approved frame: what the frame could not show (Dynamic Type at the largest sizes, VoiceOver labels on icon-only controls, reduced motion and reduced transparency, safe areas on the device) plus drift from the frame. Same report path, same three-finding return, same pushback rule.
7. **Annotate intent, not just pixels.** Behavior that a screenshot cannot show goes in annotations: what happens on "too close to call," how the list animates when a game is inserted, empty states, loading states. Annotations are read as part of design context.
8. **Small selections.** Ask about one frame or component at a time. Large, heavy frames slow the server down and produce worse output.
9. **Rules file.** Once the code stack is chosen, generate a design-system rules file (the plugin provides a prompt for this) so code generation knows the framework, component library, and token naming.

## Naming and structure rules

- Layers get semantic names (CoverImage, TierChip, ComparisonCard), never Frame1268 or Group5.
- Variable names mirror what the code will call them, so the two never need a translation table. Decide the convention once the stack is chosen, for example `color.surface.primary`, `space.4`, `radius.md`.
- One component per repeated element, variants for states (default, pressed, disabled, selected), no detached copies.
- Auto layout everywhere. Resize a frame in Figma before generating code to confirm the layout behaves as intended.
- Every screen frame is a device-size frame (iPhone), and every flow is laid out left to right on its page in the order the user experiences it.

## Screens to design first

In the order the V0 roadmap needs them:

1. Comparison screen (the core of the app: two games, one prompt, two escape hatches).
2. Confirm placement screen ("lands between X and Y, look right?").
3. Tier picker (four tiers).
4. Ranked list, with genre and platform filters and drag to reorder.
5. Backlog list with sort options.
6. Game detail page, designed with slots for V1 data (scores, playtime, time to beat, where to play) even if V0 leaves them empty.
7. Search and add.
8. Tab bar and navigation shell.

## Sources

- [Guide to the Figma MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [Claude Code and Figma: set up the MCP server](https://help.figma.com/hc/en-us/articles/39888612464151-Claude-Code-and-Figma-Set-up-the-MCP-server)
- [Remote server installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation)
- [Tools and prompts reference](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Structure your Figma file for better output](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma skills for MCP](https://help.figma.com/hc/en-us/articles/39166810751895-Figma-skills-for-MCP)
- [Code Connect](https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect)
