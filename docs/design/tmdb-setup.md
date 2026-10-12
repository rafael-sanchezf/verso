# TMDB access for the film and TV catalog

Written 2026-09-16, alongside [film-tv-catalog.md](film-tv-catalog.md), which is the design this document gives Rafa the credential for. The mirror itself is `packages/catalog`'s `tmdb-sync` command and `.github/workflows/tmdb-sync.yml`.

TMDB is not operated through a third party the way IGDB is operated through Twitch, so there is no developer console and no client secret: an ordinary TMDB account requests an API key, and the settings page then shows both a v3 key and a v4 read access token. We use the token.

## Steps

1. Create a free account at `themoviedb.org/signup` and verify the email. A plain viewer account is enough; no paid tier and no organisation.
2. Open Settings, then the API tab (`themoviedb.org/settings/api`), and click Request an API Key.
3. Choose **Developer**, not Professional. Developer is the free, non-commercial tier and is the one a free app with no ads, no subscription and no in-app purchase belongs on. Professional is for the paid case and needs the written agreement below.
4. Accept the terms of use, then fill the short form. It asks for an application name, an application URL and a short summary of what the application does. None of it is verified and none of it is public, but answer honestly, because it is what TMDB looks at if they ever ask why an address is pulling fifty thousand titles:
   - Type of use: Personal / Mobile Application.
   - Application name: `Verso`.
   - Application URL: `https://github.com/rafael-sanchezf/verso` until there is a real site.
   - Summary: something like "A personal media ranking and watchlist app. Mirrors the TMDB catalog nightly into a private Postgres database and shows titles, runtimes, certifications, release dates and streaming availability in a mobile app."
   - Address fields: TMDB requires them. They are not shown anywhere.
5. The key is issued immediately. Back on the same API settings page there are two values:
   - **API Key (v3 auth)**, a 32-character hex string that goes in a query parameter.
   - **API Read Access Token**, a long JWT that goes in an `Authorization: Bearer` header.

   Copy the **API Read Access Token**. The bearer token works against every v3 route (research 2.3), so one credential covers everything the mirror does and nothing ever puts a key in a URL.

## Where it goes

- `.env`, as `TMDB_API_READ_ACCESS_TOKEN=...`. The file is git-ignored; `.env.example` lists the name and nothing else.
- A repository secret of the same name: Settings, Secrets and variables, Actions, New repository secret. This is what `.github/workflows/tmdb-sync.yml` reads.

Until the secret exists the scheduled workflow runs, prints one line saying it is skipping, and exits 0. That is deliberate and is the same choice `opencritic-scores` makes: a scheduled run on a repository without the secret is a run with nothing to do, not a red workflow.

The token never reaches the app. The Expo client talks to Supabase and reads the mirrored rows; it builds image URLs from stored paths, which needs no credential at all. The daily id exports the same command reads are public files on `files.tmdb.org` and are fetched with no `Authorization` header, so the token only ever goes to `api.themoviedb.org`.

## Test the token from your own terminal

```bash
export TMDB_API_READ_ACCESS_TOKEN="paste-the-read-access-token"
```

```bash
curl -s -H "Authorization: Bearer $TMDB_API_READ_ACCESS_TOKEN" \
  'https://api.themoviedb.org/3/movie/550?language=en-US&append_to_response=credits,external_ids,release_dates,watch/providers' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["title"], d["release_date"], d["runtime"], "min"); print("appended:", [k for k in ("credits","external_ids","release_dates","watch/providers") if k in d])'
```

`Fight Club 1999-10-15 139 min` and all four appended keys means the whole chain works, including the `append_to_response` nesting the mapper depends on.

The exports need no token at all, which is worth confirming separately because the entrants pass depends on it:

```bash
curl -sI "https://files.tmdb.org/p/exports/movie_ids_$(date -u +%m_%d_%Y).json.gz" | head -2
```

A `200` and a content-length of about 28 MB. Before 08:00 UTC the file for today may not exist yet; the command falls back to yesterday's and says which date it read.

## The three rules from the terms

These are design constraints, not later polish. Research 2.4 and 3.1 have the wording.

**Attribution.** The app must carry the TMDB logo, unmodified and neither recoloured nor stretched, and the sentence:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

It goes in a static place: Settings or About, beside the IGDB credit. Separately, every availability row must credit JustWatch ("Streaming data by JustWatch") and link to TMDB's watch page for the title, which the app builds from the stored id as `https://www.themoviedb.org/movie/{tmdb_id}/watch?locale={region}` (`/tv/` for a series). The mirror stores nothing for either: attribution is the app's job, and the mirror's job is to make sure the app has the id.

**The six-month cache ceiling.** The terms forbid caching anything from TMDB for longer than six months. The staleness pass is how the mirror meets it: every night it re-fetches the rows whose `refreshed_at` is older than `--stale-days`, oldest first, until its request budget runs out. The default is 150 days, which leaves a month of slack, so the job can fail for four straight weeks and every row is still refreshed inside the window. Nothing else in the design is allowed to make a row unreachable by that pass: a title TMDB 404s is stamped and skipped for 90 days rather than forever, and a title that falls below the popularity threshold keeps being refreshed because it is already in the catalog.

