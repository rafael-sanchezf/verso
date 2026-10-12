# Book data sources for a backlog tracker and ranking app

Research date: September 16, 2026. Scope: what Verso can pull programmatically for books, the third medium after games and screen, and which of those facts it can honestly put on a screen. Official documentation was preferred, then maintained open source libraries, then community writeups. Several pages would not render for me: the Hardcover docs site returns 403 to automated fetches (I read the published source in the `hardcoverapp/hardcover-docs` repository instead), the ISBNdb pricing page returns 403, and the New York Times developer portal is not fetchable (I read the `nytimes/public_api_specs` repository instead). Where a claim comes from a secondary source I say so. Several coverage claims below are my own measurements against the live APIs on the research date, and are labelled "measured".

Convention used below: "official" means the data owner publishes and supports the API; "unofficial" means reverse engineered or scraped, even if a well maintained library wraps it.

## 1. Summary table

| Source | Data | Official? | Auth | Cost | Risk |
|---|---|---|---|---|---|
| Open Library (Search, Works, Editions, Authors, Covers) | Works and editions, authors, subjects, first publish year, page counts, ISBNs, covers, series position, sparse ratings | Yes | None; User-Agent with contact required | Free; catalog data is CC0 | Low |
| Open Library monthly dumps | Full works, editions, authors, ratings, reading log, covers metadata | Yes | None | Free; CC0 | Low |
| Google Books API (volumes) | Description, pageCount, categories, publishedDate, industryIdentifiers, averageRating, ratingsCount, imageLinks, accessInfo | Yes | Optional API key | Free, but the terms forbid charging users for the app | High for a paid app |
| Hardcover GraphQL API | Books, editions, series with position, page counts, audio duration, ratings and distribution, user shelf counts | Yes (beta) | Personal access token, scoped, self-set expiry | Free 5,000 req/day; commercial tier "in the near future" | Medium |
| ISBNdb | ISBN to bibliographic record, bulk ISBN lookup, merchant prices on higher tiers | Yes | API key | Paid from about 15 USD/month | Low |
| WorldCat / OCLC Search API v2 | Library holdings, authority records | Yes | OCLC subscription | Institutional only; not available to an indie app | Blocking |
| Wikidata | Awards, series and ordinal, genres, publication dates, cross database IDs (Open Library, ISBN, Goodreads) | Yes | None; User-Agent required | Free; CC0 | Low |
| Goodreads | Ratings, series pages, shelves | API retired December 2020 | n/a | n/a | Blocking (terms forbid scraping) |
| Amazon product ratings | Star ratings | No public route | n/a | n/a | Blocking |
| StoryGraph | Ratings, moods, pace | No API | n/a | n/a | Blocking (scrapers only) |
| NYT Books API | Bestseller lists back to 2008, book reviews | Yes | API key | Free; 1,000 requests/day; attribution required | Low |
| Audible | Audiobook length, narrator | No public API | n/a | n/a | High |
| Libro.fm | Audiobook length, narrator | Partner and affiliate programs only | Partner credentials | Not self serve | Medium |
| Goodreads CSV export | User library, ratings, shelves, one read date, read count | Yes (user initiated) | User uploads the file | Free | Low |
| StoryGraph CSV export | User library, ratings, tags, moods, reading dates | Yes (user initiated) | User uploads the file | Free | Low |
| Kindle `My Clippings.txt` | Highlights and notes with timestamps | No; a device file | User uploads the file | Free | Medium |
| Bookwyrm | Public shelves over ActivityPub, CSV export | Partial (ActivityPub) | None for public data | Free | Medium |
| Literal.club | GraphQL shelves and reading states | Yes | JWT from email and password login | Free | Medium |
| Apple Books, Libby / OverDrive | User reading history | None | n/a | n/a | Blocking |

## 2. Section A: catalog and metadata

### 2.1 Open Library

Data model. Open Library splits records the way FRBR does. A **work** (`/works/OL8479867W`) is the abstract book and carries title, authors, description, subjects, `subject_people`, `subject_places`, genres and now a `series` array. An **edition** (`/books/OL...M`) is one published manifestation and carries ISBN-10 and ISBN-13, publisher, publish date, `number_of_pages`, `physical_format` and the cover ID. Almost every fact a UI wants sits on one layer or the other, and page counts in particular sit on the edition, which matters in section E.

Endpoints. Search is `https://openlibrary.org/search.json` with `q`, `title`, `author`, `subject`, `lang`, `sort` (`new`, `old`, `random`, `key`, or relevance), `limit`/`offset` or `page`, and a `fields` parameter. `fields=*` is documented as "an expensive response, please use sparingly", so name the fields you need. Useful search fields: `key`, `title`, `author_name`, `author_key`, `first_publish_year`, `cover_i`, `edition_count`, `isbn`, `subject`, `number_of_pages_median`, `ratings_average`, `ratings_count`. Records are also readable directly as `/works/{id}.json`, `/books/{id}.json`, `/authors/{id}.json`, `/works/{id}/editions.json` and `/isbn/{isbn}.json`.

Covers. `https://covers.openlibrary.org/b/{key}/{value}-{size}.jpg` where `key` is one of `isbn`, `oclc`, `lccn`, `olid` or `id`, and `size` is `S`, `M` or `L`. The docs describe the sizes by intent (thumbnail, details page, large) and do not publish pixel dimensions. Lookups by anything other than cover ID or OLID are throttled: "only 100 requests/IP are allowed for every 5 minutes". Storing the numeric `cover_i` from search and requesting by `id` therefore avoids the tight limit entirely, which is what Verso should do.

