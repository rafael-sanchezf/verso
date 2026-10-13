-- The Letterboxd import: match the films of a user's export to the catalog,
-- mark them watched with their diary, and, only when the user asked for it and
-- confirmed the draft, place the rated ones in the movie ranking (ROADMAP.md
-- decision 35, 2026-10-12; first built 2026-10-01 on branch letterboxd-import,
-- rebuilt on main as VER-43).
--
-- Two functions and two tables.
--
--   match_letterboxd_films    a read: the films of one export, each resolved
--                             to a catalog row or to nothing, with how it was
--                             resolved, so the review screen can say which
--                             films it is sure of
--   apply_letterboxd_import   the write, one transaction: the entries marked
--                             played, one diary row per watched date, the
--                             whole movie ranking when the user chose to rank
--                             and confirmed, and a record of what the file said
--   letterboxd_imports        one row per upload: when, which files, the counts
--   letterboxd_import_films   one row per film in the upload: what the export
--                             said, what it matched, what became of it
--
-- ## Rule 35: watched is not ranked
--
-- The default import ranks nothing. Every matched film is marked watched and
-- its watched dates become diary rows; the unranked films are then what the
-- Ranking banner's drain (played_not_ranked) offers to rank. Placing films
-- from their star ratings is a choice the user makes on the review screen,
-- sees as a draft, can drag, and confirms; only then does p_tiers arrive.
-- A call with p_tiers null writes no ranking row, and a film marked 'ranked'
-- in such a call is refused, so the database cannot rank by accident either.
--
-- ## Watched dates are diary rows
--
-- diary.csv is a diary: one row each time a film was watched, with the day.
-- watch_log (20261008200000_watch_log.sql) is the same thing on Verso's side,
-- so each distinct watched date becomes one watch_log row, inserted as the
-- user. Its before-write trigger then does what it does for a watch logged in
-- the app: the entry becomes played, finished_at mirrors the latest watch, a
-- planned_on the watch is on or after is cleared. That is why the import does
-- not compute finished_at itself for a dated film, and why a film the user had
-- dropped becomes played when the file has a date for it, exactly as logging
-- that watch by hand would. A date the user's diary already holds for that
-- film is not written twice, so importing the same export again adds nothing.
-- place and note stay null: the export says neither where nor (outside
-- reviews.csv, which is not read for text) what stood out. A film with no
-- watched date (ratings.csv or watched.csv only) gets its entry marked played
-- with finished_at left as it was, and no diary row, because no day is known.
--
-- ## Why the ranking write is not a loop over insert_ranking_entry
--
-- The user confirms an order, not a sequence of insertions. Fifty films dropped
-- one at a time through insert_ranking_entry would shift every row below each
-- of them fifty times over, and an error on the thirtieth would leave
-- twenty-nine placed. One statement that renumbers the tier from the confirmed
-- array is cheaper and atomic. The deferred unique constraint on (user_id,
-- medium, tier, position) is what makes the single-statement renumbering
-- legal: positions may collide mid-statement and are only checked at commit.
--
-- ## placed_by, not a new column
--
-- A position the import writes from a star rating has no comparison behind it.
-- ranking_entries.placed_by (20261007120000_onboarding_backend.sql) already
-- says exactly that: 'prior' is a place no answer decided, the review shows it
-- with ≈, and a later insertion's pivot preference retires it through use. So
-- an imported row is placed_by 'prior', unless the user dragged it on the
-- review screen, which is the user deciding its place, and then it is 'user'
-- (p_moved), as move_ranking_entry does for a drag. Rows already ranked keep
-- their mark: the shifts the import causes are not placements. Where a 'prior'
-- row came from is in letterboxd_import_films.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user
--   22023  a bad argument: a malformed film, an incomplete or inconsistent
--          order, a 'ranked' film without an order, a film that is not a movie

-- ==============================================================================
-- 1. The import record
-- ==============================================================================

create table public.letterboxd_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  imported_at timestamptz not null default now(),
  file_names text[] not null default '{}',
  film_count integer not null default 0 check (film_count >= 0),
  ranked_count integer not null default 0 check (ranked_count >= 0),
  watched_count integer not null default 0 check (watched_count >= 0),
  unmatched_count integer not null default 0 check (unmatched_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  diary_count integer not null default 0 check (diary_count >= 0)
);

