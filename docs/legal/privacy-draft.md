**Draft for Rafa's review, not legal advice. It must be reviewed, ideally by a lawyer, before it is published anywhere.** Every claim the repository could not confirm is marked [CHECK]; the notes at the end say what the repository shows for each. The site's `/privacy` page stays a stub until this is final.

# Verso privacy policy

Last updated: [CHECK: the date it is published]

Verso is an app for ranking the games and movies you have played and watched, keeping a list of what you want to get to, and getting recommendations from your own list. This policy says what Verso keeps about you, who it goes to, and what you can do about it.

Verso is run by Rafael Sanchez [CHECK: as an individual or through a company]. Questions, requests and complaints go to **hello@rankverso.com**.

## The short version

- **Your data is never sold**, on the free tier or a paid one.
- **Verso has no ads**, and nothing it recommends is there because someone paid for it.
- **No third-party analytics, ad pixels or tracking SDKs** are in the app or on the website.
- Your rankings and lists are **private to your account**.
- When you ask for a recommendation, the parts of your list needed to explain the picks go to our AI provider, Anthropic, **only after you have said yes** [CHECK].
- You can **download your lists** and **delete your account**, and everything with it, from the app's Settings.

## What Verso keeps

**Your account.** Your email address and, if you sign in with Google, the name and profile picture Google shares. Your password, if you use one, is stored only as a hash by our sign-in provider. Your name and picture are copied to your Verso profile; your email address is not.

**Your profile.** A username, a display name, a picture, the platforms you play on and the media you chose to track (games, movies).

**Your lists.** What you have played, watched, are playing, want to get to or dropped; when you added and finished them; playtime; the platforms you played on; your notes; your rankings and tiers; and every head-to-head answer you give while ranking, which is how Verso learns your taste.

**Your Steam library, if you link Steam.** Your Steam ID, the games you own, your playtime and when you last played. Verso reads this only when you link your account or ask it to sync, and unlinking deletes it.

**Your recommendation requests.** What you asked for (the medium, genres, how much time you have, an optional note in your own words), the picks Verso gave you with their reasons, and the scores Verso predicted for them.

**How you use the app, in a few events.** A handful of moments are recorded against your account in Verso's own database, so we can see whether onboarding works: your first session, your tenth ranked title, your first recommendation, opening the app, and which media you said you are interested in. They are never sent to an analytics company.

**On your phone.** Your sign-in session, encrypted with a key kept in the phone's secure storage, and your recent searches.

Verso does not collect your location, your contacts, or anything from other apps.

## Who can see it

- Your lists, rankings, notes, Steam library and recommendation history are visible only to you.
- Your profile (username, display name, picture, platforms and chosen media) can be read by other signed-in Verso users [CHECK: whether this stays so at launch; no screen shows it to others yet].
- Verso computes averages across everyone's rankings for each title (how many people ranked it and their average score) to make better picks. These carry no names, and signed-in users can read them [CHECK: no minimum number of people per average is set yet].

## AI recommendations

When you ask Verso what to play or watch, it first picks about thirty candidates from your own list and the catalog in its own database. To write the reason for each pick, it then sends Anthropic's API:

- what you asked for, including your note if you wrote one;
- up to ten titles you loved or liked, with their year and genres;
- up to five titles you dropped and your notes on them;
- up to five of your most recent notes;
- the candidates, with catalog facts about them.

It does not send your name, email address, user ID or your head-to-head answers. Verso keeps the request and the picks in your account, as above; it does not keep the full message sent to Anthropic.