Rate limits and etiquette. Unidentified requests get one request per second; a request that sends a User-Agent naming the app and a contact address gets "3 requests per second", in the documented form `MyLibraryApp (contact@example.org)`. The etiquette page asks for caching, discourages HTML scraping and bulk harvesting through the live API, and warns that violations can lead to throttling or a block.

Bulk dumps and mirroring. Open Library publishes dumps "generated every month" as gzipped tab separated files with the full JSON record in the last column: editions (about 9.2G), works (about 2.9G), authors (about 0.5G), all types (about 12.4G), a complete dump with revisions (about 29.6G), plus ratings (about 5M), reading log (about 65M), lists, redirects, deletes and covers metadata. Torrents are offered through the Internet Archive. The dumps page itself states no license, but the Open Library FAQ does: the catalog data is available under the "CC0 1.0 Universal license". CC0 is a public domain dedication, so mirroring the dumps into Postgres, reshaping them, and serving them commercially is all permitted with no attribution obligation. **Verso can mirror Open Library exactly the way it mirrors IGDB.** The honest pattern is a monthly dump load for the bulk plus the live API for new and edited records, which also keeps you well inside the etiquette guidance. Covers are a separate question: the dedication covers catalog data, and cover images come from many sources, so treat covers as hotlinked or cached art rather than redistributable assets.

Stability risk. Low. Internet Archive project, stable URL scheme for many years, and the dumps give you a floor that no API change can take away.

Docs: https://openlibrary.org/developers/api and https://openlibrary.org/developers/dumps

### 2.2 Google Books API

What it exposes. `https://www.googleapis.com/books/v1/volumes?q=...` returns `volumeInfo` with `title`, `subtitle`, `authors`, `publisher`, `publishedDate`, `description`, `industryIdentifiers` (ISBN-10 and ISBN-13), `pageCount`, `categories`, `averageRating`, `ratingsCount`, `imageLinks` (thumbnail through extraLarge), `language`, `previewLink` and `infoLink`, plus `saleInfo` (saleability, price, buy link) and `accessInfo` (viewability, EPUB and PDF availability, text to speech).

Quota. The Books API documentation does not state a quota. Community sources and the Google Cloud console consistently report a default of 1,000 requests per day per project, raisable for free on request; some 2024 era sources report 10,000. Measured on the research date: fifteen sequential unkeyed volume lookups from a shared address all returned HTTP 429 immediately, so unkeyed access is not usable for even light enrichment and a project key is mandatory. I could not therefore measure `averageRating` coverage directly; community writeups describe the rating fields as commonly blank, which matches the fact that they reflect Google Play Books reviews rather than a general reading community.

Terms. Two clauses are decisive for Verso. The API Terms of Service say a developer "may not charge users any fee for the use of your application" without a separate written agreement with Google. The branding guidelines say Google attribution is required, the "powered by Google" logo "must always be displayed alongside any search modules or results", every book result needs a prominent link to its Google Books page or a Google Preview page, and you "may not reorder or otherwise alter the results returned". A comparison ranking app exists to reorder books, and Verso intends to charge eventually, so Google Books cannot be the catalog spine. It is a reasonable free enrichment source for descriptions and page counts in a free product, and it should be a fallback that is easy to switch off.

Stability risk. Low technically, high contractually.

Docs: https://developers.google.com/books/docs/v1/using, https://developers.google.com/books/terms and https://developers.google.com/books/branding

### 2.3 Hardcover

What it exposes. One GraphQL endpoint at `https://api.hardcover.app/v1/graphql`, the same API the website and mobile apps use. The `books` type carries `title`, `subtitle`, `description`, `pages`, `audio_seconds`, `release_date`, `release_year`, `rating`, `ratings_count`, `ratings_distribution`, `users_count`, `users_read_count`, `reviews_count`, `book_category_id` (novel, novella, graphic novel, poetry and others), `book_series`, `contributions`, `cached_tags`, `book_mappings` for external platform IDs, and four pointers that matter a great deal for section G: `default_physical_edition_id`, `default_ebook_edition_id`, `default_audio_edition_id` and `default_cover_edition_id`. The `editions` type adds `isbn_10`, `isbn_13`, `asin`, `pages`, `audio_seconds`, `physical_format`, `edition_format`, `reading_format`, `publisher`, `language` and `release_date`.

Auth. A personal access token created in account settings, with selectable scopes and a self-chosen expiry, sent as an `authorization` header. Tokens created before August 2026 behave as `all` scope. The docs are explicit that this is a backend credential: "This should only be used from a code backend", and browser use is blocked today. OAuth for external applications is on the 2026 roadmap.

Rate limits. Three buckets, with standard IETF `RateLimit` headers plus legacy `X-RateLimit-*`. Free: 5,000 requests per day, burst 10, 60 per minute. Supporter: 50,000 per day, burst 15, 60 per minute. Separately, a single request may contain at most five top-level queries (or five mutations, or one `search`), and exceeding that is a 403 rather than a throttle. Query timeout 30 seconds, search timeout 2 seconds. Each top-level query counts as one request, so nest fields rather than aliasing repeated roots.