comment on table public.letterboxd_imports is
  'One row per Letterboxd upload a user confirmed: when, which files, how many films went each way, and how many diary rows it wrote. Owner-only. The per-film detail is letterboxd_import_films.';
comment on column public.letterboxd_imports.diary_count is
  'How many watch_log rows the upload wrote: one per watched date the user''s diary did not already hold.';

create index letterboxd_imports_user on public.letterboxd_imports (user_id, imported_at desc);

create table public.letterboxd_import_films (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.letterboxd_imports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  letterboxd_uri text,
  title text not null,
  year smallint,
  rating numeric(2, 1)
    check (rating is null or (rating between 0.5 and 5 and rating * 2 = floor(rating * 2))),
  watched_dates date[] not null default '{}',
  rewatches integer not null default 0 check (rewatches >= 0),
  media_item_id uuid references public.media_items (id) on delete set null,
  outcome text not null check (outcome in ('ranked', 'watched', 'unmatched', 'skipped')),
  tier public.tier,
  position integer check (position is null or position >= 0),
  -- A ranked film has a place; nothing else does.
  check ((outcome = 'ranked') = (tier is not null and position is not null)),
  -- Unmatched means exactly that. Ranked and watched need a catalog row when
  -- written; set null later only if the catalog row goes.
  check (outcome <> 'unmatched' or media_item_id is null)
);

comment on table public.letterboxd_import_films is
  'What one upload said about one film and what the import did with it. Keeps the export''s own facts (URI, title, year, rating, every watched date, rewatch count) and the catalog match, so a mismatch is visible and the import can be explained. Owner-only.';
comment on column public.letterboxd_import_films.outcome is
  'ranked: placed in the ranking at tier/position, because the user chose to rank from stars and confirmed. watched: marked played, not ranked (the default, or no rating). unmatched: no catalog row; nothing written. skipped: matched but already ranked by the user, whose placement wins, or a second file row for the same film.';
comment on column public.letterboxd_import_films.media_item_id is
  'The catalog row the title matched, null when none did. on delete set null rather than cascade: the record of the upload outlives a catalog row being re-mirrored.';

create index letterboxd_import_films_import on public.letterboxd_import_films (import_id);
create index letterboxd_import_films_user_item
  on public.letterboxd_import_films (user_id, media_item_id)
  where media_item_id is not null;

alter table public.letterboxd_imports enable row level security;
alter table public.letterboxd_import_films enable row level security;

