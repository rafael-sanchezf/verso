# Brand-color landscape for Verso

Research date 2026-10-07. Scope: which colors neighboring products already own. No recommendation.

## How the readings were taken

- **documented**: the hex comes from a brand page, a press kit, brand guidelines, a named brand or primary token in the company's own stylesheet (for example `--theme-brand-green-content-color`), or a `theme-color` meta tag on the company's site.
- **approx**: a reading. Either pixels measured from the App Store icon (256 px artwork from the iTunes Search API, dominant non-neutral color) or the most frequent saturated color in the company's site CSS. Treat these as a close reading, not a spec.
- Tags: **company** means the company's own site, stylesheet, press kit or App Store listing. **third party** means anyone else.
- "Icon" is the App Store icon background: dark or light.
- Grouvee's site sits behind a Cloudflare bot check, and it has no iOS app in the US store. I did not get past the check, so it is "not found".

## The table

| Product | Category | Primary color | Status | How color is used in the UI | Icon | Source (tag) |
|---|---|---|---|---|---|---|
| Beli (restaurants) | tracker | dark teal #134F5C | documented (site CSS and App Store art) | Light-first. Teal on the wordmark, the segmented control and the filled chips. Scores use a separate green, yellow and red | light (white, teal wordmark #104C5A) | beliapp.com custom.css `background-color:#134f5c` https://static1.squarespace.com/static/custom-css/5d27a2af17e26b0001269fd6/5d27a2af17e26b0001269feb/1/custom.css (company); App Store screenshot backgrounds measured exactly #134F5C https://apps.apple.com/us/app/beli/id1478375386 (company); the rating step offers a green "I liked it!", a yellow "it was fine" and a red "I didn't like it" https://www.thecrimson.com/article/2026/2/26/beli-inquiry/ (third party) |
| Letterboxd | tracker | three dots: green #00E054, orange #FF8000, blue #40BCF4 | documented (site CSS tokens) | Dark-first (#14181C). Green does the work: primary button #00AC1C, star ratings #00E054. Links are blue | dark (#23292F, three dots) | `--theme-brand-green-content-color:#00e054` and others on https://letterboxd.com/ (company); https://apps.apple.com/us/app/letterboxd/id1054271011 (company) |
| Backloggd | tracker | pink #EA377A | approx (site CSS) | Dark-first (#16181C). One accent: pink CTA, pink links #FC6399, pink rating histogram. Slate #4A5E8D for secondary buttons | not found (no iOS app in the US store; the logo is a white wordmark) | https://backloggd.com/ (company) |
| Serializd | tracker | teal #43B9A3 (icon), #0D9488 (site) | approx | Dark-first app; teal accent | dark (#12151A) | https://apps.apple.com/us/app/serializd/id1581244120 (company); https://www.serializd.com (company) |
| Trakt | tracker | purple #9F42C6 | documented (site token `--boot-accent: oklch(56.1% 0.205 314.2)`) | One purple accent on light or dark backgrounds (both are defined) | light-ish (solid purple) | https://trakt.tv/ (company); https://apps.apple.com/us/app/trakt-tv-time-to-watch/id1514873602 (company); purple scheme came with the 2025 "Lite" redesign https://alternativeto.net/news/2025/11/trakt-unveils-a-full-redesign-of-its-movie-and-tv-tracking-platform-for-web-and-mobile/ (third party) |
| TV Time | tracker | yellow #EFBE4E on black | approx | **Shut down 15 July 2026.** The farewell page is yellow text on black | n/a (removed from the store) | https://www.tvtime.com/ (company); https://alternativeto.net/news/2026/7/tv-time-is-shutting-down-its-service-on-july-15-2026-here-are-some-great-replacements/ (third party) |
| Goodreads | tracker | warm neutral: cream #F4F2E9, brown #382110 | approx (site CSS) | Light-first. "Want to Read" button green #3F8363, links teal-green #00635D, stars orange #E87400 (token `--color-background-rating-star-base`) | light (cream #EDE6DB, black "g") | https://www.goodreads.com/ (company); https://apps.apple.com/us/app/goodreads-book-tracker-more/id355833469 (company) |
| The StoryGraph | tracker | teal #2AB5C0 (accent) | approx (site CSS) | Light or dark by system setting. One teal accent on buttons and links | light (black-and-white books) | https://app.thestorygraph.com/ (company); https://apps.apple.com/us/app/storygraph-reading-tracker/id1570489264 (company) |
| Hardcover | tracker | indigo #4F46E5 / #6366F1 | approx (site CSS) | Indigo accent | dark (#111828, indigo mark #6467F2) | https://hardcover.app/ (company); https://apps.apple.com/us/app/hardcover-app/id1663379893 (company) |
| Fable | tracker | deep green #064C37 (site), #053829 (icon) | approx | Deep-green hero, cream `theme-color` #F7F4EE. Now pitched as "the social app for bookworms and bingewatchers" | dark (deep green) | https://fable.co/ (company); https://apps.apple.com/us/app/fable-track-discuss-books/id1488170618 (company) |
| Sofa | tracker | blue #3C66C4 plus mint #6FFAA3 | approx (site CSS) | Light-first (cream #FFF4EE), navy #0F1A31 blocks, two accents | light-ish (solid blue #3361B8) | https://www.sofahq.com/ (company); https://apps.apple.com/us/app/sofa-downtime-organizer/id1276554886 (company) |
| Likewise | tracker | coral #FB6F54 | approx (icon) | likewise.com now redirects to pix-media.com (seen 2026-10-07), which uses a coral CTA #FF6F51 on light surfaces | light-ish (coral gradient) | https://apps.apple.com/us/app/likewise-movie-tv-book-recs/id1264195462 (company); https://pix-media.com (company) |
| TasteDive | tracker | teal #50CCC8 (`theme-color`), #00C8C8 | documented (`theme-color`) | Light-first, navy #283C64 header, teal accent | not found (no iOS app found) | https://tastedive.com/ (company) |
| Achriom | tracker | blue #4A6BB5 (site), #2A43CB (icon) | approx | Blue accent | light-ish (solid blue) | https://www.achriom.com/ (company); https://apps.apple.com/us/app/achriom-track-discover/id6756895752 (company) |
| JustWatch | tracker | yellow #FBC500 | documented (`--jw-color-primary`) | Dark-first (#060D17 / `theme-color` #182531), one yellow accent | dark (navy, yellow mark) | https://www.justwatch.com/ (company); https://apps.apple.com/us/app/justwatch-movies-tv-shows/id979227482 (company) |
| Reelgood | tracker | green #00DC89 / #008553 | approx (site CSS) | Dark-first (#0C1119), one green accent | dark (#1A3435, mint #3EF7B1) | https://reelgood.com/ (company); https://apps.apple.com/us/app/reelgood-streaming-guide/id1031391869 (company) |
| HowLongToBeat | tracker | blue #2B7AB9 (accent; logo is neutral) | approx (site CSS) | Dark-first (#242424), blue buttons, multi-color category labels | not found (no iOS app found) | https://howlongtobeat.com/ (company) |
| GG | tracker (games) | green #44E239 on navy #071225 | approx (icon; site CSS #47ED3A) | Dark-first (#0A121F), one green accent | dark (navy, white "GG", green bar) | https://apps.apple.com/us/app/gg/id1320588074 (company); https://ggapp.io/ (company); founder Charles Watson https://www.twoaveragegamers.com/backloggd-vs-gg-vs-savepoint/ (third party) |
| Grouvee | tracker (games) | not found | not found | not found | not found | site behind a Cloudflare check https://www.grouvee.com/ |
| Infinite Backlog | tracker (games) | blue #00A6ED | approx (site CSS) | Dark-first (#1B1F27, `theme-color` #2D333E), one blue accent | not found (no iOS app found) | https://infinitebacklog.net/ (company) |
| Simkl | tracker | neutral (black-and-white "S") | approx | Dark-first (#0C0D0F). Several accents: red CTA #D0021B, yellow stars #FFBF00, blue | dark (black, white "S") | https://simkl.com/ (company); https://apps.apple.com/us/app/simkl-lists-tv-anime-movies/id1229691035 (company listing; developer Andrew Masyk) |
| Steam | platform/storefront | navy #171A21 (`theme-color`); #1B2838 and #66C0F4 | documented (`theme-color`); the rest approx | Dark-first, light-blue accent | dark (blue gradient #1B4E7B) | https://store.steampowered.com/ (company); #1B2838 and #66C0F4 per https://www.webdesignhot.com/design.md/steam/ (third party, which notes Valve publishes no public color kit); the Steamworks branding page gives no hex https://partner.steamgames.com/doc/marketing/branding (company) |
| Xbox | platform/storefront | green #107C10 | documented (brand guidelines) | Dark-first. xbox.com pairs #107C10 with a neon lime #9BF00B (37 vs 36 uses in its CSS) | dark (#1A1B1F, lime sphere) | Xbox Brand Guidelines 2019-04-15 "Xbox green R16 G124 B16 HEX #107C10 PMS 362" https://retrocdn.net/images/c/c0/Xbox_BrandGuidelines_2019-04-15.pdf (company document, hosted by a third party); https://www.xbox.com/ (company); https://apps.apple.com/us/app/xbox/id736179781 (company) |
| PlayStation | platform/storefront | blue #0070D1 / #0072CE | approx (site CSS); #0070D1 per third party | Light site, blue CTAs | light-ish (solid blue #0965CB) | https://www.playstation.com/ (company); https://apps.apple.com/us/app/playstation-app/id410896080 (company); https://www.webdesignhot.com/design.md/playstation/ (third party) |
| Nintendo | platform/storefront | red #E60012 | documented (`theme-color`) | Light site, red header and buttons | light-ish (solid red) | https://www.nintendo.com/ (company); https://apps.apple.com/us/app/nintendo-switch-app/id1234806557 (company) |
| Epic Games Store | platform/storefront | neutral (black and white) | approx | Dark-first (#101014), blue CTA #26BBFF | dark (#17242C, white logo) | https://store.epicgames.com/ (company); https://apps.apple.com/us/app/epic-games/id6480077263 (company) |
| Discord | platform | blurple #5865F2 | documented (brand page) | Blurple accent on dark or light | light-ish (solid blurple) | https://discord.com/branding (company) |
| Twitch | platform | purple #9146FF | approx (site CSS #9147FF); #9146FF third party | Dark-first, one purple accent | light-ish (solid purple) | https://www.twitch.tv/ (company); https://color.codes.in/brands/twitch (third party); https://brand.twitch.com/ lists no hex (company) |
| GOG | platform/storefront | purple #C99AFF / #6E1D72 (accent; logo is white) | approx (site CSS) | Dark-first (#000 / #212121). Purple "Join" button, green price and buy buttons #9DD630 | not found (no iOS app) | https://www.gog.com/en/ (company) |
| itch.io | platform/storefront | red #FA5C5C ("itchy carnation") | documented (press kit, `theme-color`) | Light site, red accent | not found (no iOS app) | https://itch.io/press-kit (company) |
| Game Pass | platform (subscription) | green #107C10 plus lime #9BF00B | documented (as Xbox) | Same system as xbox.com, inside the Xbox app | dark (Xbox app) | https://www.xbox.com/en-US/xbox-game-pass (company) |
| Netflix | streaming | red #E50914 | approx (in the site CSS); #E50914 and Pantone 485 C per third party | Dark-first, red reserved for logo and CTAs | dark (#161616, red N) | https://www.netflix.com/ (company); https://apps.apple.com/us/app/netflix/id363590051 (company); https://color.codes.in/brands/netflix (third party); brand.netflix.com showed no hex to a text fetch (company) |
| Apple TV | streaming | black with a multi-color gradient logo | approx (icon) | Dark-first, system blues in UI | dark (#2D2D2D) | https://apps.apple.com/us/app/apple-tv/id1174078549 (company); "+" dropped and a gradient icon adopted in Oct 2025 https://www.macworld.com/article/2939653/apple-tv-is-getting-a-surprising-rebrand-see-the-new-logo-here.html (third party) |
| Disney+ | streaming | teal "Aurora" gradient, about #116879 | approx (icon) | Dark-first. Its site CSS also carries Hulu green #1CE783 | dark (teal gradient) | https://apps.apple.com/us/app/disney/id1446075923 (company); https://www.disneyplus.com/ (company); teal since March 2024 https://mobilesyrup.com/2024/03/26/disney-new-logo-teal/ (third party) |
| HBO Max | streaming | neutral (white on near-black) | approx (icon) | Dark-first, monochrome | dark (#1B1E25) | https://apps.apple.com/us/app/hbo-max-stream-movies-tv/id1666653815 (company); https://www.hbomax.com/ (company) |
| Prime Video | streaming | blue #1A98FF / #0070F0 | approx (site CSS); "Prime Blue" named by Pentagram | Dark-first (`theme-color` #00050D), blue accent | light-ish (solid blue #0677FF) | https://www.primevideo.com/ (company); https://www.pentagram.com/work/prime-video (third party, the design agency) |
| Hulu | streaming | green #1CE783 | documented (brand guidelines) | Dark-first. Black #040405 is the secondary color, gradient #040405 to #183949, green logo "whenever possible" | dark (gradient, green wordmark) | https://www.thisishulu.com/ (company) |
| Paramount+ | streaming | blue #0064FF | approx (site CSS and icon) | Dark-first, blue accent | light-ish (solid blue) | https://www.paramountplus.com/ (company); https://apps.apple.com/us/app/paramount/id530168168 (company) |
| Peacock | streaming | black with multi-color dots | approx (icon) | Dark-first, yellow accents #FCCC12 on the site | dark (#1E1E1E) | https://apps.apple.com/us/app/peacock-tv-stream-tv-movies/id1508186374 (company); logo refreshed May 2026 https://www.newscaststudio.com/2026/05/12/new-peacock-logo-2026/ (third party) |
| MUBI | streaming | deep blue #001489 | approx (site CSS and icon) | One deep-blue accent | dark-ish (solid #001489) | https://mubi.com/ (company); https://apps.apple.com/us/app/mubi-stream-great-cinema/id626148774 (company) |
| Criterion Channel | streaming | neutral (black and white) | approx | Dark-first (`theme-color` #121212), gold accent #B4841E | dark (#232323) | https://www.criterionchannel.com/ (company); https://apps.apple.com/us/app/the-criterion-channel/id1454275199 (company) |
| IMDb | review aggregator | yellow #F5C518 | documented (token `--ipt-accent1-color`) | Dark header (#121212). Yellow logo and yellow stars | light-ish (solid yellow) | https://www.imdb.com/chart/top/ (company) |
| Rotten Tomatoes | review aggregator | red #FA320A | documented (`theme-color`) | Red accent, light site | light-ish (solid red #FA330C) | https://www.rottentomatoes.com/ (company); https://apps.apple.com/us/app/rotten-tomatoes-movies-tv/id6673916573 (company) |
| Metacritic | review aggregator | black plus yellow #FFBD3F (logo) | approx (site CSS) | Light body, black header. Score colors green #00CE7A, yellow #FFBD3F, red #FF6B73. Brand yellow and score yellow are the same hex | not found (no iOS app) | https://www.metacritic.com/ (company) |
| OpenCritic | review aggregator | orange-red #FA3C00 (logo) | approx (logo pixels) | Dark nav #2E2E2E, light body #F4F4F8 | not found (no iOS app) | https://opencritic.com/ and https://img.opencritic.com/logo-light.png (company) |
| Spotify | big consumer brand | green #1ED760 | approx (site CSS, 46 uses) | Dark-first. Green on play, active states and primary CTAs. Guidelines call the green logo the primary colorway and name #191414 as a fallback background | dark (#0C0C0C, green mark) | https://open.spotify.com/ (company); https://developer.spotify.com/documentation/design (company) |
| WhatsApp | big consumer brand | green #25D366 | third party | Green identity, light or dark | light-ish (solid green, icon reads about #01E254) | https://www.brandcolorcode.com/whatsapp (third party); https://apps.apple.com/us/app/whatsapp-messenger/id310633997 (company) |
| Duolingo | big consumer brand | "Feather Green" #58CC02 | third party (citing design.duolingo.com, which now redirects) | Light-first, green-dominant | light-ish (solid green #77C800) | https://www.canny-creative.com/brand-breakdown/brand/duolingo/ (third party); https://apps.apple.com/us/app/duolingo-language-lessons/id570060128 (company) |
| Robinhood | big consumer brand | lime "Robin Neon" #CCFF00 | approx (site CSS); named without hex in the newsroom | Black, white and neutrals with pops of neon | light-ish (solid lime) | https://robinhood.com/ (company); https://robinhood.com/us/en/newsroom/a-new-visual-identity (company) |
| Cash App | big consumer brand | green #00D632 / #00E013 | approx (site CSS) | Green-dominant | light-ish (solid green #01E013) | https://cash.app/ (company); https://apps.apple.com/us/app/cash-app/id711923939 (company) |
| Nvidia | big consumer brand | green #76B900 | approx (site CSS, 189 uses) | Dark-first, green on borders and CTAs | not checked (no consumer iOS app used) | https://www.nvidia.com/ (company) |
| Razer | big consumer brand | green #44D62C | approx (site CSS, 528 uses) | Dark-first, neon green on black | light-ish (solid green, Razer Audio app) | https://www.razer.com/ (company) |
| Evernote | big consumer brand | green #00A82D | approx (site CSS; its site also leans on blue #4D64FF) | Light-first, green logo | light (white, green elephant) | https://evernote.com/ (company); https://apps.apple.com/us/app/evernote-ai-notes-notebook/id281796108 (company) |
| Grammarly | big consumer brand | teal-green #027E6F (now); #15C39A (earlier) | approx (site CSS) | Light-first, deep teal-green accent | light (#F6F6F6, teal-green mark) | https://www.grammarly.com/ (company); https://apps.apple.com/us/app/grammarly-ai-keyboard-voice/id1158877342 (company; seller now Superhuman Platform Inc); #15C39A per https://brandpalettes.com/grammarly-colors/ (third party) |
| Kindle | big consumer brand | blue (sky gradient, black reader silhouette) | approx (icon); no hex found | not checked | light-ish (blue sky) | https://apps.apple.com/us/app/amazon-kindle-reading-app/id302584613 (company) |
| Audible | big consumer brand | orange #F8991C | third party; site CSS #FFA000 | Orange accent | light-ish (solid orange) | https://www.brandcolorcode.com/audible (third party); https://www.audible.com/ (company) |

Hulu and Xbox appear once each, under streaming and platforms, even though the brief also lists them as green consumer brands.

## Hue census

Each product is counted once, by its primary brand hue: the icon or logo color when that is chromatic, otherwise its main accent. "Neutral" means black, white, gray or cream. 56 products in all.

| Family | Trackers (21) | Game platforms (10) | Streaming (10) | Review (4) | Consumer brands (11) | Total |
|---|---|---|---|---|---|---|
| Red | 0 | 2 (Nintendo, itch.io) | 1 (Netflix) | 1 (Rotten Tomatoes) | 0 | 4 |
| Orange | 1 (Likewise) | 0 | 0 | 1 (OpenCritic) | 1 (Audible) | 3 |
| Yellow | 2 (TV Time, JustWatch) | 0 | 0 | 2 (IMDb, Metacritic) | 0 | 4 |
| Green | 3 (Fable, Reelgood, GG) | 2 (Xbox, Game Pass) | 1 (Hulu) | 0 | 8 (Spotify, WhatsApp, Duolingo, Robinhood, Cash App, Nvidia, Razer, Evernote) | 14 |
| Teal | 4 (Beli, Serializd, StoryGraph, TasteDive) | 0 | 1 (Disney+) | 0 | 1 (Grammarly) | 6 |
| Blue | 5 (Hardcover, Sofa, Achriom, HowLongToBeat, Infinite Backlog) | 3 (Steam, PlayStation, Discord) | 3 (Prime Video, Paramount+, MUBI) | 0 | 1 (Kindle) | 12 |
| Purple | 1 (Trakt) | 2 (Twitch, GOG) | 0 | 0 | 0 | 3 |
| Pink | 1 (Backloggd) | 0 | 0 | 0 | 0 | 1 |
| Neutral | 2 (Goodreads, Simkl) | 1 (Epic) | 2 (HBO Max, Criterion) | 0 | 0 | 5 |
| Multi | 1 (Letterboxd) | 0 | 2 (Apple TV, Peacock) | 0 | 0 | 3 |
| Not found | 1 (Grouvee) | 0 | 0 | 0 | 0 | 1 |

Most crowded family in each category:

- **Trackers**: blue (5), then teal (4) and green (3). Teal and green together hold 7 of the 20 trackers with a known color.
- **Game platforms**: blue (3: Steam, PlayStation, Discord). Green (Xbox and Game Pass), purple and red have 2 each.
- **Streaming**: blue (3: Prime Video, Paramount+, MUBI). Green has 1 (Hulu).
- The overall green total (14) is high because the brief added a list of known green brands (8 of the 14). Without that list, green has 6 and blue has 11.

## Who owns green

Hue in degrees, lightness in percent, computed from the hex. Beli's teal is listed for contrast.

| Product | Green | Hue / lightness | Same category as a games-and-movies ranking app? |
|---|---|---|---|
| Xbox and Game Pass | #107C10, now with lime #9BF00B | 120° / 27% | Same space for games. A green games app sits next to the console brand that defines "green" in gaming. Xbox's current lime icon is yellower than #107C10 |
| Hulu | #1CE783 | 150° / 51% | Same space for movies and TV. Hulu green also appears in Disney+'s CSS, and Disney+'s 2024 teal was reported as a mix of Disney blue and Hulu green |
| Letterboxd | #00E054 (dot, stars), #00AC1C (button) | 142° / 44% | Same category: the direct film-ranking peer. Green is its action and rating color, not only one of three dots |
| Reelgood | #00DC89 | 157° / 43% | Same category (streaming guide and tracker), smaller brand, dark-first |
| GG | #44E239 | 116° / 55% | Same category (game tracker, often called "Letterboxd for games"), dark navy with a green bar |
| Fable | #064C37 | 162° / 16% | Adjacent: books, now also "bingewatchers". A deep, dark green, not a bright one |
| Goodreads (action only) | #3F8363 button, #00635D links | 152° / 38% | Adjacent (books). The brand itself is cream and brown; green is only its "Want to Read" action color |
| Spotify | #1ED760 | 141° / 48% | Different category (music), but the strongest "dark UI plus one green" association in consumer media. Nearly the same hue as Letterboxd green |
| WhatsApp | #25D366 | 142° / 49% | Different category (messaging); same hue as Spotify and Letterboxd |
| Duolingo | #58CC02 | 94° / 40% | Different category (learning); yellow-green, light-first |
| Robinhood | #CCFF00 | 72° / 50% | Different category (finance); a neon lime, black and white elsewhere |
| Cash App | #00D632 | 134° / 42% | Different category (finance) |
| Nvidia | #76B900 | 82° / 36% | Gaming hardware, adjacent to games; yellow-green |
| Razer | #44D62C | 112° / 51% | Gaming peripherals, adjacent to games; neon green on black |
| Evernote | #00A82D | 136° / 33% | Different category (notes) |
| Grammarly | #027E6F (was #15C39A) | 173° / 25% | Different category (writing); has moved toward teal |
| Beli, for contrast | #134F5C dark teal | 191° / 22% | Same mechanic, different medium. **Beli's brand color is a dark blue-leaning teal, not a green.** Three sources agree: its site CSS (#134f5c), its App Store screenshot backgrounds (#134F5C) and its icon wordmark (#104C5A) |

Observation: the bright greens at 130° to 160° (Letterboxd, Spotify, WhatsApp, Hulu, Cash App, Reelgood) are a tight cluster. Xbox's classic green is darker (27% lightness). The other greens split off into yellow-green and lime (Duolingo, Nvidia, Robinhood, the Xbox lime) or into deep and teal greens (Fable, Grammarly).

## Patterns

What the trackers with the strongest identities do:

| Tracker | Dark or light first | Accents | Where the color appears | Are score colors separate from the brand color? |
|---|---|---|---|---|
| Letterboxd | dark-first (#14181C) | three brand colors, but green carries the UI | icon dots; primary button green #00AC1C; star ratings green #00E054; links blue #40BCF4 | **No**: the rating color is the brand green token (`--theme-rating-value-color: #00e054`) |
| Beli | light-first (white surfaces) | one brand accent (dark teal), plus a three-color score scale | wordmark, icon, segmented control, filled chips and marketing backgrounds in teal | **Yes**: score pins and circles are green about #087F4D, yellow about #F1C24B, red about #E16967 (approx, measured from the company's App Store screenshot). That is 36° of hue and some lightness away from the brand teal #134F5C. The first rating step uses the same three colors as buttons (green, yellow, red; The Crimson, third party) |
| Goodreads | light-first (cream #F4F2E9) | warm neutral brand plus green action and orange stars | icon cream with a black "g"; "Want to Read" button green #3F8363; links #00635D | **Yes**: stars are orange #E87400, a separate token |
| Trakt | both modes defined | one purple accent #9F42C6 | icon, accent token | not found (the app site blocked automated access) |
| Backloggd | dark-first (#16181C) | one pink accent #EA377A, with slate #4A5E8D for secondary buttons | CTA, links, rating histogram; multi-color dots for the homepage stats | **No**: the rating histogram uses the brand pink |

Wider patterns:

- **Dark-first is the norm for games and film trackers**: Letterboxd, Backloggd, Serializd, GG, Reelgood, JustWatch, Simkl, HowLongToBeat and Infinite Backlog all run on near-black or navy with one accent. **Light-first is the norm for books and restaurants**: Beli, Goodreads, Sofa, TasteDive, with StoryGraph following the system setting.
- **One accent on neutral surfaces is the dominant structure.** Only Letterboxd (three dots), Peacock (dots), Apple TV (gradient) and Simkl (several accents) are multi-color.
- **Score scales borrow traffic-light colors.** Beli and Metacritic both use green, yellow and red for scores. Metacritic's logo yellow is the same hex as its score yellow. Beli keeps its scale apart from its teal brand.
- **Platforms and streamers lean blue**: Steam, PlayStation, Discord, Prime Video, Paramount+ and MUBI. Red belongs to Netflix, Nintendo, Rotten Tomatoes and itch.io; yellow to IMDb, JustWatch and Metacritic; purple to Twitch, Trakt and GOG.