Terms. This is the most important licensing text in the whole document. Hardcover claims no copyright over the data, but tells commercial products and public websites they "may not use data owned by users", listing libraries and stats, reviews, ratings, dates read, journals, lists and goals. The exception is stated directly: "Using aggregate data is allowed, if it's mentioned to be Hardcover data", with "average Hardcover rating" given as the example. So per-user data is off limits unless you are acting for that user, and the aggregate average rating is permitted as long as the UI names Hardcover. There is also a warning that images are user uploaded and that any public site reusing them should "make absolutely sure you have a DMCA takedown policy". The docs also say you "agree not to use to train large language models" that are public or commercial.

Stability risk. Medium, and self declared: "The API is still heavily in flux right now" and "We may reset tokens without notice while in beta". The free tier's stated intent is personal use, and a commercial tier is promised but not shipped. Treat Hardcover as a nightly enrichment source, cache everything, and expect to email them before launch.

Docs: https://docs.hardcover.app/api/getting-started/ (403 to automated fetches; source at https://github.com/hardcoverapp/hardcover-docs)

### 2.4 ISBNdb and WorldCat

ISBNdb is a paid, well scoped ISBN to record service. The pricing page did not render for me; search summaries and its own blog put the tiers at roughly 14.99, 35.99, 99.99 and 299.99 USD per month, with one request per second on Basic, about three per second on Premium, bulk lookup of 100 ISBNs per call on Basic and 1,000 on Premium and above, and merchant prices from Pro upward. It is the right tool if Verso ever needs authoritative edition level records for arbitrary ISBNs, and unnecessary while Open Library covers the catalog.

WorldCat is closed to Verso. Version 1.0 of the Search API was switched off through 2025, and v2 eligibility per OCLC is limited to libraries holding both an "OCLC Cataloging and Metadata subscription (full cataloging)" and a FirstSearch or WorldCat Discovery subscription: "Both are required." Commercial partnerships exist but are negotiated, not self serve. Skip it.

### 2.5 Wikidata for books

Wikidata mirrors the same work and edition split. A work item (`P31` written work or a subclass) carries `P50` author, `P136` genre, `P577` publication date, `P179` part of the series with the `P1545` series ordinal qualifier, `P166` award received and `P1411` nominated for. An edition item (`P31` version, edition or translation) carries `P212` ISBN-13, `P1104` number of pages, `P123` publisher and `P393` edition number, and links up to its work with `P629`. `P648` is the Open Library ID and `P8383` the Goodreads work ID, which makes Wikidata the join table between Verso's Open Library keys and everything else.

Coverage, measured on the research date by SPARQL against the Query Service: 1,378,540 items are a written work or a subclass; 489,436 items carry `P648`; 332,289 carry `P212`; 76,055 carry `P8383`. So roughly a third of Wikidata's written works can be joined to Open Library by ID, and ISBN joins are thinner still. Wikidata is an enrichment layer for awards and series, not a catalog.

Limits are the same as for the games work: a 60 second query deadline, 60 seconds of processing per 60 second window per client, 5 parallel queries per IP, and a meaningful User-Agent is mandatory.

Docs: https://www.wikidata.org/wiki/Wikidata:WikiProject_Books

## 3. Section B: series data

The screen wants "book 2 of 3 in The Kingkiller Chronicle". Three sources can contribute and none of them delivers the whole string alone.

**Open Library** is better than its reputation and worse than it looks. Measured on the research date: work records now carry a structured `series` array, for example `[{"series": {"key": "/series/OL337960L"}, "position": "1"}]`, and `/series/OL337960L.json` resolves to a real record named "The Kingkiller Chronicle". This is new: that series record was created on 2026-06-13. Coverage on the thirty most-read fiction works was 16 of 30. Two gaps make it insufficient on its own. The series record reports `seed_count: 0` and its `/seeds.json` endpoint returned Internal Server Error, so Open Library will tell you the book is number 1 but not what the denominator is. And `series` is not returned as a search field, so you cannot facet or filter on it; a `series:"Harry Potter"` query is a fuzzy text match that returned 130 results.

**Wikidata** gives position reliably where it has the work at all, through `P179` with the `P1545` qualifier, and the series item usually carries `P527` has part, which supplies a denominator. The pitfalls are real. Measured on the Harry Potter series item: ordinals include a fractional `0.5` for the prequel, *Cursed Child* appears twice and carries no ordinal at all, and `P527` lists eight parts, so a naive "of N" would render "book 2 of 8" for a seven book series. Fractional ordinals for novellas are a genre convention in fantasy and science fiction and will appear constantly.

**Hardcover** is the only source that answers the whole question in one query. `book_series` carries `position` (numeric) and `details` (the text form of the position, which is where "1.5" and "Book Two" live), and the `series` type carries `name`, `books_count`, `primary_books_count` and `is_completed`. `primary_books_count` is exactly the denominator a UI wants, because it excludes novellas and companion volumes, and `is_completed` lets the app say whether more are coming.

**Goodreads series pages** are the canonical public answer and are unavailable: no API since 2020 and the terms forbid the alternative (see section C).