-- The owner reads and deletes their records ("each import is opt-in,
-- explained, and deletable", ROADMAP.md Later and ideas) and writes them only
-- through apply_letterboxd_import, which is security invoker and so needs the
-- insert and update grants; no column is updatable but the counts.
create policy "users manage their own letterboxd imports" on public.letterboxd_imports
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage their own letterboxd import films" on public.letterboxd_import_films
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.letterboxd_imports from anon, authenticated;
revoke all on public.letterboxd_import_films from anon, authenticated;
grant select, insert, delete on public.letterboxd_imports to authenticated;
grant update (film_count, ranked_count, watched_count, unmatched_count, skipped_count, diary_count)
  on public.letterboxd_imports to authenticated;
grant select, insert, delete on public.letterboxd_import_films to authenticated;

-- ==============================================================================
-- 2. match_letterboxd_films
-- ==============================================================================
--
-- p_films is a JSON array of {"key": text, "title": text, "year": int|null,
-- "tmdb_id": int|null}. One row comes back per key, in the same order, with
-- the catalog columns null when nothing matched.
--
-- Three ways to match, tried in this order and named in `match`:
--
--   tmdb    movie_details.tmdb_id equals the file's tmdbID. Exact. Only files
--           in Letterboxd's import format carry one; the export does not.
--   title   the titles are the same once case and punctuation are folded, and
--           the year is within one. Letterboxd dates a film by its production
--           year and TMDB by its first release, and festival films differ by
--           one between the two.
--   fuzzy   pg_trgm similarity of at least 0.6 and the year within one. The
--           `%` operator engages the trigram index on media_items.title, so the
--           catalog is not scanned per film; the similarity() filter above the
--           default threshold runs on what the index returned.
--
-- Among several candidates: the exact title first, then the exact year, then
-- the closer title, then the better-known film (TMDB's vote_count, which the
-- mirror writes into metadata). Only films: a game or a series with the same
-- title is never a match.

create function public.match_letterboxd_films(p_films jsonb)
returns table (
  key text,
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  genres text[],
  match text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with films as (
    select
      f.ord,
      f.key,
      f.title,
      f.year,
      f.tmdb_id,
      lower(regexp_replace(f.title, '[^[:alnum:]]+', ' ', 'g')) as folded
    from jsonb_array_elements(coalesce(p_films, '[]'::jsonb)) with ordinality as e(film, ord)
    cross join lateral (
      select
        e.ord,
        e.film ->> 'key' as key,
        e.film ->> 'title' as title,
        nullif(e.film ->> 'year', '')::integer as year,
        nullif(e.film ->> 'tmdb_id', '')::integer as tmdb_id
    ) as f
    where f.key is not null and f.title is not null
  ),
  by_tmdb as (
    select f.key, d.media_item_id, 'tmdb'::text as match
    from films f
    join public.movie_details d on d.tmdb_id = f.tmdb_id
    where f.tmdb_id is not null
  ),
  by_title as (
    select distinct on (f.key)
      f.key,
      m.id as media_item_id,
      case
        when lower(regexp_replace(m.title, '[^[:alnum:]]+', ' ', 'g')) = f.folded then 'title'
        else 'fuzzy'
      end as match
    from films f
    join public.media_items m
      on m.medium = 'movie'
     and (f.year is null or m.year is null or m.year between f.year - 1 and f.year + 1)
     and (
       lower(regexp_replace(m.title, '[^[:alnum:]]+', ' ', 'g')) = f.folded
       or (m.title % f.title and similarity(m.title, f.title) >= 0.6)
     )
    where not exists (select 1 from by_tmdb t where t.key = f.key)
    order by
      f.key,
      (lower(regexp_replace(m.title, '[^[:alnum:]]+', ' ', 'g')) = f.folded) desc,
      (m.year = f.year) desc nulls last,
      similarity(m.title, f.title) desc,
      (m.metadata ->> 'vote_count')::numeric desc nulls last,
      m.id
  ),
  best as (
    select * from by_tmdb
    union all
    select * from by_title
  )
  select
    f.key,
    m.id,
    m.title,
    m.year,
    m.cover_image_id,
    m.external_ids,
    coalesce(d.genres, '{}'::text[]),
    b.match
  from films f
  left join best b on b.key = f.key
  left join public.media_items m on m.id = b.media_item_id
  left join public.movie_details d on d.media_item_id = m.id
  order by f.ord;
$$;

comment on function public.match_letterboxd_films(jsonb) is
  'Resolve the films of a Letterboxd export to catalog rows: by TMDB id when the file has one, else by folded title and a year within one, else by trigram similarity. One row per input key, catalog columns null when nothing matched, `match` saying which rule hit.';

revoke all on function public.match_letterboxd_films(jsonb) from public, anon;
grant execute on function public.match_letterboxd_films(jsonb) to authenticated, service_role;

-- ==============================================================================
-- 3. apply_letterboxd_import
-- ==============================================================================
--
-- The one write of the import. Four arguments:
--
--   p_file_names  the uploaded files, for the record
--   p_films       every film in the upload, as a JSON array of
--                   {"letterboxd_uri", "title", "year", "rating",
--                    "watched_dates": ["YYYY-MM-DD", ...], "rewatches",
--                    "media_item_id", "outcome"}
--                 outcome is one of ranked, watched, unmatched, skipped
--   p_tiers       null for the default import, which ranks nothing. When the
--                 user chose to rank from stars and confirmed the draft: the
--                 caller's whole movie ranking as confirmed, as
--                   {"loved": [uuid, ...], "liked": [...], "fine": [...], "disliked": [...]}
--                 best first in each, existing films and imported ones together
--   p_moved       the imported films the user dragged on the review screen;
--                 they are placed_by 'user', every other imported row 'prior'
--
-- It checks, before writing anything:
--   * every film has a title and an outcome, and every ranked or watched film
--     resolves to a catalog row that is a movie
--   * without p_tiers, no film is 'ranked' and p_moved is empty
--   * with p_tiers: every film the caller already has ranked is in it exactly
--     once, so a confirmed order cannot silently drop a placement; every id in
--     it is either already ranked or a film with outcome 'ranked'; every
--     'ranked' film is in it; no 'ranked' film is one the caller already
--     ranked; every id in p_moved is a 'ranked' film
-- and then, in one transaction:
--   * marks each ranked or watched film played; finished_at is left as it was
--   * writes one watch_log row per watched date the caller's diary does not
--     already hold for that film; the diary's trigger moves status and
--     finished_at as it does for a watch logged in the app
--   * with p_tiers, renumbers the four movie tiers from it: existing rows move
--     (updated_at, never placed_at or placed_by), new rows are inserted with
--     placed_by 'prior' or, when dragged, 'user'
--   * records the upload and every film in it

create function public.apply_letterboxd_import(
  p_file_names text[],
  p_films jsonb,
  p_tiers jsonb default null,
  p_moved uuid[] default '{}'
)
returns table (
  import_id uuid,
  ranked integer,
  watched integer,
  unmatched integer,
  skipped integer,
  diary integer
)
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_import_id uuid;
  v_films jsonb := coalesce(p_films, '[]'::jsonb);
  v_rank boolean := p_tiers is not null and jsonb_typeof(p_tiers) <> 'null';
  v_moved uuid[] := coalesce(p_moved, '{}'::uuid[]);
  v_bad text;
  v_count integer;
  v_ranked integer;
  v_watched integer;
  v_unmatched integer;
  v_skipped integer;
  v_diary integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'apply_letterboxd_import requires an authenticated user';
  end if;

  if jsonb_typeof(v_films) <> 'array' then
    raise exception using errcode = '22023', message = 'p_films must be a JSON array of film objects';
  end if;

  if v_rank then
    if jsonb_typeof(p_tiers) <> 'object' then
      raise exception using errcode = '22023', message = 'p_tiers must be null or a JSON object of tier name to id array';
    end if;

    select string_agg(k, ', ') into v_bad
    from jsonb_object_keys(p_tiers) k
    where k not in ('loved', 'liked', 'fine', 'disliked');
    if v_bad is not null then
      raise exception using errcode = '22023', message = format('p_tiers has unknown tiers: %s', v_bad);
    end if;
  end if;

  -- The confirmed order, flattened, and the films, parsed, in two temp tables
  -- the statements below read. Created once per transaction and emptied on
  -- entry, so a second call in the same transaction (the test suite's case)
  -- neither trips over the first call's tables nor reads its rows.
  if to_regclass('pg_temp.lb_placed') is null then
    create temp table lb_placed (
      tier public.tier,
      media_item_id uuid,
      position integer
    ) on commit drop;
  end if;
  if to_regclass('pg_temp.lb_film') is null then
    create temp table lb_film (
      ord integer,
      letterboxd_uri text,
      title text,
      year smallint,
      rating numeric(2, 1),
      watched_dates date[],
      rewatches integer,
      media_item_id uuid,
      outcome text
    ) on commit drop;
  end if;
  -- truncate rather than delete: PostgREST runs the authenticated role with
  -- pg-safeupdate, which refuses a DELETE with no WHERE clause.
  truncate lb_placed, lb_film;

  if v_rank then
    insert into lb_placed (tier, media_item_id, position)
    select t.tier, e.id::uuid, (e.ord - 1)::integer
    from unnest(array['loved', 'liked', 'fine', 'disliked']::public.tier[]) as t(tier)
    cross join lateral jsonb_array_elements_text(coalesce(p_tiers -> t.tier::text, '[]'::jsonb))
      with ordinality as e(id, ord);
  end if;

  insert into lb_film (ord, letterboxd_uri, title, year, rating, watched_dates, rewatches, media_item_id, outcome)
  select
    e.ord,
    nullif(e.film ->> 'letterboxd_uri', ''),
    e.film ->> 'title',
    nullif(e.film ->> 'year', '')::smallint,
    nullif(e.film ->> 'rating', '')::numeric(2, 1),
    coalesce(
      (select array_agg(distinct d::date order by d::date)
         from jsonb_array_elements_text(coalesce(e.film -> 'watched_dates', '[]'::jsonb)) as d),
      '{}'::date[]
    ),
    coalesce(nullif(e.film ->> 'rewatches', '')::integer, 0),
    nullif(e.film ->> 'media_item_id', '')::uuid,
    e.film ->> 'outcome'
  from jsonb_array_elements(v_films) with ordinality as e(film, ord);

  -- Shape checks on the films.
  if exists (select 1 from lb_film f where f.title is null or f.title = '') then
    raise exception using errcode = '22023', message = 'every film needs a title';
  end if;
  if exists (select 1 from lb_film f where f.outcome is null or f.outcome not in ('ranked', 'watched', 'unmatched', 'skipped')) then
    raise exception using errcode = '22023', message = 'every film needs an outcome of ranked, watched, unmatched or skipped';
  end if;
  if exists (select 1 from lb_film f where f.outcome in ('ranked', 'watched') and f.media_item_id is null) then
    raise exception using errcode = '22023', message = 'a ranked or watched film needs a media_item_id';
  end if;
  if exists (
    select 1 from lb_film f
    left join public.media_items m on m.id = f.media_item_id
    where f.media_item_id is not null and (m.id is null or m.medium <> 'movie')
  ) then
    raise exception using errcode = '22023', message = 'every matched film must be a movie in the catalog';
  end if;

  if not v_rank then
    -- Rule 35: without a confirmed order nothing is ranked.
    if exists (select 1 from lb_film f where f.outcome = 'ranked') then
      raise exception using errcode = '22023', message = 'a film marked ranked needs the confirmed order in p_tiers';
    end if;
    if cardinality(v_moved) > 0 then
      raise exception using errcode = '22023', message = 'p_moved needs the confirmed order in p_tiers';
    end if;
  else
    -- The confirmed order must be complete and consistent.
    select count(*) into v_count
    from (select media_item_id from lb_placed group by media_item_id having count(*) > 1) d;
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('%s films appear more than once in the confirmed order', v_count);
    end if;

    select count(*) into v_count
    from public.ranking_entries r
    where r.user_id = v_uid and r.medium = 'movie'
      and not exists (select 1 from lb_placed p where p.media_item_id = r.media_item_id);
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('the confirmed order leaves out %s films already ranked', v_count);
    end if;

    select count(*) into v_count
    from lb_placed p
    where not exists (select 1 from public.ranking_entries r where r.user_id = v_uid and r.media_item_id = p.media_item_id)
      and not exists (select 1 from lb_film f where f.outcome = 'ranked' and f.media_item_id = p.media_item_id);
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('%s films in the confirmed order are neither ranked nor in the import', v_count);
    end if;

    select count(*) into v_count
    from lb_film f
    where f.outcome = 'ranked'
      and not exists (select 1 from lb_placed p where p.media_item_id = f.media_item_id);
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('%s films marked ranked are missing from the confirmed order', v_count);
    end if;

    if exists (
      select 1 from lb_film f
      join public.ranking_entries r on r.user_id = v_uid and r.media_item_id = f.media_item_id
      where f.outcome = 'ranked'
    ) then
      raise exception using errcode = '22023', message = 'a film the caller already ranked cannot be imported as ranked; its place stays';
    end if;

    if exists (
      select 1 from unnest(v_moved) as m(id)
      where not exists (select 1 from lb_film f where f.outcome = 'ranked' and f.media_item_id = m.id)
    ) then
      raise exception using errcode = '22023', message = 'p_moved may only name films imported as ranked';
    end if;
  end if;

  -- Writes --------------------------------------------------------------------------

  insert into public.letterboxd_imports (user_id, file_names)
  values (v_uid, coalesce(p_file_names, '{}'::text[]))
  returning id into v_import_id;

  -- Entries: played. finished_at is the diary's to set below; an entry with no
  -- dated watch keeps whatever it had. The BEFORE triggers derive the medium
  -- and clear the backlog position as they do for any status change.
  insert into public.user_entries (user_id, media_item_id, status)
  select distinct on (f.media_item_id)
    v_uid,
    f.media_item_id,
    'played'::public.entry_status
  from lb_film f
  where f.outcome in ('ranked', 'watched')
  order by f.media_item_id, f.ord
  on conflict (user_id, media_item_id) do update
  set status = 'played'::public.entry_status;

  -- The diary: one row per watched date not already in it. user_id comes from
  -- the column default (auth.uid()); watch_log_before_write moves finished_at
  -- to the latest watch and clears a planned_on the watch reaches.
  insert into public.watch_log (media_item_id, watched_on)
  select distinct f.media_item_id, d.day
  from lb_film f
  cross join lateral unnest(f.watched_dates) as d(day)
  where f.outcome in ('ranked', 'watched')
    and not exists (
      select 1 from public.watch_log w
      where w.user_id = v_uid
        and w.media_item_id = f.media_item_id
        and w.watched_on = d.day
    )
  order by f.media_item_id, d.day;
  get diagnostics v_diary = row_count;

  if v_rank then
    -- Existing placements move to where the confirmed order puts them. A move
    -- the user did not make, so updated_at only: never placed_at or placed_by.
    update public.ranking_entries r
    set tier = p.tier,
        position = p.position,
        updated_at = now()
    from lb_placed p
    where r.user_id = v_uid
      and r.media_item_id = p.media_item_id
      and (r.tier <> p.tier or r.position <> p.position);

    -- New placements, from the import: the stars' guess unless dragged.
    insert into public.ranking_entries (user_id, medium, tier, media_item_id, position, placed_at, placed_by)
    select
      v_uid,
      'movie'::public.medium,
      p.tier,
      p.media_item_id,
      p.position,
      now(),
      case when p.media_item_id = any (v_moved) then 'user' else 'prior' end
    from lb_placed p
    where not exists (
      select 1 from public.ranking_entries r where r.user_id = v_uid and r.media_item_id = p.media_item_id
    );
  end if;

  -- The record.
  insert into public.letterboxd_import_films (
    import_id, user_id, letterboxd_uri, title, year, rating, watched_dates, rewatches,
    media_item_id, outcome, tier, position
  )
  select
    v_import_id, v_uid, f.letterboxd_uri, f.title, f.year, f.rating, f.watched_dates, f.rewatches,
    case when f.outcome = 'unmatched' then null else f.media_item_id end,
    f.outcome,
    case when f.outcome = 'ranked' then p.tier end,
    case when f.outcome = 'ranked' then p.position end
  from lb_film f
  left join lb_placed p on p.media_item_id = f.media_item_id and f.outcome = 'ranked'
  order by f.ord;

  select
    count(*) filter (where f.outcome = 'ranked'),
    count(*) filter (where f.outcome = 'watched'),
    count(*) filter (where f.outcome = 'unmatched'),
    count(*) filter (where f.outcome = 'skipped')
  into v_ranked, v_watched, v_unmatched, v_skipped
  from lb_film f;

  update public.letterboxd_imports i
  set film_count = v_ranked + v_watched + v_unmatched + v_skipped,
      ranked_count = v_ranked,
      watched_count = v_watched,
      unmatched_count = v_unmatched,
      skipped_count = v_skipped,
      diary_count = v_diary
  where i.id = v_import_id;

  truncate lb_placed, lb_film;

  return query select v_import_id, v_ranked, v_watched, v_unmatched, v_skipped, v_diary;
end;
$$;

comment on function public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[]) is
  'Write one confirmed Letterboxd import as a single transaction: mark the films played, write one diary row per watched date the diary lacks, and only when p_tiers is given (the user chose to rank from stars and confirmed) renumber the caller''s movie tiers from it, imported rows placed_by prior unless dragged (p_moved, user). Records the upload. Refuses a ranked film without an order, and an order that drops a ranked film, includes an unknown one, or re-ranks a film the caller already placed.';

revoke all on function public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[]) to authenticated, service_role;
