# Profile brief: one profile across media

Written 2026-10-12 by the orchestrating session (Fable) from Rafa's ask of the same day, drawn in the movies site round ([figma-kit/movies-site-round.md](../private/design/figma-kit/movies-site-round.md), the three Profile frames). **Status: a proposal.** Rafa asked for the joint profile to be "locked in in the same round that we complete movies"; it is locked when his letters on the three frames come back and the decision is logged in `ROADMAP.md`. It grows out of [feature-ideas.md, idea 11](../feature-ideas.md#11-one-taste-profile-across-media) (2026-10-08) and replaces the games-shaped Profile in [specs/profile.md](specs/profile.md) when coded.

## What he said, decoded

"Since we're doing cross-media recommendations, it's very clear we should have a joint profile screen." And the account is underbaked: "the email is what's being used as my name. So we need an option for name, change profile pic, all that kind of stuff. And also segmenting across the different media I participate in, but also only being movies if I only do movies, only games if I only do games."

Three asks, one screen: a profile that is one page across the media the person tracks; the identity a person chooses (a name, a handle, a photo) instead of what sign-up left behind; and the page shaped by what the person chose in the questionnaire (decision 25), one medium or several.

## What exists

- `profiles` has `username` (unique, lowercase letters, digits and underscores, 3 to 24, null until set), `display_name` and `avatar_url` since the core schema; a trigger seeds the name and the picture from Google when the account came from Google, and leaves both empty for an email account, which is why Rafa sees his email's local part as his name ([specs/profile.md](specs/profile.md), Data). `profiles.platforms` (where you play) and the watch settings (region, services) are on the same row.
- The Profile spec's Settings section already plans Edit profile with the display name and the username through `updateMyProfile`; no screen was drawn for it, and no photo upload exists (no storage bucket).
- The engine plans "your taste in a paragraph", one cached summary per user and medium ([recommendation-engine.md](recommendation-engine.md), where the AI is, item 3).
- The web brief proposes `/u/<username>`, a public read-only ranking page, opt-in and off by default ([web-brief.md](web-brief.md), question 4).
- Rule 24 holds: lists, rankings and predictions never merge across media. Cross-media picks are a labelled slot on Home, later (engine stage 4).

## The page

**Profile is one tab and one page for every medium.** The tab bar is the current medium's (Home, Search, Ranking, Watchlist or Next, Profile), but the page it opens is the same whichever medium is active; the medium switcher does not apply on it, and the header shows no medium chip, only a settings icon. Top to bottom:

1. **Identity.** The photo (64), the display name (22 bold), then "@handle · joined Mon YYYY" (15 secondary), and an Edit pill. With no photo, the initials on a placeholder circle. With no display name, the handle; with neither, "Set your name" as the name line in the brand green, which opens Edit profile (the email never shows as a name again).
2. **Segments, only when the person tracks more than one medium:** All · Games · Movies (TV and Books join when they ship). All is the default and shows every section; a medium segment shows that medium's page alone, which is the One medium layout below.
3. **Your taste, in Verso's words.** One short paragraph the engine writes from the rankings, across the media on the page (one more model call over the per-medium summaries it already caches), labelled as written by Verso. Under it, "Copy for your AI": the profile as plain text (the paragraph, the top ten per medium, the counts) copied to the clipboard for the person to paste into any assistant. Started by the person only, nothing leaves otherwise (decision 21). Hidden until the engine has five ranked items in some medium (its content profile's floor).
4. **A section per medium**, in the order of the questionnaire: the medium's name, its counts at the right ("48 ranked · 12 backlog"; for movies "31 ranked · 12 watchlist"), then the top of its ranked list as a row of small poster cards, the rank and the score as the pill, "See all" to the Ranking tab in that medium. Four cards visible, the row scrolls to ten. Game art is 2:3 on the site and in the app since the Steam library capsule replaced the 3:4 cover; the card is the same component as Home's rows.
5. **Share my profile.** The native share sheet with the `/u/<handle>` link when the public profile is on, and the plain-text top tens when it is off (the top-10 image, V1, replaces the text). One button for the whole profile; a medium segment's page shares that medium alone ("Share my top 10").
6. **Recent.** The activity across media, newest first: "Ranked *Dune: Part Two* · #2 · 9.6", "Watched *Parasite* · Netflix", "Ranked *Hades* · #1 · 9.8", each with the small poster and a relative time. Movies' diary rows and games' placements in one list; a medium segment filters it.

**One medium.** When the person tracks one medium, or taps a medium segment: the identity row; the stat tiles that medium had (movies: Watched, This year, Ranked, Hours; games: Ranked, Backlog, Upcoming, Friends until social exists); the taste paragraph for that medium; "Your top films" (or games) as the card row; "Share my top 10"; Recent as that medium's diary. No segments. A second medium is added from Edit profile ("Media you track"), which is decision 25's "add a medium" door; the page gains the segments and the second section the moment the first item is ranked there.

**Edit profile** (pushed from the Edit pill and from Settings): the photo with "Change photo" (the system picker; a `avatars` storage bucket with owner-only policies, resized to 512 on upload); Name; Username with the rule as a hint and the database's uniqueness error shown inline; Media you track with a check per chosen medium and "Coming" on TV and Books; Public profile, a switch, off by default, with one line saying what it shows (rankings, tiers, scores) and what it never shows (notes, the diary, the backlog, hours). Save in the brand green.