What the app should store. On the media-agnostic `MediaItem`, a nullable `series_id`, a `series_position` as a decimal (not an integer, because of 0.5), and a `series_position_label` free text for display. On a separate `series` table: `name`, `total_primary_count`, `is_completed`, plus `openlibrary_key`, `wikidata_qid` and `hardcover_id` so the nightly job can reconcile. Render "Book 2 of 3" only when `total_primary_count` is present and the position is a whole number; otherwise render "Book 1.5 in The Kingkiller Chronicle" with no denominator. Never compute the denominator by counting rows you happen to have mirrored.

## 4. Section C: community scores

### 4.1 Goodreads

Goodreads stopped issuing developer keys on December 8, 2020 and retired the API, including disabling keys that had been idle for thirty days. There is no route to a new key. Scraping is not a fallback: the Goodreads Terms of Use prohibit "any use of data mining, robots, or similar data gathering and extraction tools", and the same clause separately forbids commercial use of book listings, descriptions and reviews. Goodreads ratings are the number every reader has in their head and Verso cannot show them. Confirmed current as of the research date.

### 4.2 Amazon and StoryGraph

Amazon product ratings have no public API route for this purpose. StoryGraph publishes no API; the only programmatic access is third party scrapers on Apify, which carry the same terms problem. Both are no.

### 4.3 Open Library ratings

Real, CC0, available in search (`ratings_average`, `ratings_count`) and in the monthly ratings dump, and far too sparse to display. Measured on the research date against the forty most-read fiction works on the site: all forty carried a rating, but the single highest `ratings_count` in that set was 1,055, on *It Ends With Us*. Since that sample is sorted by reading log popularity, roughly a thousand ratings is the ceiling for the entire catalog, not the average. *The Name of the Wind* had 255. A four star average from 255 people is not a community rating, and putting it beside a book with six ratings invites exactly the false precision the app is trying to avoid.

### 4.4 Google Books averageRating

Present in the schema, sparse in practice, and encumbered by the terms in 2.2: no fee for the app, a "powered by Google" logo beside anything derived from a search, and no reordering of results. A ranking app should not build a visible score on it.

### 4.5 Hardcover ratings

The one workable answer. `books.rating` (0 to 5), `books.ratings_count` and `books.ratings_distribution` are aggregate fields, and Hardcover's commercial terms permit aggregate data when labelled: "Using aggregate data is allowed, if it's mentioned to be Hardcover data". `users_count` and `users_read_count` are also aggregates and are usable on the same basis. What is not usable is any individual user's rating, review, shelf or dates read, unless Verso is acting on behalf of that signed-in user.

### 4.6 The honest position

Yes, there is exactly one community rating a published app can legitimately show for a typical book, and it is the Hardcover average, displayed with the source in the label and the sample size next to it, for example `Hardcover 4.2 (1,203 ratings)`. Two caveats have to be designed for. Hardcover is a much smaller community than Goodreads, so a mid-list or older title may have double digit rating counts; suppress the number below a threshold (a hundred ratings is a defensible floor) rather than showing a noisy average. And the API is in beta with a promised but unshipped commercial tier, so the score has to be a nullable, cached, clearly-attributed field the UI can render as absent. Open Library's rating can be stored as a secondary signal and should not be displayed at MVP.

## 5. Section D: awards

Wikidata is the only realistic source. `P166` award received and `P1411` nominated for, both qualified with `P585` point in time for the year and `P1552` has characteristic for the stage.

Coverage, measured on the research date. Restricting to items typed as a written work or subclass, `P166` values include Newbery Medal 87, Hugo Award for Best Novel 76, Nebula Award for Best Novel 62, Hugo Award for Best Novella 61, Nebula Award for Best Novella 61. Since the Hugo for Best Novel has been awarded about 73 times, 76 items is effectively complete for that category. `P1411` is much denser because it records whole shortlists: Booker Prize 426 works, and the Locus categories over a thousand each. So for the major prizes, winners are close to complete and nominations are well populated. That is good enough to ship.

Five pitfalls, all of them observed rather than theorised.

1. **Awards are recorded per category, not per prize.** There is no useful "won the Hugo" statement. Items carry `Hugo Award for Best Novel` (Q255032), `Hugo Award for Best Novella` (Q549884) and so on. Querying the parent `Hugo Award` (Q160082) returned 14 items. Verso needs a curated allowlist of category QIDs per prize it wants to surface.
2. **`P166` is used for lists that are not awards.** Among the most common `P166` values on written works are `Michigan Notable Books` (103), `20th Century's Greatest Hits: 100 English-Language Books of Fiction` (86), `Le Monde's 100 Books of the Century` (75) and `NPR Top 100 Science Fiction and Fantasy Books` (73). Rendering every `P166` as "Award won" would put "won NPR Top 100" on a book page. The allowlist in pitfall 1 solves this too, and is not optional.
3. **Many award statements sit on the author, not the work.** Of the items carrying a Booker Prize `P1411` statement, 339 are typed `human` against 425 typed `literary work` and 55 typed `written work`. The author-item statements carry a `P1686` "for work" qualifier pointing at the book. A query that only looks at the work item silently loses a large share of the data, and a query that treats an author's award as the book's award will credit the wrong title.
4. **Shortlist and longlist are a qualifier, not a separate property.** On Booker `P1411` statements, `P1552` splits 540 `Booker Prize shortlist` against 415 `Booker Prize longlist`. Without reading `P1552` the app cannot tell the two apart, and "Booker nominee" for a longlisting overstates it.
5. **Work versus edition.** Awards belong on the work item. The type filter also matters: `Hugo Award for Best Novel` returned 76 items under the written-work type filter and 129 with no type filter, the difference being items typed as something else entirely. Filter by type to avoid awards attached to series or adaptations, and accept that you will lose some correctly-typed-differently works.

