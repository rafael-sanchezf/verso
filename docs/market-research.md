# Market research: Beli-style tracker for games (and later movies / TV)

Carried over from the "Gaming backlog tracker app research" session on 2026-09-07.

## The idea

A Beli-style app, primarily for video games, expandable to movies and TV. Main personal use case: tracking a gaming backlog. Existing alternatives cover parts of it.

## Short answer

Nothing does exactly this. The game-tracking space is crowded but fragmented, and nobody has put Beli's core mechanic (head-to-head comparisons that produce one ranked list, plus a friends layer) on top of a game backlog. The pieces exist separately.

## Closest things for games

- **Backloggd** is the de facto "Letterboxd for games." Five-star ratings, reviews, lists, playthrough journal, follow feeds. Web-only as of early 2026, with no native app.
- **GG** is the mobile-first social tracker. Smaller community than Backloggd.
- **Grouvee** is Goodreads-style shelves. An older, functional product.
- **SavePoint** is the most interesting on the backlog problem specifically. It has a "Decision Engine" that picks three games for tonight based on mood, time, and platform, and a Backlog Score that prices unplayed games. Free tier plus a $9/month Pro. Built by the Two Average Gamers blog, which also publishes the "Backloggd vs GG vs SavePoint" comparisons, so read those as a maker's view.
- **Backloggr** launched in 2026 with auto-import from PlayStation, Xbox, and Steam, including trophies. Auto-import is the single biggest quality-of-life gap in the older trackers, which are all manual entry.
- **HowLongToBeat**, **Infinite Backlog**, and **Stash** round out the utility end.

## Beli-style ranking, but not for games

- **Flickchart** has done pairwise "pick one of two films" ranking for years. Movies only, no real social layer.
- **Flick** is explicitly pitched as "Beli for movies": social feed of what friends watch and think.
- **Shortlist** does ranked movie and TV lists shared with friends.
- **My Ranking** and **Sortr** are generic pairwise-ranking tools you can point at anything, but no catalog, no social.

## Cross-media trackers

- **Achriom** tracks games alongside books, movies, TV, and music, with time-to-beat data. Its "best tracker" blog posts are its own, so they are a maker's view too.
- **Media Tracker** covers all five media types as a release calendar plus tracking.
- **Sofa Time**, **Simkl**, and **Trakt** are TV and movie only.

## The gap

Beli's insight is that comparative ranking beats absolute star ratings, because people are bad at "is this a 7 or an 8" but good at "was this better than Hades." Nobody has applied that to games with a social layer, and nobody combines it with the backlog problem SavePoint is chasing. Beli's "want to try" list is literally a backlog, so the model maps cleanly.

## Practical notes for a build

1. **Data sources.** Games data comes from IGDB via Twitch's API. Movies and TV come from TMDB. Both are free for hobby-scale use.
2. **Auto-import.** Platform import from Steam, PSN, and Xbox is what users keep asking for and what most incumbents lack.
3. **Ranking cost.** Pairwise ranking gets tedious past a few hundred items. Use Beli's trick of only comparing against a handful of neighbors on insert (binary-search style) rather than a full sort.

## Sources

- [Backloggd vs GG vs SavePoint (Two Average Gamers)](https://www.twoaveragegamers.com/backloggd-vs-gg-vs-savepoint/)
- [Backloggd review after 6 months](https://www.twoaveragegamers.com/backloggd-review/)
- [Backloggd roadmap](https://backloggd.com/roadmap/)
- [Backloggd on Trustpilot](https://www.trustpilot.com/review/backloggd.com)
- [SavePoint](https://savepoint.twoaveragegamers.com/)
- [SavePoint FAQ](https://savepoint.twoaveragegamers.com/faq)
- [Backloggr on the App Store](https://apps.apple.com/us/app/backloggr-video-game-tracker/id6761012462)
- [Grouvee](https://www.grouvee.com/)
- [Stash on Google Play](https://play.google.com/store/apps/details?id=io.stashteam.games.tracker.stashapp&hl=en_US)
- [Best game tracking apps (Achriom)](https://www.achriom.com/blog/best-video-game-tracking-apps/)
- [Best game backlog trackers (WListDB)](https://wlistdb.com/blog/best-game-backlog-trackers-2026)
- [Best game tracker apps (Ludenslog)](https://ludenslog.com/blog/best-game-tracker-apps-2026)
- [Flick on the App Store](https://apps.apple.com/us/app/flick-rate-movies-shows/id6504503117)
- [Shortlist on the App Store](https://apps.apple.com/us/app/shortlist-rank-movies-tv/id6759330695)
- [Best movie ranking apps (Shortlist)](https://shortlist.watch/best-movie-ranking-apps)
- [My Ranking on the App Store](https://apps.apple.com/us/app/my-ranking-compare-rank/id6761020668)
- [Sortr](https://sortr.io/)
- [Media Tracker](https://media-tracker.app/)
- [Sofa Time](https://www.sofatime.app/)
- [Simkl](https://simkl.com/)
- [Beli on Wikipedia](https://en.wikipedia.org/wiki/Beli_(app))
- [Axios on niche recommendation apps](https://www.axios.com/2023/09/01/recommendation-ranking-apps-goodreads-letterboxd)
