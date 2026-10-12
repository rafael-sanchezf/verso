# Onboarding guidelines

The living document for how Verso brings a person from an empty account to a ranked list and a first pick, and for how the same tool catches a returning user up on what they played. Started 2026-10-06 at Rafa's request, after the bulk-entry round's reactions, as the place where the thoughts on onboarding accumulate; the decisions it rests on are 20, 25, 26 and 27 in [../../ROADMAP.md](../../ROADMAP.md#decisions), the flow is in [onboarding-brief.md](onboarding-brief.md) and idea 1 of [../feature-ideas.md](../feature-ideas.md#1-bulk-entry), the evidence is in [../research/onboarding-notes/](../research/onboarding-notes/), and the arithmetic of the ranking session is in [ranking-algorithm.md](ranking-algorithm.md#the-batch-session-2026-10-06). Add to this file rather than to chat when a thought about onboarding comes up; date it.

## What onboarding is for

The reframe (decision 21) makes the first session the trial: the user should reach ten ranked items and one convincing pick in one sitting, and the benchmarks say the first session decides whether they come back ([preference_elicitation.md](../research/onboarding-notes/preference-elicitation.md)). So onboarding has one unit of progress, ten ranked, and one target time, about three minutes from the media question to the review for a new games user: one tap for the media, two to four for the platforms, three searches for the seeds, ten taps on the deck page, about ten comparisons, and a glance at the review. Everything in the flow is judged by whether it moves that number or that time.

## Two users, one tool

Rafa, 2026-10-06: "be intentional about segmenting the new user experience versus the existing user experience that wants to bulk entry"; the tool is "a speed-run onboarding for a lot of users" and also the catch-up "for the average new user that just needs to catch up on the games they play". The same screens serve both, and each step knows which user it has.

| Step | New user (no ranked games, no platforms) | Returning user (platforms on the profile, three or more ranked) |
|---|---|---|
| Entry | After the media question, before Home | Ranking's door "Rank popular games"; Search's "Add many" (goes straight to the session) |
| Which media | Asked | Not asked; the switcher's "Add a medium" |
| Where do you play | Asked, families then generations | Skipped; an "Add a platform" line at the top of the deck page |
| Three you love | Asked; they are the first ranked games | Skipped when three or more are ranked |
| The deck page | Popular on the platforms, ordered by the seeds' profile, top sellers pinned | Popular on the platforms minus everything with an entry, ordered by the full profile |
| The session | The engine's guess is weak at first and sharpens with every tier tapped; soft target one question per game; "place the rest for me" | The guess is strong; most games need no question |
| Look right? | Every row is new; the ten-ranked line appears here | The new rows, each with about two existing neighbours above and below as anchors, the rest collapsed into a count; new rows highlighted in the medium color, provisional rows marked |
| Link Steam | Offered to PC players, then Home | Only if not linked |

## Principles, dated

1. **Ask only what routes.** Which media, where you play: questions whose answer changes what is shown next. Taste is answered with titles, never with a genre list (2026-10-01, from the elicitation evidence).
2. **Never ask what we already know.** A PC player is offered Steam because they said PC; a returning user is not asked for platforms or seeds again (Rafa, 2026-10-06).
3. **Estimate before you ask.** The engine guesses every placement from the tiers and the profile before the first comparison; questions go where the guess is weak; "place the rest for me" is always available (Rafa, 2026-10-06; [ranking-algorithm.md](ranking-algorithm.md#estimate-first-then-ask-2026-10-06-later)).
4. **Show the guess, make the fix one gesture.** The review shows the whole list with the new and the provisional rows marked, and a long-press drag corrects a placement. A wrong guess costs the user one drag, never a dialog (Rafa, 2026-10-06).
5. **Many at once beats one at a time.** A page of ten popular games invites "I played this, I played this"; a card at a time invites "no, no, no" (Rafa, 2026-10-06, decision 27).
6. **One thing per tap.** The deck row's tier chip says played and how it was in one tap; no "want to play" on the deck, no ownership anywhere (decision 26).
7. **Popular, and expected of you.** The pool is what is popular on the user's platforms; the order is what the profile expects them to have played; a few of the biggest sellers always show (Rafa, 2026-10-06).
8. **Progress, never a wall.** Ten ranked is a goal with a visible count, never a gate; a way out sits on every screen; Beli's four-invite wall is the counter-example ([cluster note](../research/onboarding-notes/cluster-letterboxd-criticker-tasteio-movielens-beli.md)).
9. **Imports accelerate, they do not gate.** Steam is offered at the end, to PC players, after the deck has done its work; the app says nothing about links that cannot exist (PlayStation, Nintendo, Xbox).
10. **Honest about the guess.** Provisional placements look provisional; the harness measures how often the guess matched the user's own placement, and the number is reported before the guess is trusted more.
11. **No answer ever starts a trial or a subscription.** The trial is its own screen, price and renewal date and cancellation above the button (2026-10-06, from the Hims & Hers record).
12. **Answers never leave the app.** No third-party analytics, no ad pixels, nothing from the questionnaire in a URL or an event name (2026-10-06, same source; the "never sold" principle made concrete).
13. **Say where a pick comes from, never "for you".** The questionnaire and the paywall name the source of every pick; "personalized" is what the output is, not what the copy says (2026-10-06, same source).

## What we borrowed, and from whom

Netflix's three titles, Spotify's three artists and Letterboxd's four favourites for the seeds; MovieLens's 2015 finding that a ratings gate caused dropout before the home page; TasteRay's lesson that "a few is enough" must be true; Beli's "been / want to go" shape without its invite wall. The full inventory is in [onboarding-brief.md](onboarding-brief.md#what-the-industry-asks).

## The Hims & Hers case

Rafa raised it on 2026-10-06: a pre-check-in segmentation questionnaire that was commercially effective and later part of regulatory and legal trouble. Researched the same day into [../research/onboarding-notes/hims_hers_questionnaire.md](../research/onboarding-notes/hims-hers-questionnaire.md), every claim dated and linked; what follows is the short form.

**The premise is about half right.** The sign-up does run through a segmenting questionnaire (pick a condition, 5 to 15 questions on goals, the account, 25 to 50 medical questions, then a proposed treatment with its price), and the company credits the "personalized" treatments it routes people into with a retention lift of nearly 20 points in the first year, a company figure with no independent number behind it. But the FDA warning letters, the senators' Super Bowl letter, Novo Nordisk's exit, the securities suits, the SEC inquiry and the DOJ referral are all about compounded GLP-1 drugs and how they were advertised; none names the questionnaire. The questionnaire is central only to the FTC's suit with California and Utah of 2026-07-29 and the three privacy class actions after it. Even there, nobody alleges that segmenting people or asking questions was wrong. What was wrong: pressing submit silently authorized a charge and a renewing subscription, with the disclosure in small low-contrast type under the button; the copy promised a "free consult" to find what was "right for you" and most users got none; the answers went to Meta, Snap and more than a dozen other ad pixels; and cancelling took a hidden menu plus three to ten survey screens. The word that links both strands is "personalized": a claim of personal treatment that the process did not deliver. All the 2026 cases are pending.

**What Verso borrows.** One routing question, then a branch per answer (the media picker, already so). The cheap, goal-shaped block before the heavy one (media and platforms first, titles and the deck after). Show what the answers produced before asking for anything else (the first ranked list and the first pick before any paywall, prompt or friends step). "Personalized" as a property of the output, not a sales word: a reason that cites the user's own titles, which the user can check.

**What Verso refuses, each with its rule.**

1. **Copy the flow cannot back.** No "personalized", "for you" or "knows your taste" on the questionnaire or the paywall; each pick names its source ("popular on your platforms", "close to X and Y in your Loved tier"); no copy implies a neighbor prediction before the harness clears it (decision 24; Apple 2.3.1).
2. **Consent that rides on another button.** No questionnaire or deck answer ever starts a trial or a subscription. The trial is its own screen with the price, the renewal date and how to cancel above the button (ROSCA; California's renewal consent since 2025-07-01; Apple 3.1.2).
3. **A permission step with a real "No".** The model step is its own screen, names what is sent and to whom, gives both buttons equal weight, and a "No" still returns three picks through the SQL fallback of the suggest function, for paid users too; withdrawal is one toggle in Settings (Apple 5.1.2(i), clarified 2025-11-13; 5.1.1(ii) and (iv), the paid-tier reading being Claude's inference).
4. **Answers that leave the app.** No third-party analytics or ad SDK, funnel events in Verso's own table, no ad pixels on the later web site, and no questionnaire answer in a URL or an event name (the FTC's BetterHelp and Cerebral orders; Apple 5.1.2(ii)).
5. **Questions with no consumer in the same session.** Media chooses the decks, platforms filter them, the titles seed the comparisons; nothing else is asked (Apple 5.1.1(iii); the onboarding brief).
6. **Exits harder than entrances.** "Manage subscription" opens the system's subscription screen with no survey wall, the same in every state and country.
7. **Deciding for the user and telling them later.** A provisional placement looks provisional and is fixable on the review; the deck never marks a title played or watched without a tap (rule 35, decision 27).

## Open thoughts

- The movies deck page under rule 35 (a tap on a film logs it; the tier is a choice), designed in the movies session.
- Whether "Add many" for a returning user should offer the deck page at all, or only search.
- Whether the ten-ranked line should name the pick that becomes available, once the finder exists (December).