Verdict: "Won the Hugo Award for Best Novel, 2023" and "Booker Prize shortlist, 2022" are both reliably derivable for the major English language prizes, provided you allowlist categories, follow the author path, and read `P1552`. Nobel is author level only (`P166` on the person) and should be rendered as an author credential, never as a book award.

SPARQL shape for "all awards and nominations for the work with Open Library ID X or ISBN Y":

```sparql
SELECT ?work ?workLabel ?kind ?awardLabel ?year ?stageLabel ?viaLabel WHERE {
  VALUES ?olid  { "OL8479867W" }          # Open Library work key, or
  VALUES ?isbn  { "9780756404079" }       # ISBN-13 on an edition

  { ?work wdt:P648 ?olid }
  UNION { ?work wdt:P212 ?isbn }
  UNION { ?ed wdt:P212 ?isbn ; wdt:P629 ?work }   # edition -> work

  {
    # statements on the work itself
    { ?work p:P166 ?st . ?st ps:P166 ?award . BIND("won" AS ?kind) }
    UNION
    { ?work p:P1411 ?st . ?st ps:P1411 ?award . BIND("nominated" AS ?kind) }
  } UNION {
    # statements on the author, qualified "for work" (pitfall 3)
    ?via p:P166|p:P1411 ?st .
    ?st ?ps ?award ; pq:P1686 ?work .
    FILTER(?ps IN (ps:P166, ps:P1411))
    BIND(IF(?ps = ps:P166, "won", "nominated") AS ?kind)
  }

  OPTIONAL { ?st pq:P585 ?when . BIND(YEAR(?when) AS ?year) }
  OPTIONAL { ?st pq:P1552 ?stage }        # shortlist vs longlist (pitfall 4)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
```

Filter `?award` against the curated category allowlist before display. Run this as a nightly batch keyed on the Open Library IDs Verso already mirrors, not per page view.

## 6. Section E: reading time, the analog of time to beat

Page counts are unreliable at the edition level and workable at the work level. Measured on the research date against the 76 editions of *The Name of the Wind*: of the first 50 editions, only 28 carried a `number_of_pages` at all, and the values present ranged from 661 to 944 (plus one 23 page outlier, presumably a study guide catalogued against the work). A 40 percent spread between a mass market paperback and a large print hardcover is normal, and picking whichever edition sorted first would produce a visibly wrong number. Open Library's `number_of_pages_median` in the search index is the right figure precisely because it is a median across editions, and it was present on all forty works in the popularity sample. Hardcover's `books.pages` is a curated single value per work and makes a good cross check. Google Books `pageCount` is per volume and inherits the same edition problem, plus the terms in 2.2.

Word counts are not available. Amazon computes one for every Kindle book and does not publish it; there is no public source of per-book word counts at catalog scale. Any word based estimate has to derive words from pages.

A defensible formula. Trade fiction runs roughly 250 to 300 words per page. Adult reading speed is commonly cited at 200 to 300 words per minute, with recent aggregates around 238 wpm for non-fiction and 260 wpm for fiction, and Amazon's own baseline before personalisation is reported as about 250 wpm. Taking 275 words per page and 250 words per minute gives **1.1 minutes per page**, so:

    minutes = number_of_pages_median * 1.1