## Rafa's letters, 2026-10-12, and the second draw

On the three frames, by voice: "on board with having a generic profile for now and tailored individual profiles for different media types later". What changes:

- **Moving between media.** The segments All · Games · Movies are not the way: "the current tab format can get really busy once you have more forms of media". The default is always All; the control should be like the switcher on Home, "little icons on the top right". Proposed: Home's switcher pattern under the identity row, "All" as the active word with the mark, then one icon per tracked medium (gamepad, film; TV and books when they ship); tapping an icon makes that medium the active word and the page that medium's; icons never multiply into tabs. The segments go.
- **The taste paragraph goes**, and "Copy for your AI" with it ("AI slop, not something we need"). The share with an AI reading of idea 11 is closed for now.
- **Stats in Beli's shape:** top X% of rankers, the number ranked, hours. On All: Ranked 79 · Top 8% · 128 h. On one medium: Watched 31 · Ranked 31 · Top 12% · 64 h. The percentile comes from `ranking_percentiles` over users, a count per user against the cohort; drawn now, computed when the cohort is more than one person.
- **Recent collapses:** two or three rows and "See all ›"; the expanded view is a calendar, "when you click on recent, it expands to show you a calendar and all the movies you've ranked", Beli's dining map for a medium that has no place. Drawn as `Profile · Activity`: a month grid with the poster on each day something was watched or ranked, the list under it, the month switchable.
- **Friends from Profile.** "We need some sort of social, access your friends from here", and suggested friends as Beli does. Proposed: a Friends section between the stats and the medium sections: the count, a row of avatars, "Find friends", then "Suggested" with three people and a Follow pill each, drawn from shared taste once there are users. Decided the same evening (VER-166): the door ships in the beta as a placeholder, follows in V2; the Suggested card is hidden whenever there is nothing to suggest, "it's better for us to just not show anything" than to suggest blind, and suggestions arrive later from contact ingestion (a phone number, the contacts on the app) and friend-of-friend overlap.
- **Share my profile** shares the public link when the public page is on (the top ten per medium, the stats, the handle; never the diary or notes) and offers to turn it on when it is off; the image version is V1's top-10 card.
- **Streak:** "games can be long"; not now, a backlog card to think through carefully.
- The handle, Edit profile and the public switch stand as drawn.

## Rafa's letters, 2026-10-12, round two

On the seven redrawn frames, by voice: the filter sheet "looks great", the slider needs more indication of time (tick labels along the track); the Watchlist zooms out as far as five across, "the number of movies you see variable depending on your zoom level, like TCG Pocket's collection"; the Activity calendar is liked, and a day with several entries shows one or two posters and a "+2" badge; the rank number leaves every line and pill, "I just need to know the score". And a rule for the verb on a line:

- **His view.** "Ranked" for everything for now, because the app does not know that the day a film was ranked is the day it was watched. Then a rule: anything entered near account creation or through bulk entry says "Ranked X"; anything entered individually later says "Watched X" (movies) or "Finished X" (a game that was in Playing), with that day as the date.
- **Claude's answer, and the design.** Agreed on the intent; the exact signal is the entry's source, not the days since sign-up, and the app already has it: the movies log sheet writes a diary row with a date the person set, so "Watched Parasite" is known, not guessed; a bulk-entry tap and a Letterboxd row without a date do not say when. So the diary row carries `source` (log sheet, bulk entry, import) and the line reads "Watched X" or "Finished X" when the source is the log flow (the person gave the date), "Ranked X · score" otherwise; the ranking never implies a date (rule 35). Letterboxd rows that carry a watched date read "Watched" with that date. Until the source column exists, "Ranked" everywhere, as he said. One migration column, no new screen; the frames show both verbs.

## What is inferred, and flagged

- The All segment shows sections, never one merged list; a combined top list across media was idea 11's open question and the answer here is no, by rule 24. Flagged.
- The taste paragraph on Profile is the first user-facing model text outside the picks' reasons; it is cached per user and medium and refreshed when ten more items are ranked, so it costs about one call per user per month at the beta's size. Flagged as a cost, not a design.
- "Copy for your AI" is the small reading of "share with an AI"; a live connection an assistant reads with permission is the larger one and stays open.
- Friends on the games tiles stays "—" until social (V2); the joint page does not add a friends row.
- The public page's content follows the web brief's question 4; this brief does not reopen it.

## Cost

One migration (the `avatars` bucket and its policies; nothing on `profiles`, which has the three columns), the Edit profile screen, the Profile screen rebuilt on the three states (every medium, one medium, empty), the cross-media paragraph once the per-medium summaries exist, the text export, the share sheet's two cases. Medium: about three agent-days after the frames are approved, and it rides the beta's Profile work rather than waiting for V1, because the email-as-name is a beta blocker.

## Questions for Rafa, with the defaults

1. The handle: required at sign-up, or optional until the person shares or turns the public page on? Default: optional, asked once on first share, since the beta cohort is invited and friends come in V2.
2. Should the taste paragraph show on the page by default, or behind a tap? Default: on the page, since it is the profile's one sentence about the person.
3. The All segment's Recent: one list across media (default) or per medium only?
4. The display name: free text with a length cap of 40, no uniqueness? Default yes.