**Commercial use.** A free app with no ads, no subscription and no in-app purchase is inside the Developer tier. The moment Verso charges for anything it is not, and the fix is a written agreement from `sales@themoviedb.org` rather than a reinterpretation. Community posts quote 149 USD/month for a commercial key; research 2.4 could not confirm that from TMDB and several 2025 and 2026 forum threads asking exactly this got no staff reply, so get a quote before pricing anything. This step belongs next to the pricing decision in the roadmap, not after it.

## Sizing

The scope rule is a popularity threshold per medium, and the thresholds were measured rather than guessed. Both daily exports of **2026-09-16** were downloaded and counted: `movie_ids_09_16_2026.json.gz` (1,245,173 lines) and `tv_series_ids_09_16_2026.json.gz` (231,729 lines).

Two things the measurement settled that are worth writing down. Not one movie line in the whole export is flagged `adult`, so TMDB filters adult titles out of the public export itself and the discovery rule's adult clause only ever bites on an id already in the catalog. And no TV line carries an `adult` field at all, which is why a missing one counts as not adult rather than as unknown.

| popularity ≥ | films (not adult) | films also `video: false` | series |
|---:|---:|---:|---:|
| 1 | 395,735 | 383,819 | 130,726 |
| 2 | 79,861 | 78,556 | 74,343 |
| **3** | **25,492** | **25,156** | 46,603 |
| 5 | 7,810 | 7,754 | 23,764 |
| **8** | 3,004 | 2,987 | **12,424** |
| 10 | 1,963 | 1,956 | 9,028 |
| 15 | 898 | 894 | 4,966 |
| 20 | 498 | 497 | 3,284 |
| 30 | 230 | 229 | 1,752 |
| 50 | 86 | 85 | 742 |

**Chosen: 3 for films, 8 for series.** Those are the thresholds nearest the targets of roughly 40,000 films and 15,000 series, giving 25,156 films and 12,424 series, about 37,600 titles in all.

Neither target is reachable exactly with a round number, because the distribution is steep: the 40,000th film by popularity sits at 2.53 and the 15,000th series at 7.00. Missing low was the choice both times. A title under the line that somebody actually looks for still enters the mirror the moment a user touches it (ROADMAP V3), while the next threshold down would carry 78,556 films, most of a Supabase free tier spent on records nobody opens.

The two numbers are not comparable with each other, which is worth saying because 3 next to 8 looks arbitrary. TMDB holds a fifth as many series as films and its popularity figures for series run higher, so the same threshold on both would give the TV catalogue about three times its intended share. And neither is comparable with a figure quoted in an older writeup: TMDB rescaled `popularity` downwards in 2024.

The film threshold is applied over `video: false` rows only. A `video: true` record on the movie endpoint is a trailer, a concert film or a making-of rather than a film, and the column above is the one the constant was set from; it is about 340 records at a threshold of 3.

Both constants live in `packages/catalog/src/tmdb-map.ts` with this table's figures and the export date in their comments, so a future reader can tell whether they were measured or guessed. Re-measure after any threshold change, and re-run `pnpm catalog:tmdb-sync:full` afterwards, because the discovery set is what a full run walks.

### Row size

Measured by mapping the fixtures in `packages/catalog/test/fixtures`, which are full titles with every sub-resource the mirror reads, and summing the bytes of the rows they become for one region:

| | per title | of which the details row |
|---|---:|---:|
| a film, 10 cast, 5 release dates, 5 offers | 2,688 B | 1,530 B |
| a series, 4 seasons, 3 cast, 2 offers | 2,422 B | 1,051 B (seasons 669 B) |

Most of it is the `overview`, the `top_cast` jsonb and the `metadata` object; a second region adds only its own release dates, certification and offers, tens of bytes rather than hundreds.

At those sizes 25,156 films and 12,424 series is about **93 MB of rows**, before indexes. Call it 140 MB with them, against Supabase's free 500 MB, which already holds about 70,000 games. It fits, without much room to double the thresholds. The run's own summary prints `pg_database_size` at the end of every night, which is the number to watch rather than this estimate.

## The first run

In this order. Each step is cheap and tells you something before the next one costs anything.

1. **Smoke test the token, from GitHub.** Actions, TMDB sync, Run workflow, with `dry-run` ticked and `max-ids` set to `5`. It fetches the provider directories, the changes feed, the export and five titles, maps all of them, and writes nothing. What it proves is the secret, the `append_to_response` nesting and the mapping, in about a minute. `DATABASE_URL` is optional on a dry run, so this works even before the migration is on the hosted project.
2. **The full pull, from a laptop.** Not from Actions: it is roughly 37,600 requests at 20 a second, about half an hour of wall clock plus the writes, and a laptop is where you can watch it and stop it.

   ```bash
   set -a; source .env; set +a
   pnpm catalog:tmdb-sync:full
   ```

   It is resumable by design. A run that dies is resumed by running it again, because a full run is the discovery set minus whatever it has already refreshed and each batch commits on its own. There is no cursor to lose.
3. **Let the schedule take over.** The workflow runs daily at 14:00 UTC and its four passes keep the mirror current: the provider directories, the changes feed for the last 26 hours, today's new entrants, and the oldest rows until the budget runs out. Nothing else is needed.

Check afterwards that `media_items` holds roughly the row counts above for `medium = 'movie'` and `medium = 'tv'`, and that `watch_providers` has a few hundred rows. A film that ends up with no `watch_availability` rows at all is normal; a night where *every* title does would mean the `watch/providers` key has changed name, which is the one field in the mapping that was inferred rather than confirmed against a documented example.