A 400 page novel becomes 440 minutes, displayed as "~7.5 h". Round to the nearest half hour above three hours and to the nearest ten minutes below, and never show minutes precision. Kindle and Apple Books both do better than this by measuring the individual reader (Kindle's "Time to Read" personalises from observed page turns), which is worth copying later: once Verso has its own finished-reading timestamps it can compute a per-user pages-per-hour and show a personalised figure the way the games side plans to compute median playtime from its own users.

Audiobook lengths. Audible has no public API, only reverse engineered clients (`mkb79/Audible` and similar) against the internal app API, which is the same category of risk as the PlayStation work and is not worth taking for a duration field. Libro.fm runs partner and affiliate programs rather than a self serve API. Open Library editions do sometimes describe audio editions, but as free text formats (`mp3 cd`, `audio cd`, `4 mp3-CDs`) with no duration. **Hardcover `books.audio_seconds` and `editions.audio_seconds` are the only structured audiobook duration Verso can legitimately get**, and they are covered by the aggregate-data allowance because they are catalog facts rather than user data.

Recommendation for the UI. One figure, format aware. If the user's entry is marked as an audiobook and `audio_seconds` is present, show the real duration labelled `Audiobook 27h 30m (Hardcover)`. Otherwise show `~7.5 h read`, computed as median pages times 1.1 minutes, with the estimate basis available on tap ("estimated from 412 pages at 250 wpm"). The tilde and the word "estimated" do the honest work; the number is never presented as measured.

## 7. Section F: user history import, the Steam analog

**Goodreads CSV export** is the single most valuable import and it is a file upload, not an API. The user requests it from My Books, Import and Export, and receives a CSV with Title, Author, ISBN and ISBN13, My Rating, Average Rating, Publisher, Number of Pages, Year Published, Original Publication Year, Date Read, Date Added, Bookshelves, Exclusive Shelf, My Review and Read Count. `Exclusive Shelf` holds exactly one of `read`, `currently-reading` or `to-read`, which maps cleanly onto Verso's entry states, and custom shelves arrive in `Bookshelves`. The critical limitation: re-reads collapse. If a user read a book three times the CSV carries `Read Count 3` and a single `Date Read`. The re-read history survives as a count and the individual dates do not, so Verso's data model should accept a read count alongside its read events rather than assuming one event per read.

**StoryGraph CSV export** exists and is reachable from the website only (Manage Account, Manage Your Data, Export StoryGraph Library; not in the mobile app). Each row carries title, authors, ISBN, format, read status, star rating including halves and quarters, review, tags, moods and reading dates. StoryGraph records start and finish dates per read, so it carries better date fidelity than Goodreads.

**Kindle.** No API. `My Clippings.txt` on the device is an append only log of highlights, notes and bookmarks, each with title, author, type, page or location, a timestamp and the text. It tells you a user was reading a book on a date, which is a weak proxy for a read event, and it never records that a book was finished. Deleted highlights stay in the file. The Kindle reading insights pages on Amazon's site are not exported. Treat clippings as an optional signal for "currently reading" detection at best, not as a library import.

**Apple Books**: nothing. **Libby and OverDrive**: nothing.

**Bookwyrm**: ActivityPub, so a public profile's shelves are fetchable as ActivityPub collections without credentials, and it carries started-reading and finished-reading dates. There is little API beyond what ActivityPub exposes. It also supports CSV import and export. Small user base; low priority but cheap and legitimate.

**Literal.club**: a documented GraphQL API at `literal.club/pages/api` covering shelves, reading states, reviews, highlights and goals. Auth is a login mutation exchanging email and password for a JWT valid about six months. Asking users for a third party password is a pattern Verso should not ship, so this is a later item pending OAuth.

Which give read dates and re-read counts: StoryGraph gives per-read start and finish dates. Goodreads gives one finish date plus a re-read count. Bookwyrm gives start and finish dates. Kindle clippings give activity timestamps only. Literal gives reading states with dates behind a password exchange.

## 8. Section G: formats and ownership

Verso treats ownership as a fact separate from wanting and from having read, and for books ownership is per format: paper, ebook or Kindle, audiobook, and library loan. The app therefore needs to know which formats exist for a work before it can ask the user which they own.

**Hardcover answers this directly and is the recommended source.** The `books` type carries `default_physical_edition_id`, `default_ebook_edition_id` and `default_audio_edition_id`. A non-null pointer is a clean, single-field answer to "does a paperback / ebook / audiobook of this exist", and the pointed-to edition carries `physical_format`, `reading_format`, `pages`, `audio_seconds` and `isbn_13`. This is also how audiobook existence becomes discoverable at all, since Audible is closed and Libro.fm is partner only.

**Open Library** can answer it, messily. `/works/{id}/editions.json` returns each edition's `physical_format`, but the field is uncontrolled free text. Measured across 50 editions of one work, the format values were: `hardcover`, `Hardcover`, `Hardback`, `paperback`, `Paperback`, `mass market paperback`, `Mass Market Paperback`, `gebundene Ausgabe`, `Taschenbuch`, `e-book`, `Ebook`, `audio cd`, `mp3 cd`, `MP3 CD`, `4 mp3-CDs`, `Audiolibro`, and twelve editions with no format at all. Audiobook existence is therefore inferable but only through a normalisation table that handles case, language and media variants, and it yields no duration. Build the mapping if you use it, and expect to maintain it.

**Google Books** `accessInfo` reports `epub.isAvailable` and `pdf.isAvailable`, which tells you what Google Play Books sells rather than what exists in the world, and it does not cover audiobooks in the volumes API. Not a general format oracle.

Library loan availability (does my library have it) needs OverDrive or WorldCat and neither is open to Verso, so library loan should be a user-asserted ownership state with no availability lookup behind it.

## 9. Section H: new releases and upcoming

The "Coming up" row needs a publication date for a book the user wants, or for the next book in a series they follow. No source does this well.

**Open Library** carries future dated works but very thinly. Measured on the research date: `first_publish_year:2026` returned 44,040 works and `first_publish_year:2027` returned 50. Announced-but-unpublished books are essentially absent, because records are created when editions are catalogued.

**Google Books** does carry `publishedDate` for announced titles once a publisher supplies ONIX metadata, and is the best forward-looking of the open catalogs, but the fee and no-reordering terms in 2.2 rule it out as a dependency.

**Wikidata** `P577` on unpublished works is thin for the same reason as Open Library, though highly anticipated titles in active series do get items early.

**Hardcover** carries `books.release_date` and `release_year`, and its series data (`primary_books_count`, `is_completed`) lets the app reason about whether a next book is expected at all. Combined with `book_status_id` it is the most practical single source for the next-in-series case.

**Publisher feeds** (ONIX) are where accurate pub dates actually live, and they require per-publisher or per-aggregator agreements. Out of scope for the MVP.

**NYT Books API** is not an upcoming-releases feed. It gives bestseller lists back to June 2008, list overviews, per-book list history and book reviews. Auth is an API key and "Usage is limited to 1,000 requests per day", shared across NYT APIs; requests without a key return 401, confirmed on the research date. Attribution is required under the NYT attribution guidelines, which must be agreed to when the key is issued. It is a good source for a "Best sellers" discovery row and irrelevant to "Coming up".

Recommendation: derive "Coming up" from Hardcover `release_date` reconciled against Open Library, store a date precision flag (day, month, year, unknown) alongside the date, and render anything less precise than a month as "Expected 2027" rather than inventing a day. Never show a countdown against a date whose precision is a year.

## 10. Recommended stack for MVP

1. **Catalog: Open Library as the single source of truth**, mirrored into Postgres exactly the way IGDB is. Load the monthly works, editions and authors dumps for the bulk, then poll the Search API for new and changed records. CC0 means no attribution obligation and no redistribution limit, which is a materially better position than the games side has with IGDB. Send a User-Agent naming Verso with a contact address to get the 3 requests per second tier.
2. **Covers: Open Library covers by numeric cover ID** (`/b/id/{cover_i}-L.jpg`), stored from search results so you never touch the 100 requests per 5 minutes ISBN path. Cache locally and treat covers as third party art, not redistributable assets.
3. **Enrichment: Hardcover, nightly, keyed by ISBN-13.** Take `pages`, `audio_seconds`, `book_series` with position, `series.primary_books_count` and `is_completed`, the three `default_*_edition_id` format pointers, and the aggregate `rating` / `ratings_count`. Stay inside 5,000 requests per day by batching up to five top-level queries per request and only refreshing books a user actually tracks. Email Hardcover before charging for Verso.
4. **Awards and series reconciliation: a nightly Wikidata SPARQL job** keyed on the Open Library IDs already mirrored, using the query in section D with a curated award-category allowlist. CC0, no attribution burden.
5. **Ratings: Hardcover only, labelled `Hardcover 4.2 (1,203 ratings)`,** suppressed below a hundred ratings. No Goodreads, no Amazon, no StoryGraph, no Google Books score.
6. **Reading time: median pages times 1.1 minutes**, shown as "~7.5 h read", swapping to real `audio_seconds` when the entry is an audiobook.
7. **Import: Goodreads CSV first, StoryGraph CSV second.** Both are user-initiated file uploads, which means no credentials, no terms exposure, and no dependency on a third party staying up. Model a read count separately from read events so Goodreads re-reads survive the import.
8. **Discovery extras, later: NYT Books API** for a bestsellers row, with the required attribution.

Compliance checklist for the MVP: a User-Agent with a contact address on every Open Library and Wikidata request; "Hardcover" named in the UI next to every rating and audiobook duration; a DMCA takedown policy published before any Hardcover-sourced image is displayed publicly; NYT attribution if the bestseller row ships. Nothing in this stack requires a paid tier or a backlink on every page.

## 11. Deferred or risky

- **Google Books**: usable as a free-tier enrichment fallback for descriptions, but it cannot be a dependency. The "may not charge users any fee" clause conflicts directly with Verso's eventual business model, and "may not reorder or otherwise alter the results" conflicts with the product itself. Design it to be removable.
- **Hardcover as the catalog spine**: no. Beta, self declared as in flux, tokens resettable without notice, free tier intended for personal use, commercial tier unshipped. Excellent enrichment layer, unacceptable single point of failure.
- **Goodreads, in any form**: no. No API since 2020, no new keys, and the terms forbid the scraping alternative. Do not ship a Goodreads rating, a Goodreads series lookup, or a Goodreads link that implies a data relationship.
- **StoryGraph and Amazon ratings**: no. Scrapers only.
- **Audible**: no. Reverse engineered clients only, for a single duration field that Hardcover supplies legitimately.
- **Literal.club import**: deferred until it offers OAuth. Do not ask users for a third party password.
- **Kindle**: no library import. Revisit `My Clippings.txt` only as an optional "currently reading" signal.
- **WorldCat / OCLC**: no. Institutional subscriptions only.
- **ISBNdb**: only if Open Library's edition coverage proves inadequate for a specific feature; about 15 USD/month buys the entry tier.
- **Library availability (Libby, OverDrive)**: no lookup exists. Ownership state "library loan" stays user asserted.
- **Publisher ONIX feeds for upcoming releases**: out of scope until Verso is large enough to sign agreements.
- **Open Library ratings as a displayed score**: no. Store them, do not render them; the ceiling of roughly a thousand ratings makes them noise.

## 12. Sources

Catalog and metadata
- [Open Library Developer APIs](https://openlibrary.org/developers/api)
- [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers)
- [Open Library Search API](https://openlibrary.org/dev/docs/api/search)
- [Open Library Data Dumps](https://openlibrary.org/developers/dumps)
- [Open Library FAQ: Using Open Library Data (CC0)](https://openlibrary.org/help/faq/using)
- [Google Books API: Using the API](https://developers.google.com/books/docs/v1/using)
- [Google Books API Terms of Service](https://developers.google.com/books/terms)
- [Google Books API Branding Guidelines](https://developers.google.com/books/branding)
- [Hardcover API documentation](https://docs.hardcover.app/api/getting-started/)
- [hardcoverapp/hardcover-docs source repository](https://github.com/hardcoverapp/hardcover-docs)
- [ISBNdb API pricing](https://isbndb.com/isbn-database)
- [OCLC WorldCat Search API](https://www.oclc.org/developer/api/oclc-apis/worldcat-search-api.en.html)
- [OCLC WorldCat Search API transition](https://www.oclc.org/developer/support/worldcat-search-transition.en.html)
- [Wikidata WikiProject Books](https://www.wikidata.org/wiki/Wikidata:WikiProject_Books)
- [Wikidata Query Service User Manual](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)

Scores
- [Goodreads Terms of Use](https://www.goodreads.com/about/terms)
- [Goodreads Developers: API deprecation thread](https://www.goodreads.com/topic/show/21788520-api-deprecation)
- [Goodreads is retiring its current API (Debugger)](https://debugger.medium.com/goodreads-is-retiring-its-current-api-and-book-loving-developers-arent-happy-11ed764dd95)
- [Goodreads shutters all APIs (Stephanie Wilkinson)](https://stephanieawilkinson.com/2020/12/10/yonderbook-and-goodreads/)
- [Open Library Ratings API issue #7918](https://github.com/internetarchive/openlibrary/issues/7918)

Reading time and audiobooks
- [What is the average reading speed (Iris Reading)](https://irisreading.com/what-is-the-average-reading-speed/)
- [Reading speed statistics (WordsRated)](https://wordsrated.com/reading-speed-statistics/)
- [Kindle's estimates of reading speed](https://www.goodreads.com/author_blog_posts/19325480-kindle-s-down-to-earth-estimates-of-reading-speed)
- [mkb79/Audible, unofficial Audible API client](https://github.com/mkb79/Audible)
- [Libro.fm API authors page](https://libro.fm/api)

Imports
- [How to export your Goodreads library to CSV](https://gist.github.com/kaayru/87385f85ec577b8e3d9613ecb09c90ca)
- [How to export your StoryGraph data](https://getendleaf.com/blog/how-to-export-your-storygraph-data/)
- [Kindle My Clippings.txt technical guide](https://www.kindleexport.com/blog/what-is-the-kindle-my-clippings-file)
- [lvzon/kindle-clippings parser](https://github.com/lvzon/kindle-clippings)
- [Bookwyrm: does it have an API?](https://github.com/bookwyrm-social/bookwyrm/discussions/2662)
- [Bookwyrm ActivityPub documentation](https://docs.joinbookwyrm.com/activitypub.html)
- [Literal.club API](https://literal.club/pages/api)

Upcoming and lists
- [NYT Books API specification](https://github.com/nytimes/public_api_specs/blob/master/books_api/books_api.md)

## 13. What the screens can show

One line each. The label in backticks is what the UI puts next to the value.

- **Author**: yes. Open Library work `authors`, mirrored. No label needed.
- **Page count**: yes, with caveat. Open Library `number_of_pages_median` (never a single edition's count, which varied 661 to 944 across editions of one work); label `412 pages (median edition)`.
- **Reading-time estimate**: with caveat. Computed, median pages times 1.1 minutes; label `~7.5 h read`, with "estimated from 412 pages at 250 wpm" on tap. Never presented as measured.
- **Publication year and date**: yes. Open Library `first_publish_year` for the work, Hardcover `release_date` when a full date is needed; store a precision flag and render `2019` rather than a fake day.
- **Series and position**: yes, with caveat. Hardcover `book_series.position` plus `series.primary_books_count`; label `Book 2 of 3 in The Kingkiller Chronicle`, degrading to `Book 1.5 in The Kingkiller Chronicle` with no denominator when the position is fractional or the count is missing.
- **Genres and subjects**: with caveat. Open Library `subjects` are library headings and are noisy; map them through a curated genre taxonomy and show the mapped genre, not the raw subject. No source label.
- **Description**: yes. Open Library work `description`, falling back to Hardcover `description`. Label the fallback `Description from Hardcover`.
- **Cover**: yes. Open Library covers by numeric cover ID. No label; treat as third party art and cache rather than redistribute.
- **Community rating**: with caveat, from exactly one place. Hardcover aggregate `rating` and `ratings_count`; label `Hardcover 4.2 (1,203 ratings)`, suppressed entirely below a hundred ratings. Goodreads, Amazon, StoryGraph and Google Books ratings cannot be shown.
- **Awards won and nominated**: yes, with caveat. Wikidata `P166` and `P1411` against a curated award-category allowlist, reading `P585` for the year and `P1552` for the stage; labels `Won the Hugo Award for Best Novel, 2023` and `Booker Prize shortlist, 2022`. Nobel appears as an author credential only.
- **Formats available (paper, ebook, audiobook)**: yes. Hardcover `default_physical_edition_id`, `default_ebook_edition_id` and `default_audio_edition_id`; no label, these drive the per-format ownership toggles. Library loan is user asserted with no availability lookup.
- **Audiobook length**: with caveat. Hardcover `audio_seconds`, the only structured source; label `Audiobook 27h 30m (Hardcover)`. Absent for many titles, so the field must render as missing rather than estimated.
- **Upcoming release dates**: with caveat. Hardcover `release_date` reconciled against Open Library, with a precision flag; label `Expected March 2027`, or `Expected 2027` when precision is only a year. No countdowns against year-precision dates.
- **Read history import**: yes. Goodreads CSV (one `Date Read` plus `Read Count`, so re-read dates are lost) and StoryGraph CSV (per-read start and finish dates), both as user-uploaded files; label the import source on each imported entry.
