# Naming: shortlist and collision checks

Decision 2026-09-15: **Verso** adopted as the working name. Not final; the developer was lukewarm and may revisit before store submission.

Written 2026-09-15 for work queue item 5 (see [ROADMAP.md](../../ROADMAP.md#work-queue-what-claude-has-landed)). The working name, gaming-beli, is a placeholder and was never meant to ship. This is a shortlist to choose from, not a recommendation to act on unilaterally: the developer picks.

## Method

Eleven candidates, each checked the same way, all on 2026-09-15:

- App Store and Google Play collision: a web search for the name plus "app" or "app store" / "google play," looking for an existing app using the same or a confusingly similar name.
- Company or product collision: whether an existing company or product, in games, media tracking, or elsewhere, already operates under the name.
- Trademark, at a basic level: a web search for the name plus "trademark," reading only registration hits, not a legal clearance search.
- Domains: whether `.com`, `.app`, and `.gg` are already registered, checked by RDAP lookup (the modern replacement for WHOIS; plain WHOIS was blocked in this environment for two of the three registries, so RDAP via rdap.org was used throughout for consistency). A registered domain does not always mean an active site; several here are parked or belong to unrelated small businesses.
- Social handles: a web search for the name plus "instagram tiktok twitter handle," which surfaces an existing account if one is indexed and prominent. Absence of a hit is a weak signal, not proof the handle is free; a 404 on the profile page would be a stronger signal but was not fetched for every platform to keep this pass economical.

None of this is a substitute for an actual trademark clearance search or for registering the domain and handles before announcing a name. Short, real-word, or near-real-word brand names are hard to keep fully clear; every candidate below has some existing use of the word somewhere. What varies is whether that use sits in software, in the same product category, or somewhere unrelated enough not to matter.

## Comparison table

| Name | Idea | App Store / Play collision | Trademark / company | Domains (.com / .app / .gg) | Social | Risk |
|---|---|---|---|---|---|---|
| Rankt | "Rank it," literal | Yes: a decision-ranking app, a creator-influence scoring app, and "RankTogether" all live today | rankt.com has run a credit-card ranking product since 2008 | all taken / taken / free | no dedicated handle confirmed | High |
| Stackt | Stack-ranking, tiered lists | None found | STACKT trademark exists, but for yoga mats and gym bags; "STACKT Market" is a Toronto shipping-container venue, not software | taken (2011) / taken (2024) / free | none found | Low |
| Duello | Italian for "duel," names the comparison mechanic directly | Yes: a live "DUELLO" trivia-duel app, and an existing studio, Duello Games, publishing several titles | no exact registered mark found, but Duello Games operates today in the same casual-game space | taken (2002) / taken (2025) / free | none found | High |
| Pinnd | "Pinned" to the top of your list | Yes: a live "PINND" local-deals app backed by a UK company, PINND APP LTD | no US trademark found; the company operates today under this name | taken / taken / free (also pinnd.us, .io, .tech all taken) | not confirmed | High |
| Faveo | Softened "favorite" | Yes: "Faveo Helpdesk" (support ticketing) on both stores | FAVEO is a registered trademark for helpdesk software, the closest direct software-class hit in this set | taken (2002) / taken (2023) / free | @faveohelpdesk on Instagram | High |
| Sesh | Casual "session" (game sesh, movie sesh) | Yes: multiple current fitness-tracker apps literally named "sesh" | numerous registered SESH marks (Skullcandy, a SaaS meetings product, tobacco goods, more) | taken (1995) / taken (2018) / free | an @sesh Instagram account appears to exist | High |
| Rungs | Ladder rungs, climbing the ranking | Yes, adjacent: "Rungs: Word Ladder Game" (a puzzle game) and "TennisRungs" (a tennis ladder-ranking app) | no exact mark found | taken (1998) / taken (2022) / free | none found | Moderate |
| Rivet | "Riveting," holds attention; also a literal fastener | Weak: unrelated Rivet apps (streaming remote, job portal, dating), and Google's own kids'-reading app "Rivet" existed but was shut down | multiple RIVET marks in unrelated classes; one (Rivet Industries) covers AR/VR headsets and software, the nearest adjacency | taken (1995) / taken (2020) / free | handles found belong to unrelated people | Moderate |
| Verso | Latin/Italian "turn"; a book's left-hand page; echoes "versus" | Weak: several unrelated small "Verso" apps (fintech, notes, a music filter, healthcare alerts) | several registered VERSO marks in unrelated classes; Verso Books and the former Verso Corporation (paper) are older uses of the plain word | taken (1996) / taken (2018) / free | @weareverso (X) and @verso_yreverso (Instagram) exist, apparently unrelated small accounts | Moderate |
| Podia | Podium, first/second/third place | No ranking-app hit, but the word is dominated by Podia, an established online-courses platform (founded 2014) | Podia holds multiple registered US trademarks and publishes brand-enforcement guidelines | taken (1998) / taken (2025) / free | established Podia accounts across platforms | High |
| Tallo | Invented, close to "tally" | Yes: Tallo is a live career-discovery app with 1.4M+ members, on both stores | a TALLO trademark application exists (cosmetics class); the operating brand is the real conflict | taken (2003) / taken (2024) / free | @apptallo (Instagram), @talloapp (TikTok) | High |

Pattern worth naming plainly: every `.com` and every `.app` in this list is already registered. Short, pronounceable words almost always are. `.gg` is free for all eleven. That should not be read as "use `.gg`" by default (it reads game-specific and this app is meant to expand past games), just as the one clean signal domain checks gave here. A workable `.com` for a name like this will likely mean a prefix or suffix (get-, -app, play-) rather than the bare word, or buying a taken domain, or accepting `.app` for the primary link and redirecting `.com`.

## The eleven, one at a time

**Rankt.** The most literal name on the list, "rank" with the vowel dropped in the current style (Bolt, Fount, Linktr.ee). It reads fine for games and would carry to movies and TV without strain, but it is also the most crowded: a decision-making app, a creator-influence scoring product, and a friend-ranking app ("RankTogether") all use close variants today, and rankt.com has been an operating credit-card-ranking business since 2008. Too close to too many existing products to be safe.

**Stackt.** "Stack" as in stack-ranking or a tiered list, with the same dropped-vowel spelling. No app on either store uses it, the one registered trademark is for yoga mats and gym bags, and "STACKT Market" in Toronto is a physical shipping-container venue, not software. The domains are taken but by what looks like unrelated or dormant registrations, not a live competitor. Lowest collision risk found in this pass.

**Duello.** Italian for "duel." Of everything on this list, this is the name that most directly describes what the app actually does: two things, pick one. It reads well for games, movies, or shows equally, since dueling implies preference, not genre. The problem is that "Duello" is already a live product in an overlapping space: a Google Play trivia app called DUELLO, and an existing mobile-game studio, Duello Games, that has published several titles under duello.com since 2002. Real user-confusion risk because the collision is in the same broad category (competitive comparison games), not just the same word used elsewhere.

**Pinnd.** "Pinned" to the top of a ranked list. A live Google Play app named PINND (local hospitality deals) is backed by a registered UK company, PINND APP LTD, and owns most of the obvious domains (.com, .app, .us, .io, .tech). An existing, funded competitor already sits on this exact name.

**Faveo.** A softened "favorite." Reads a step removed from ranking itself (it is about favorites more than head-to-head order) but works across media fine. FAVEO is a registered US trademark held by Faveo Limited for helpdesk software, the one hit in this whole set that is a registered mark in software specifically. Highest trademark risk on the list.

**Sesh.** Slang for a hangout or session ("game sesh," "movie night sesh"). Casual and easy to say, but skews young and informal for a brand meant to last. The word is heavily used already: several fitness-tracker apps are literally named "sesh," and there are numerous registered SESH marks across categories (audio hardware, SaaS meeting software, tobacco goods). Crowded regardless of category.

**Rungs.** The rungs of a ladder, i.e., climbing the rankings. A clean, literal metaphor for the product and plain English, easy to spell when heard. The collision is adjacent rather than direct: "Rungs: Word Ladder Game" is a small word-puzzle app, and "TennisRungs" is an established ladder-ranking tool for tennis clubs, which uses the same ranking metaphor under a close variant of the name. Worth a second look if the developer likes the metaphor, with eyes open to that adjacency.

**Rivet.** "Riveting," something that holds attention, and literally a small fastener, which reads as "a list that holds together." Does not reference games or ranking directly, so it reads as a general consumer brand from day one, which suits the games-then-everything-else roadmap. No competitor in games or media tracking turned up. The closest things are unrelated apps (a broadcast-streaming remote, a trades job board, a dating app) and Google's own "Rivet" kids'-reading app, which existed but has since been shut down. One registered mark (Rivet Industries) covers AR/VR headsets and related software, an adjacency worth knowing about but not a games or media-tracking conflict.

**Verso.** Latin and Italian for "turn," and the printed-book term for a left-hand page, which gives it a literary, media-adjacent feel that should carry well once movies and TV are added. It also sits close enough to "versus" to echo the comparison mechanic without spelling it out. Several small, unrelated apps already use the bare word (a fintech app, a notes app, a profanity-filtering music app), and it has been a real company name before (Verso Books, the former Verso Corporation paper company), so distinctiveness is the real concern more than direct confusion.

**Podia.** Plural of podium, i.e., first, second, third place, a clean fit for ranking any medium. The catch is that Podia is already a well-known, well-established platform (online courses and digital products, founded 2014, headquartered in New York) with multiple registered trademarks and its own brand-enforcement policy. Reusing this name risks real confusion with a recognizable existing SaaS brand and likely pushback.

**Tallo.** An invented word close to "tally," i.e., keeping score. Short, easy to say, does not reference games. Tallo is already a live, reasonably large career-discovery app (1.4 million+ members, apps on both stores, an active social presence). Not a games or media-tracking competitor, but a real, sizeable brand already owns the name.

## Recommended top 3

1. **Stackt.** Lowest collision of the eleven: nothing on either app store, and the one registered trademark and the one real company both sit in unrelated, non-software categories. "Stack-ranking" is also an honest description of what the ranking engine does under the hood (see [docs/design/ranking-algorithm.md](ranking-algorithm.md)), which gives it a real, not just decorative, tie to the product.

2. **Rivet.** No games or media-tracking competitor found. It does not reference games at all, which is useful given the games-first, everything-else-later roadmap, and it is short and phonetic enough to spell correctly when heard. The tradeoffs are a defunct Google product with the identical name (low ongoing risk, since it is gone) and one hardware-adjacent trademark.

3. **Verso.** The best "grows into a media app" resonance of the group, since it already reads as literary and it echoes "versus" without spelling it out. The word is more crowded than Stackt or Rivet, none of the existing uses are close to games or ranking, so the risk is more about distinctiveness than confusion.

Honorable mention: **Duello** is the single best conceptual fit on the list, since it names the head-to-head mechanic outright, but it is also the riskiest, because the existing "Duello" is a mobile-game studio operating in an overlapping category. **Rungs** is a close second on concept (the ranking-as-ladder metaphor is exactly right) with a smaller, more tolerable collision (a tennis ladder tool, a small word-puzzle game). Either is worth a real trademark search before committing, more so than the top 3.

## What a rename would touch

Nothing below has been changed. If a name is picked from this list (or elsewhere), these are the places "gaming-beli" currently appears and what changing each one costs:

- **Bundle identifier and package name** (`com.gamingbeli.app`, set in `apps/mobile/app.json` under `ios.bundleIdentifier` and `android.package`). Cheap to change now, before any store submission: it is a config value that Expo prebuild regenerates into `ios/` and `android/` (neither directory is committed, per this repo's own rule against hand-editing them). Once an app has been submitted to App Store Connect or Google Play under a bundle ID, that ID is normally permanent for that store listing, so this is the one item worth locking in before the first TestFlight or Play Console upload, not after.
- **Expo slug** (`gaming-beli`, also in `app.json`, plus the URL scheme `gamingbeli`). No EAS project exists yet (no `eas.json`, no `extra.eas.projectId` in `app.json`), so there is no linked EAS project or update channel tied to the current slug. Changing it now is a plain rename with nothing to migrate; changing it after `eas init` would mean either a new EAS project or an EAS-side rename, which is a solved but extra step.
- **GitHub repository** (`rafael-sanchezf/gaming-beli`). Lowest cost of the four: GitHub repo renames can happen at any time from repo settings, and GitHub keeps a redirect from the old name to the new one indefinitely (until someone else claims the old name), so existing clones and links keep working.
- **Supabase project name** (`project_id = "gaming-beli"` in `supabase/config.toml`, and presumably the same display name on the hosted project). The hosted project's display name in the Supabase dashboard is cosmetic and renameable anytime without touching its project ref, database, or API keys. The local `project_id` in `config.toml` is just a label for the CLI to distinguish projects on one machine; it does not have to match the hosted project's name to keep working, but keeping the two in sync avoids confusing a future reader of the repo.

None of these four are hard blockers to picking a new name today. The only one with a real deadline is the bundle identifier, and the deadline is "before the first store submission," which has not happened yet.