Before your first recommendation, Verso asks your permission to send this, and you can say no and still get picks without reasons written by the model [CHECK]. You can withdraw that permission later in Settings [CHECK]. Anthropic processes what is sent to answer the request [CHECK: Anthropic's retention period and its terms on training for API data, quoted from its commercial terms].

## Services that handle your data

| Service | What for | What it sees |
|---|---|---|
| Supabase | Verso's database, sign-in and server functions | Everything Verso keeps, stored in [CHECK: the hosting region] |
| Anthropic | Writing the reasons for recommendations | The request described above, after your permission |
| Google | Sign in with Google, if you use it | That you signed in to Verso |
| Apple | Sign in with Apple, once it is offered [CHECK] | That you signed in to Verso |
| Valve (Steam) | Linking Steam and reading your library, if you choose to | Your Steam ID; Verso asks Steam for your owned and recent games |
| Expo | Delivering app updates | Your device's IP address and app version when it checks for an update |
| Vercel | Hosting the website and the web app | Requests to rankverso.com, including your IP address [CHECK: Vercel's log retention] |
| IGDB and Steam image servers | Showing cover art in the app | Your device's IP address when a cover loads |

Each of these handles your data under its own terms. None of them is allowed by Verso to use it for advertising [CHECK: each provider's data processing terms].

## Where the catalog comes from

Game data comes from IGDB, with cover art from IGDB and Steam; movie data and posters come from TMDB. Verso also reads public player counts, review scores and subscription-service listings to describe titles. These sources supply facts about games and movies; Verso sends them nothing about you. This product uses the TMDB API but is not endorsed or certified by TMDB.

## What Verso never does

- Sell your personal data, or share it with anyone for advertising across other apps and sites.
- Show you ads, or let anyone pay to place a recommendation.
- Put third-party analytics, ad pixels or tracking SDKs in the app or the website.

In the future Verso may offer studios and publishers aggregate, de-identified insights (for example, how a genre ranks among players), built only from groups large enough that no one can be singled out, and sold only to buyers who agree never to try to re-identify anyone [CHECK: whether this belongs in the launch policy; nothing like it is built, and the minimum group size is not set]. If Verso ever wants to use your data in a way this policy does not describe, it will ask you first.

## Your choices

- **Download your data.** Settings, Data exports your entries, rankings and head-to-head answers as JSON or CSV [CHECK: the export does not yet include your profile, Steam library or recommendation history].
- **Correct it.** Edit or remove any entry, note or ranking in the app.
- **Unlink Steam.** This deletes your stored Steam library and your Steam ID.
- **Delete your account.** Settings, Delete account removes your account and everything listed above from Verso's database at once. Backups held by our database provider expire on their own schedule [CHECK: Supabase's backup retention for the plan in use].
- **Ask us.** Write to hello@rankverso.com for anything the app does not let you do yourself. Depending on where you live, you may have further rights, such as to object or to complain to a regulator [CHECK: the rights to list for the US states and the EU or UK, if Verso serves them].

## How long Verso keeps it

Until you delete it or delete your account. Single head-to-head answers, recommendation requests and events cannot be deleted one by one; they go with your account [CHECK: whether a shorter retention period should apply to recommendation requests and events].

## Security

The database itself enforces who can read each row of every table that holds your data, your session is encrypted on your phone, and Verso's keys are kept out of its code. No system is perfectly secure, and if a breach affects your data Verso will tell you [CHECK: the notification commitment].

## Children

Verso is not meant for children under 13 [CHECK: the minimum age, and 16 if the EU is served], and does not knowingly collect their data. The app does not yet ask your age [CHECK].

## The website

rankverso.com loads nothing from any other server: its fonts and images are its own, and it sets no cookies and runs no analytics. If you request access by email, Verso keeps your email address and message to reply and to send you an invite [CHECK: how long access requests are kept].

## Changes

If this policy changes, the new version will be posted here with its date, and you will be told in the app before a change that affects how your data is used [CHECK].

---

## Notes for review (not part of the policy)

What the repository shows for each [CHECK], 2026-10-08:

1. **Operator.** The footer says "Built by Rafael Sanchez"; no company is recorded anywhere.
2. **Permission before the first recommendation.** Decision 24 (ROADMAP.md) requires it and `docs/design/onboarding-brief.md` plans `profiles.ai_consent_at`, but it is not built: no consent column, no screen, and the app does not call `suggest` yet. The site's FAQ already promises it ("only after you've said yes"). It must ship before this sentence is true.
3. **Withdrawing permission.** Planned in `docs/design/onboarding-guidelines.md` (a toggle in Settings); not built.
4. **Anthropic's terms.** The `suggest` function calls `api.anthropic.com` with `claude-haiku-5-5` by default (Claude Haiku 4.5 until 2026-10-08); Anthropic's retention and training terms are not in the repository.
5. **Hosting region.** Not stated anywhere for the hosted Supabase project.
6. **Sign in with Apple.** Not built (`supabase/config.toml` has it disabled); it ships before the first App Store submission (decision 12).
7. **Profiles readable by other users.** The policy "profiles are readable by signed-in users" (`20260909000000_core_schema.sql`) is deliberate per the migrations, but no screen shows another user's profile yet.
8. **Averages per title.** `item_prior` is readable by signed-in users and applies no minimum count, so a title ranked by one person shows that person's score without their name.
9. **Aggregate insights.** Decision 21 permits them with a minimum cell size and a ban on re-identification, and says the policy must name them before the first submission; nothing is built.
10. **Export scope.** `packages/api/src/export.ts` exports entries, rankings and comparisons only.
11. **Backups and retention.** No retention policy exists; every log is kept until the account is deleted (`delete_my_account()` cascades through every user table).
12. **Children.** No age gate and no age policy in the repository.
13. **Vercel logs, providers' terms, breach notice, regional rights, access-request retention, notice of changes.** Not in the repository; they need a decision or a lawyer.
14. **Two facts worth a look before launch.** The app loads covers straight from `images.igdb.com` and `cdn.cloudflare.steamstatic.com` (`packages/api/src/covers.ts`) and Google profile pictures from Google, so those hosts see the user's IP address; the website no longer does since the art moved into `apps/site/public/art/`.
