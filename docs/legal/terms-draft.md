**Draft for Rafa's review, not legal advice. It must be reviewed, ideally by a lawyer, before it is published anywhere.** Every claim the repository could not confirm, and every clause that needs a decision, is marked [CHECK]; the notes at the end say why. The site's `/terms` page stays a stub until this is final.

# Verso terms of use

Last updated: [CHECK: the date it is published]

These terms are the agreement between you and Verso, run by Rafael Sanchez [CHECK: as an individual or through a company], for the Verso app on iPhone, the web app and rankverso.com. By creating an account or using Verso you agree to them. The [privacy policy](privacy-draft.md) says what Verso does with your data and is part of this agreement.

## The beta

Verso is in a private beta, open by invitation. During the beta it is free, it will change, parts of it may not work, and it may be paused or ended. Verso will try to give notice before ending it and to let you download your lists first.

## Your account

- You must be at least 13 [CHECK: the minimum age, and 16 if the EU is served] to use Verso.
- Give accurate sign-in details and keep them to yourself. You are responsible for what happens under your account.
- One person per account.
- You can delete your account at any time in Settings, which deletes your data as the privacy policy describes.

## What is yours

Your rankings, lists and notes are yours. You let Verso store, process and display them to you, and process them as the privacy policy describes (including sending parts of your list to its AI provider, after your permission, to explain a recommendation), only to run and improve Verso. That permission ends when you delete them or your account, except for copies in backups until they expire.

If you send Verso feedback or ideas, Verso may use them without owing you anything.

## How to use it

Do not:

- break the law, or use Verso to harass anyone;
- scrape, copy or resell the catalog, other people's data or the recommendations, or access Verso by automated means other than the app and the web app;
- try to get around its security, its limits (such as the daily number of recommendations), or another person's account;
- put anything in a note or a request that you have no right to share.

Verso may suspend or close an account that does, and will say why unless the law or safety prevents it.

## Recommendations

Recommendations and their reasons are written in part by an AI model from your own list. They are suggestions for how to spend your free time, can be wrong, and are not professional advice of any kind. Verso does not promise that you will like what it picks.

## The catalog and other people's content

Game data comes from IGDB, with cover art from IGDB and Steam; movie data and posters come from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Titles, cover art, posters and trademarks belong to their owners and appear only to identify the games and movies; none of their owners endorses Verso. Verso tries to keep the catalog accurate but does not guarantee release dates, running times, prices or where a title is available.

Linking Steam is optional and also subject to Valve's terms. Verso is not affiliated with Valve.

## Paid plans

The tracker (ranking, lists, everything you log) is free. Verso may later offer a paid plan for recommendations [CHECK: the price, the trial, and what stays free, decided before launch]. If it does, the price, the length of any trial, the renewal date and how to cancel will be shown before you pay, and nothing you answer in the app starts a trial or a subscription on its own. Purchases on iPhone go through Apple and follow Apple's terms, including its refund process [CHECK].

## Verso itself

The app, the website, the name, the logo and the code are Verso's [CHECK: who owns them if a company is formed]. You may use them as these terms allow and for no other purpose.

## No warranty, and limits

Verso is provided as it is, especially during the beta. To the extent the law allows, Verso makes no promises beyond those in these terms and is not liable for indirect or consequential losses, or for more than [CHECK: a cap, for example what you paid in the last twelve months, or a fixed amount]. Nothing here limits rights you have by law that cannot be waived. [CHECK: the warranty disclaimer and limitation clauses need a lawyer's wording.]

## Changes

If these terms change, the new version will be posted with its date, and you will be told in the app before a change that matters takes effect [CHECK]. If you keep using Verso after that, the new terms apply; if you do not agree, you can delete your account.

## Law and disputes

These terms are governed by the laws of [CHECK: the state, for example New York], and disputes go to its courts [CHECK: courts, arbitration, or small-claims carve-outs].

## Contact

hello@rankverso.com

---

## Notes for review (not part of the terms)

1. **Operator and ownership.** No company is recorded in the repository; the footer says "Built by Rafael Sanchez".
2. **Minimum age.** No age gate exists in the app.
3. **Paid plan.** Decision 21: a paid engine tier after a trial whose length is open, metered by `suggestion_requests`, at a price recorded in the private roadmap; onboarding principle 11 says no answer ever starts a trial. Nothing is built (no RevenueCat or StoreKit).
4. **Apple.** Whether to adopt Apple's standard licence agreement for the App Store listing, or this document as a custom one, is open.
5. **The AI permission step** the terms rely on (decision 24) is not built yet; see the privacy draft's note 2.
6. **Liability, governing law, disputes, notice of changes.** Not decided anywhere; they need a lawyer.
7. **The daily limit** cited under "How to use it" is `SUGGEST_DAILY_LIMIT` in the `suggest` function (default 20).
