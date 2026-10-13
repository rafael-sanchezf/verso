-- The movie screens' reads: the movie page, search by person, Home's rows by
-- reason, the diary's source, and the deck for films.
-- docs/private/design/movies-build.md, PR 1; docs/design/movies-brief.md (the
-- third pass, the row catalog under the second pass, the Search and Movie page
-- sections); docs/design/profile-brief.md ("Rafa's letters, 2026-10-12, round
-- two") for the diary's source.
--
-- What it adds, in file order:
--
--   1. watch_log.source ('log', 'bulk', 'import') and an undated row: the
--      bulk deck's "Seen before Verso" and a Letterboxd row without a date
--      are diary rows with no day, and the line on Profile reads "Watched X"
--      only for a row the person dated through the log sheet.
--   2. movie_details.people_text and its trigram index, and search_games
--      with a person tier and a person_match column: "denis villeneuve"
--      finds Dune and says why.
--   3. movie_page(id, region, today): the movie page's catalog half in one
--      call, availability with the caller's services marked.
--   4. movie_home_rows(region, today): Home's rows by reason (decision 28),
--      the watchlist, up to three genres, up to three "Because you loved",
--      or one popular row so Home is never empty.
--   5. deck_candidates gains p_medium: the film deck of the movies onboarding.
--   6. apply_letterboxd_import (#99) writes its diary rows as 'import', and
--      the rows it already wrote are marked so.
--   7. tier_list reads a film's genres, which it never did.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user
--   22023  a negative offset

-- ==============================================================================
-- 1. watch_log.source and the undated row
-- ==============================================================================
--
-- Rafa's rule on the verb (profile-brief, round two): a film entered through
-- the log sheet, where the person set the day, reads "Watched X" with that
-- day; one entered through bulk entry or an import without a date reads
-- "Ranked X · score", because nothing says when it was watched and the
-- ranking never implies a date (rule 35). The signal is the row's source, not
-- the days since sign-up.
--
--   log     the log sheet: always dated, the person picked the day.
--   bulk    the bulk deck's seen check, "Seen before Verso": no day.
--   import  a Letterboxd row (PR #99): dated when the export carries a date.
--
-- watched_on becomes nullable, and a check keeps it set on every 'log' row,
-- so the log sheet can never write an undated watch. source is in the insert
-- grant and not the update grant, and the before-write trigger refuses a
-- change of it from anyone, the service role included: a row keeps how it
-- was written. A film has at most one bulk row (watch_log_one_bulk_row), so
-- ticking "Seen" twice is one fact, not two.
--
-- The two triggers are restated whole, the bodies 20261008201000_planned_on.sql
-- left (the planned_on clearing included). What changes:
--
--   * On insert, finished_at mirrors the latest *dated* watch. greatest() and
--     max() skip nulls, so a dated row beside undated ones mirrors as before;
--     an undated row on a film with no dated row leaves finished_at as it was
--     (a bulk row on a film the person already finished keeps that day).
--   * On delete or a change of day, only a dated row moves the mirror: a dated
--     row deleted or re-dated, or an undated row given a day. With a dated row
--     left, finished_at is the latest of them; with none left, finished_at is
--     cleared only when it was the deleted row's day, so a day that came from
--     somewhere else survives. Deleting an undated row never touches it.
--   * An undated row clears no planned day, since nothing says it was watched
--     on or after it.
--   * The source is locked on update.

alter table public.watch_log
  add column source text not null default 'log'
    constraint watch_log_source_check check (source in ('log', 'bulk', 'import')),
  alter column watched_on drop not null,
  add constraint watch_log_dated_log_check check (watched_on is not null or source <> 'log');

comment on column public.watch_log.source is
  'How the row was written: log (the log sheet, always dated), bulk (the bulk deck''s "Seen before Verso", no date) or import (a Letterboxd row, dated when the export has one). Profile reads "Watched X" for a dated log row and "Ranked X" otherwise. Insert-only.';
comment on column public.watch_log.watched_on is
  'The day it was watched, where the user is (the app sends its local date). Null only on a bulk or import row that has no day; a log row always has one. The diary''s order (undated last) and the finished_at mirror read it.';

grant insert (source) on public.watch_log to authenticated;

create unique index watch_log_one_bulk_row
  on public.watch_log (user_id, media_item_id)
  where source = 'bulk';

-- The rows the Letterboxd import (20261012130000_letterboxd_import.sql, PR
-- #99) already wrote took the default and read as 'log'. They are the
-- import's: it writes its record and its diary rows in one transaction, so a
-- row whose created_at is its import's imported_at, for a film and a date the
-- import's own record lists, is the import's. Marked here, before the trigger
-- below locks the source; section 6 makes the import write 'import' itself.

update public.watch_log w
set source = 'import'
from public.letterboxd_imports i
where i.user_id = w.user_id
  and w.created_at = i.imported_at
  and w.source = 'log'
  and exists (
    select 1
    from public.letterboxd_import_films f
    where f.import_id = i.id
      and f.media_item_id = w.media_item_id
      and w.watched_on = any (f.watched_dates)
  );

create or replace function public.watch_log_before_write()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_medium public.medium;
  v_latest date;
begin
  new.place := nullif(btrim(new.place), '');
  new.note := nullif(btrim(new.note), '');

  if tg_op <> 'INSERT' then
    if new.source is distinct from old.source then
      raise exception using
        errcode = '42501',
        message = 'a diary row keeps the source it was written with';
    end if;
    return new;
  end if;

  if v_uid is not null and new.user_id is distinct from v_uid then
    raise exception using
      errcode = '42501',
      message = 'a diary row belongs to the user who writes it';
  end if;

  select m.medium into v_medium
  from public.media_items m
  where m.id = new.media_item_id;

  if v_medium is null then
    raise exception using
      errcode = '23503',
      message = format('media item %s is not in the catalog', new.media_item_id);
  end if;

  if v_medium <> 'movie' then
    raise exception using
      errcode = '22023',
      message = format('the diary is for films; media item %s is a %s', new.media_item_id, v_medium);
  end if;

  -- The latest dated watch including this row; null when none is dated, and
  -- then the entry's finished_at is left as it was.
  select greatest(new.watched_on, max(w.watched_on)) into v_latest
  from public.watch_log w
  where w.user_id = new.user_id
    and w.media_item_id = new.media_item_id;

  insert into public.user_entries as e (user_id, media_item_id, status, finished_at)
  values (new.user_id, new.media_item_id, 'played', v_latest)
  on conflict (user_id, media_item_id) do update
  set status = 'played',
      finished_at = coalesce(excluded.finished_at, e.finished_at),
      -- an undated row clears no plan: null <= anything is not true
      planned_on = case
        when e.planned_on <= new.watched_on then null
        else e.planned_on
      end;

  return new;
end;
$$;

comment on function public.watch_log_before_write() is
  'Trim a diary row''s place and note; refuse a change of source; on insert, refuse another user''s row and anything but a film, and upsert the writer''s entry as played with finished_at at the latest dated watched_on (left alone when no row is dated), clearing a planned day the watch is on or after.';

create or replace function public.watch_log_after_change()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_pair record;
  v_latest date;
begin
  -- Only a dated row moves the mirror: one deleted or re-dated, or an undated
  -- row given a day. Deleting or editing an undated row leaves it alone.
  if old.watched_on is not null or (tg_op = 'UPDATE' and new.watched_on is not null) then
    for v_pair in
      select old.user_id as user_id, old.media_item_id as media_item_id
      union
      select new.user_id, new.media_item_id where tg_op = 'UPDATE'
    loop
      select max(w.watched_on) into v_latest
      from public.watch_log w
      where w.user_id = v_pair.user_id
        and w.media_item_id = v_pair.media_item_id;

      if v_latest is not null then
        update public.user_entries e
        set finished_at = v_latest
        where e.user_id = v_pair.user_id
          and e.media_item_id = v_pair.media_item_id
          and e.finished_at is distinct from v_latest;
      elsif old.watched_on is not null then
        -- no dated row left: clear the day only if it was the one removed
        update public.user_entries e
        set finished_at = null
        where e.user_id = v_pair.user_id
          and e.media_item_id = v_pair.media_item_id
          and e.finished_at = old.watched_on;
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    update public.user_entries e
    set planned_on = null
    where e.user_id = new.user_id
      and e.media_item_id = new.media_item_id
      and e.planned_on <= new.watched_on;
  end if;

  return null;
end;
$$;

comment on function public.watch_log_after_change() is
  'Put user_entries.finished_at back in step with the diary after a dated row is deleted or re-dated, or an undated row is given a day: the latest dated watched_on left, or, with none left, null when finished_at was the removed row''s day. Deleting an undated row changes nothing. Clears a planned day an edited row now falls on or after. Never changes status.';

-- ==============================================================================
-- 2. Search by person
-- ==============================================================================
--
-- The brief's rule (third pass, point 2, and Rafa's letters): a Search row's
-- second line is "year · genre", and "year · Denis Villeneuve" when the query
-- is a person. Directors first, then the ten top-billed actors, then the
-- writers ("directors and actors at the beta, writers behind them").
--
-- 2a. people_text ----------------------------------------------------------------
-- Every name on the film in one string, directors then cast in billing order
-- then writers, joined by "; ". Stored and generated, so the mirror writes the
-- three columns it always wrote and the index stays in step by itself. A
-- generated column takes only immutable expressions; array_to_string and the
-- jsonb walk are not marked immutable for every type they accept, so the
-- expression is a function that is, over exactly these three inputs.

create function public.movie_people_text(
  p_directors text[],
  p_writers text[],
  p_top_cast jsonb
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select nullif(pg_catalog.string_agg(n.name, '; ' order by n.kind, n.ord), '')
  from (
    select d.name, 1 as kind, d.ord
      from pg_catalog.unnest(p_directors) with ordinality as d(name, ord)
    union all
    select c.value ->> 'name', 2, c.ord
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(p_top_cast) = 'array' then p_top_cast else '[]'::jsonb end
      ) with ordinality as c(value, ord)
    union all
    select w.name, 3, w.ord
      from pg_catalog.unnest(p_writers) with ordinality as w(name, ord)
  ) n
  where pg_catalog.btrim(coalesce(n.name, '')) <> ''
$$;

comment on function public.movie_people_text(text[], text[], jsonb) is
  'Every name on a film in one string for search: directors, then the top cast in billing order, then writers, joined by "; ". Null when there are none. The expression behind movie_details.people_text.';

-- Pure and harmless, but nobody signed out needs it, the rule every function
-- here follows.
revoke all on function public.movie_people_text(text[], text[], jsonb) from public, anon;
grant execute on function public.movie_people_text(text[], text[], jsonb) to authenticated, service_role;

alter table public.movie_details
  add column people_text text
    generated always as (public.movie_people_text(directors, writers, top_cast)) stored;

comment on column public.movie_details.people_text is
  'Directors, top cast and writers joined by "; ", generated from the three columns. What search_games matches a person against, through movie_details_people_trgm.';

create index movie_details_people_trgm
  on public.movie_details using gin (people_text extensions.gin_trgm_ops);

-- "Because you loved" reads a loved film's directors' other films (section 4);
-- the same containment test the genres index answers, on the directors.
create index movie_details_directors on public.movie_details using gin (directors);

-- 2b. search_games with a person tier --------------------------------------------
-- The body of 20260923110000_search_aliases.sql, section 5, with a person arm
-- for films. Everything said there about the title and alias arms, the tiers,
-- the cost, enable_seqscan and the format() planning still holds; what is new:
--
--   * **person_hits**, films only (a constant false for any other medium, so
--     the planner drops it): people_text starts with the term, a word in it
--     does, or the term is word-similar to a run of it. Three characters of key
--     at least for the prefixes and four for the similarity, because "% a%"
--     is every film with a cast.
--   * **person_best** walks the matched film's names in the brief's order
--     (directors, then cast by billing, then writers) and keeps the first that
--     matches by itself, so a similarity that only spans two names ("Villeneuve;
--     Jon") matches no one and drops the film.
--   * A person match has a tier like a title match: 2 when the name or a word
--     in it starts with the term, 1 when it is only similar; its closeness is
--     the name's. A film reached both ways takes the better of the two, and
--     the title wins a tie, which is the brief's "title matches rank above
--     person matches at equal closeness". person_match carries the name only
--     when the person is the reason the row is there.
--
-- The return table gains person_match text at the end; the games path and a
-- film found by its title return null. Drop and create, as every change of
-- the return table has been; the grants, the comment and both set clauses
-- are written again below.

drop function if exists public.search_games(text, integer, public.medium);

create function public.search_games(
  p_query text,
  p_limit integer default 20,
  p_medium public.medium default 'game'
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  igdb_id integer,
  developer text,
  genres text[],
  platforms text[],
  score real,
  person_match text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
set enable_seqscan = off
as $$
declare
  v_term text := pg_catalog.left(nullif(btrim(p_query), ''), 100);
  v_key text;
  v_escaped text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_medium public.medium := coalesce(p_medium, 'game');
begin
  if v_term is null then
    return;
  end if;

  -- A term that is nothing but punctuation has no key and nothing to match.
  v_key := public.search_key(v_term);
  if v_key = '' then
    return;
  end if;

  -- The term is user input, so neutralise LIKE metacharacters before it is
  -- used in a pattern. The key needs no escaping: search_key strips % and _.
  v_escaped := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');

  return query execute format($sql$
    -- One arm per condition, on purpose; see "Cost" in 20260923110000.
    with alias_hits as (
      select a.media_item_id, a.source, a.alias, a.alias_key
        from public.media_aliases a
       where a.alias_key like %5$L
      union
      select a.media_item_id, a.source, a.alias, a.alias_key
        from public.media_aliases a
       where a.alias operator(extensions.%%) %1$L
      union
      select a.media_item_id, a.source, a.alias, a.alias_key
        from public.media_aliases a
       where %9$L::boolean and %1$L operator(extensions.<%%) a.alias
    ),
    alias_best as (
      select
        h.media_item_id,
        bool_or(h.source = 'igdb' and h.alias_key = %6$L) as igdb_exact,
        bool_or(h.alias_key like %5$L) as prefix,
        max(greatest(
          extensions.word_similarity(%1$L, h.alias),
          extensions.similarity(h.alias, %1$L)
        )) as closeness
      from alias_hits h
      group by h.media_item_id
    ),
    title_hits as (
      select m.id from public.media_items m
       where m.medium = %4$L and m.title operator(extensions.%%) %1$L
      union
      select m.id from public.media_items m
       where %8$L::boolean and m.medium = %4$L and %1$L operator(extensions.<%%) m.title
      union
      select m.id from public.media_items m
       where m.medium = %4$L and m.title ilike %2$L
      union
      select m.id from public.media_items m
       where %10$L::boolean and m.medium = %4$L and m.title ilike %3$L
    ),
    text_hits as (
      select t.id from title_hits t
      union
      select b.media_item_id from alias_best b
    ),
    person_hits as (
      select md.media_item_id from public.movie_details md
       where %11$L::boolean and md.people_text ilike %2$L
      union
      select md.media_item_id from public.movie_details md
       where %11$L::boolean and md.people_text ilike %3$L
      union
      select md.media_item_id from public.movie_details md
       where %12$L::boolean and %1$L operator(extensions.<%%) md.people_text
    ),
    person_best as (
      select ph.media_item_id, pm.name, pm.prefix, pm.closeness
      from person_hits ph
      join public.movie_details md on md.media_item_id = ph.media_item_id
      cross join lateral (
        select
          n.name,
          (n.name ilike %2$L or n.name ilike %3$L) as prefix,
          greatest(
            extensions.word_similarity(%1$L, n.name),
            extensions.similarity(n.name, %1$L)
          ) as closeness
        from (
          select d.name, 1 as kind, d.ord
            from unnest(md.directors) with ordinality as d(name, ord)
          union all
          select c.value ->> 'name', 2, c.ord
            from jsonb_array_elements(
              case when jsonb_typeof(md.top_cast) = 'array' then md.top_cast else '[]'::jsonb end
            ) with ordinality as c(value, ord)
          union all
          select w.name, 3, w.ord
            from unnest(md.writers) with ordinality as w(name, ord)
        ) n
        where n.name ilike %2$L
           or n.name ilike %3$L
           or %1$L operator(extensions.<%%) n.name
        order by n.kind, n.ord
        limit 1
      ) pm
    ),
    hits as (
      select t.id from text_hits t
      union
      select p.media_item_id from person_best p
    ),
    scored as (
      select
        m.id,
        m.title,
        m.year,
        m.cover_image_id,
        m.external_ids,
        coalesce(
          nullif(m.metadata ->> 'total_rating_count', '')::numeric,
          nullif(m.metadata ->> 'vote_count', '')::numeric
        ) as popularity,
        case
          when th.id is null then 0
          when public.search_key(m.title) = %6$L then 4
          when coalesce(b.igdb_exact, false) then 3
          when m.title ilike %2$L or m.title ilike %3$L or coalesce(b.prefix, false) then 2
          else 1
        end as text_tier,
        case
          when th.id is null then 0
          else greatest(
            extensions.word_similarity(%1$L, m.title),
            extensions.similarity(m.title, %1$L),
            coalesce(b.closeness, 0)
          )
        end as text_closeness,
        case
          when pb.media_item_id is null then 0
          when pb.prefix then 2
          else 1
        end as person_tier,
        coalesce(pb.closeness, 0) as person_closeness,
        pb.name as person_name
      from hits h
      join public.media_items m on m.id = h.id
      left join text_hits th on th.id = h.id
      left join alias_best b on b.media_item_id = m.id
      left join person_best pb on pb.media_item_id = m.id
      where m.medium = %4$L
    ),
    decided as (
      select
        s.*,
        (s.person_tier > s.text_tier
          or (s.person_tier = s.text_tier and s.person_closeness > s.text_closeness)) as by_person
      from scored s
    ),
    ranked as (
      select
        d.*,
        case when d.by_person then d.person_tier else d.text_tier end as tier,
        case when d.by_person then d.person_closeness else d.text_closeness end as closeness
      from decided d
    )
    select
      r.id,
      r.title,
      r.year,
      r.cover_image_id,
      r.external_ids,
      g.igdb_id,
      g.developer,
      coalesce(g.genres, md.genres, td.genres, '{}'::text[]),
      coalesce(g.platforms, '{}'::text[]),
      (r.tier + r.closeness)::real,
      case when r.by_person then r.person_name end
    from ranked r
    left join public.game_details g on g.media_item_id = r.id
    left join public.movie_details md on md.media_item_id = r.id
    left join public.tv_details td on td.media_item_id = r.id
    order by r.tier desc, r.closeness desc, r.by_person asc, r.popularity desc nulls last, r.title asc, r.id asc
    limit %7$s
  $sql$,
    v_term,                                     -- 1 the term as typed
    v_escaped || '%',                           -- 2 starts with it
    '% ' || v_escaped || '%',                   -- 3 a word starts with it
    v_medium,                                   -- 4
    v_key || '%',                               -- 5 an alias key starts with the term's key
    v_key,                                      -- 6 the term's key, for exact matches
    v_limit,                                    -- 7
    length(v_key) >= 4,                         -- 8 word similarity on titles
    length(v_key) >= 3,                         -- 9 word similarity on aliases
    length(v_key) >= 2,                         -- 10 a word prefix mid-title
    v_medium = 'movie' and length(v_key) >= 3,  -- 11 a person's name or a word in it starts with the term
    v_medium = 'movie' and length(v_key) >= 4   -- 12 a person's name is word-similar
  );
end;
$$;

comment on function public.search_games(text, integer, public.medium) is
  'Search one medium''s catalog by title, alias and, for films, person: exact title, then an exact IGDB alternative name (gtav), then a title word, an alias or a director, actor or writer whose name starts with the term (zelda, gta, villeneuve), then similarity; closeness, then title before person, then popularity break ties. person_match names the director, actor or writer when the person is why the film matched, else null. Defaults to games; genres come from whichever extension table holds the row; external_ids is returned as media_items stores it, for the Steam cover fallback.';

revoke all on function public.search_games(text, integer, public.medium) from public, anon;
grant execute on function public.search_games(text, integer, public.medium) to authenticated, service_role;

-- ==============================================================================
-- 3. movie_page
-- ==============================================================================
--
-- The movie page's catalog half in one round trip (movies-brief, "Movie page"
-- and the third pass): the media_items columns the game page reads, every
-- movie_details column, the region's certification, the scores, the release
-- state (movie_release_state, the rule the Watchlist and the Calendar share,
-- so the page's theatrical line never disagrees with them), and where to
-- watch it.
--
--   scores        every external_scores row of the film as {source: {score,
--                 score_count, fetched_at}}, the shape gamePage hands the
--                 screen: tmdb (vote average times ten, and the vote count)
--                 today, and Rotten Tomatoes under its own source the day the
--                 Wikidata pass writes it (Wikidata's CC0 value). A source
--                 the mirror adds later shows up without a migration.
--   awards        null. The catalog carries no awards yet; the column is in
--                 the row so the page's contract does not change when a
--                 source lands, and the page hides the line on null.
--   availability  the region's current offers, one per provider and offer
--                 type, in JustWatch's display order and then subscription,
--                 free, ads, rent, buy: {provider_id, name, logo_image_id,
--                 offer_type, mine}. mine is true for a subscription, free or
--                 ads offer on one of the caller's services
--                 (profiles.watch_provider_ids), the outlined chip with the
--                 check; renting from a service you subscribe to is not "on
--                 your services", the rule movie_watchlist's on_my_services
--                 uses.
--
-- The diary and the entry come from the existing reads (diaryFor, getEntry).
-- The region is p_region when given, else the caller's profiles.watch_region,
-- else US. Security invoker: everything here is catalog except the caller's
-- own profile row. No row for an id that is not a film.

create function public.movie_page(
  p_media_item_id uuid,
  p_region text default null,
  p_today date default current_date
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  release_date date,
  cover_image_id text,
  external_ids jsonb,
  tmdb_id integer,
  runtime_minutes integer,
  genres text[],
  directors text[],
  writers text[],
  top_cast jsonb,
  studio text,
  collection_tmdb_id integer,
  collection_name text,
  tagline text,
  overview text,
  backdrop_image_id text,
  certification text,
  scores jsonb,
  awards text,
  placement text,
  placement_on date,
  theatrical_on date,
  digital_on date,
  streams_now boolean,
  availability jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with args as (
    select
      coalesce(
        nullif(upper(btrim(p_region)), ''),
        (select p.watch_region from public.profiles p where p.id = auth.uid()),
        'US'
      ) as region,
      coalesce(p_today, current_date) as today,
      coalesce(
        (select p.watch_provider_ids from public.profiles p where p.id = auth.uid()),
        '{}'::integer[]
      ) as mine
  )
  select
    m.id,
    m.title,
    m.year,
    m.release_date,
    m.cover_image_id,
    m.external_ids,
    md.tmdb_id,
    md.runtime_minutes,
    coalesce(md.genres, '{}'::text[]),
    coalesce(md.directors, '{}'::text[]),
    coalesce(md.writers, '{}'::text[]),
    coalesce(md.top_cast, '[]'::jsonb),
    md.studio,
    md.collection_tmdb_id,
    md.collection_name,
    md.tagline,
    md.overview,
    md.backdrop_image_id,
    (select c.certification
       from public.media_certifications c
      where c.media_item_id = m.id and c.region = a.region),
    coalesce(
      (select jsonb_object_agg(
                s.source,
                jsonb_build_object('score', s.score, 'score_count', s.score_count, 'fetched_at', s.fetched_at)
              )
         from public.external_scores s
        where s.media_item_id = m.id),
      '{}'::jsonb
    ),
    null::text,
    rs.placement,
    rs.placement_on,
    rs.theatrical_on,
    rs.digital_on,
    rs.streams_now,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'provider_id', w.provider_id,
                  'name', wp.name,
                  'logo_image_id', wp.logo_image_id,
                  'offer_type', w.offer_type,
                  'mine', w.offer_type in ('flatrate', 'free', 'ads') and w.provider_id = any (a.mine)
                )
                order by
                  (wp.display_priorities ->> a.region)::integer nulls last,
                  array_position(array['flatrate', 'free', 'ads', 'rent', 'buy']::text[], w.offer_type),
                  w.provider_id
              )
         from public.watch_availability w
         join public.watch_providers wp on wp.provider_id = w.provider_id
        where w.media_item_id = m.id
          and w.region = a.region
          and w.removed_at is null),
      '[]'::jsonb
    )
  from public.media_items m
  cross join args a
  left join public.movie_details md on md.media_item_id = m.id
  cross join lateral public.movie_release_state(m.id, a.region, a.today) rs
  where m.id = p_media_item_id
    and m.medium = 'movie';
$$;

comment on function public.movie_page(uuid, text, date) is
  'The movie page''s catalog half for a region on a day: the film, its details, the certification, every external score by source, awards (null until the catalog has a source), the release state movie_release_state gives, and the current offers in display order with mine marking a subscription, free or ads offer on the caller''s services. Security invoker; no row for an id that is not a film.';

revoke all on function public.movie_page(uuid, text, date) from public, anon;
grant execute on function public.movie_page(uuid, text, date) to authenticated, service_role;

-- ==============================================================================
-- 4. movie_home_rows
-- ==============================================================================
--
-- Home's rows by reason (decision 28; movies-brief, "The row catalog" and
-- Rafa's order of 2026-10-07): every row title names the reason in the user's
-- terms, the variable part in italics on the screen.
--
--   watchlist  "You wanted to watch these": the caller's watchlist films as
--              movie_watchlist returns them, newest added first. First,
--              because it is the one row whose reason is the user's own word.
--   genre      up to three, the genre word alone ("Horror"): a genre
--              qualifies when the caller has at least three ranked films in
--              it with a mean percentile above one half, ordered by that
--              mean. Candidates: unseen films of the genre, scored.
--   because    up to three, "Because you loved Past Lives": one per Loved
--              film, in rank order, that has at least six unseen candidates
--              predicted above the caller's median score. Candidates: unseen
--              films sharing a director or two genres with the loved film,
--              scored.
--   popular    "Popular": popular_games('movie') minus the caller's entries
--              and the films without a poster,
--              only when no other row has anything to say, so Home is never
--              empty. Not "Popular this week": the order is TMDB's all-time
--              vote count, and the label must not claim a signal the data does
--              not carry (specs/search.md).
--
-- Seven rows at most; a row with nothing to say is skipped. Twelve candidates
-- a row, best predicted first (the watchlist keeps its own order). Each
-- candidate is {media_item_id, title, year, cover_image_id, external_ids,
-- runtime_minutes, genres, streams_on, on_my_services}, the two arrays as
-- movie_watchlist computes them (subscription, free or ads offers in the
-- region, in display order; those on the caller's services). Services never
-- title or filter a row; they are the pill on the poster.
--
-- "Unseen" is what suggestion_candidates means by it: no entry of any status
-- and not ranked. The genre rows are suggestion_candidates' genre filter and
-- its scorer, but the pools of every genre and loved film are scored by one
-- recommendation_scores call rather than one suggestion_candidates call each:
-- each call rebuilds the content profile and its document frequencies over the
-- catalog, and six of them would be six times the cost for the same profile.
-- Like suggestion_candidates, each pool is cut by prior before scoring, to 80
-- (suggestion_candidates keeps 500 for thirty picks; a row shows twelve); a
-- loved film's directors' films are always in its pool. A loved film with one
-- genre shares "two" when it shares that one, or it could never have a row.
--
-- The pools are drawn from the 3,000 unseen films with the best prior, read
-- once by walking item_prior (which the nightly refresh_item_priors fills for
-- every film) in prior order, rather than reading every film of every genre
-- to sort it: that walk is what keeps the read inside its ceiling. A rare
-- genre then has fewer than 80 in its pool, which still fills a row of twelve.
-- A film the mirror added since last night's refresh has no prior yet and
-- joins the pools the next morning; a loved film's directors' films are found
-- whatever their prior.
--
-- The region is p_region when given, else the caller's profiles.watch_region
-- (the one movie_watchlist reads), else US, so the watchlist row's membership
-- and every row's service pills answer for one region.
--
-- Security definer, for the reason suggestion_candidates is: the scorer and
-- the profile are service role only, so a security invoker function could not
-- call them. It takes no user argument and works on auth.uid() alone; Row
-- Level Security does not apply inside it, so every read of the caller's
-- entries and rankings is filtered by v_uid by hand. movie_watchlist, which it
-- calls, filters by auth.uid() itself.
--
-- Cost: measured in supabase/tests/movie_screens.test.sql against a 25,000-film
-- synthetic catalog, and noted in the PR.

create function public.movie_home_rows(
  p_region text default null,
  p_today date default current_date
)
returns table (
  row_index integer,
  kind text,
  title text,
  variable_part text,
  about_media_item_id uuid,
  candidates jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_region text := nullif(upper(btrim(p_region)), '');
  v_today date := coalesce(p_today, current_date);
  v_providers integer[];
  v_profile_region text;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'movie_home_rows requires an authenticated user';
  end if;

  select p.watch_provider_ids, p.watch_region into v_providers, v_profile_region
  from public.profiles p
  where p.id = v_uid;
  v_providers := coalesce(v_providers, '{}');
  -- No region asked for: the profile's, the one movie_watchlist reads, so the
  -- watchlist row's membership and every row's service pills agree.
  v_region := coalesce(v_region, v_profile_region, 'US');

  return query
  with
  -- The caller's ranked films with their percentile and score.
  ranked as (
    select rp.media_item_id, rp.tier, rp.overall_rank, rp.pct, rp.score
    from public.ranking_percentiles rp
    where rp.user_id = v_uid
      and rp.medium = 'movie'
  ),
  stats as (
    select percentile_cont(0.5) within group (order by r.score) as median
    from ranked r
  ),
  seen as (
    select e.media_item_id from public.user_entries e where e.user_id = v_uid
    union
    select r.media_item_id from public.ranking_entries r where r.user_id = v_uid
  ),
  -- 1. The watchlist, as the Watchlist tab reads it.
  watch as (
    select w.media_item_id, w.ordinality as n
    from public.movie_watchlist(v_today) with ordinality as w
    where w.ordinality <= 12
  ),
  -- 2. Genres the caller ranks high.
  genre_pick as (
    select
      g.genre,
      row_number() over (order by avg(r.pct) desc, count(*) desc, g.genre) as n
    from ranked r
    join public.movie_details md on md.media_item_id = r.media_item_id
    cross join unnest(md.genres) as g(genre)
    group by g.genre
    having count(*) >= 3 and avg(r.pct) > 0.5
    order by avg(r.pct) desc, count(*) desc, g.genre
    limit 3
  ),
  -- 3. Loved films in rank order; six looked at, three rows at most kept.
  loved as (
    select
      r.media_item_id,
      r.overall_rank,
      m.title,
      coalesce(md.genres, '{}'::text[]) as genres,
      coalesce(md.directors, '{}'::text[]) as directors
    from ranked r
    join public.media_items m on m.id = r.media_item_id
    left join public.movie_details md on md.media_item_id = r.media_item_id
    where r.tier = 'loved'
    order by r.overall_rank
    limit 6
  ),
  -- The unseen films with the best prior, walked down item_prior's
  -- (medium, prior_score) index: the 3,000 every genre and loved film draws
  -- its pool from, read once rather than once a pool.
  base as materialized (
    select ip.media_item_id as id, ip.prior_score as prior, md.genres
    from public.item_prior ip
    join public.movie_details md on md.media_item_id = ip.media_item_id
    where ip.medium = 'movie'
      and exists (select 1 from genre_pick union all select 1 from loved)
      and not exists (select 1 from seen s where s.media_item_id = ip.media_item_id)
    order by ip.prior_score desc, ip.media_item_id
    limit 3000
  ),
  -- Each genre's pool: its 80 best by prior.
  genre_pool as (
    select x.genre, x.id
    from (
      select
        gp.genre,
        b.id,
        row_number() over (partition by gp.genre order by b.prior desc, b.id) as rn
      from genre_pick gp
      join base b on b.genres @> array[gp.genre]
    ) x
    where x.rn <= 80
  ),
  -- Each loved film's pool: its directors' other unseen films, found through
  -- movie_details_directors whatever their prior, then the films sharing two
  -- of its genres (every genre, when it has only one), 80 at most by prior.
  because_pool as (
    select l.media_item_id as loved_id, md.media_item_id as id
    from loved l
    join public.movie_details md
      on cardinality(l.directors) > 0
     and md.directors && l.directors
    where not exists (select 1 from seen s where s.media_item_id = md.media_item_id)
    union
    select x.loved_id, x.id
    from (
      select
        l.media_item_id as loved_id,
        b.id,
        row_number() over (partition by l.media_item_id order by b.prior desc, b.id) as rn
      from loved l
      join base b
        on b.genres && l.genres
       and (select count(*) from unnest(b.genres) as ug(g) where ug.g = any (l.genres))
           >= least(2, cardinality(l.genres))
    ) x
    where x.rn <= 80
  ),
  scored as (
    select s.media_item_id, s.predicted_score, s.prior_score
    from public.recommendation_scores(
      v_uid,
      'movie',
      (select coalesce(array_agg(distinct p.id), '{}')
         from (select gp.id from genre_pool gp union select bp.id from because_pool bp) p),
      null
    ) s
  ),
  genre_rows as (
    select
      gp.genre,
      gp.n,
      array(
        select x.id
        from genre_pool x
        join scored s on s.media_item_id = x.id
        where x.genre = gp.genre
        order by s.predicted_score desc, s.prior_score desc, x.id
        limit 12
      ) as ids
    from genre_pick gp
  ),
  because_rows as (
    select q.*, row_number() over (order by q.overall_rank) as n
    from (
      select
        l.media_item_id,
        l.title,
        l.overall_rank,
        array(
          select x.id
          from because_pool x
          join scored s on s.media_item_id = x.id
          where x.loved_id = l.media_item_id
          order by s.predicted_score desc, s.prior_score desc, x.id
          limit 12
        ) as ids
      from loved l
      where (
        select count(*)
        from because_pool x
        join scored s on s.media_item_id = x.id
        where x.loved_id = l.media_item_id
          and s.predicted_score > (select st.median from stats st)
      ) >= 6
    ) q
  ),
  rows_by_reason as (
    select
      1 as grp,
      1::bigint as n,
      'watchlist'::text as kind,
      'You wanted to watch these'::text as title,
      null::text as variable_part,
      null::uuid as about,
      array(select w.media_item_id from watch w order by w.n) as ids
    union all
    select 2, g.n, 'genre', g.genre, g.genre, null::uuid, g.ids
    from genre_rows g
    union all
    select 3, b.n, 'because', 'Because you loved ' || b.title, b.title, b.media_item_id, b.ids
    from because_rows b
    where b.n <= 3
  ),
  kept as (
    select r.*
    from rows_by_reason r
    where cardinality(r.ids) > 0
  ),
  fallback as (
    select
      4 as grp,
      1::bigint as n,
      'popular'::text as kind,
      'Popular'::text as title,
      null::text as variable_part,
      null::uuid as about,
      array(
        select pg.id
        from public.popular_games(50, 'movie') with ordinality as pg
        where pg.cover_image_id is not null
          and not exists (select 1 from seen s where s.media_item_id = pg.id)
        order by pg.ordinality
        limit 12
      ) as ids
    where not exists (select 1 from kept)
  ),
  all_rows as (
    select k.* from kept k
    union all
    select f.* from fallback f where cardinality(f.ids) > 0
  ),
  numbered as (
    select
      (row_number() over (order by a.grp, a.n))::integer as row_index,
      a.*
    from all_rows a
  )
  select
    nr.row_index,
    nr.kind,
    nr.title,
    nr.variable_part,
    nr.about,
    (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'media_item_id', m.id,
                 'title', m.title,
                 'year', m.year,
                 'cover_image_id', m.cover_image_id,
                 'external_ids', m.external_ids,
                 'runtime_minutes', md.runtime_minutes,
                 'genres', coalesce(md.genres, '{}'::text[]),
                 'streams_on', to_jsonb(av.streams_on),
                 'on_my_services', to_jsonb(array(
                   select u.provider_id
                   from unnest(av.streams_on) with ordinality as u(provider_id, k)
                   where u.provider_id = any (v_providers)
                   order by u.k
                 ))
               )
               order by c.ord
             ), '[]'::jsonb)
      from unnest(nr.ids) with ordinality as c(id, ord)
      join public.media_items m on m.id = c.id
      left join public.movie_details md on md.media_item_id = m.id
      cross join lateral (
        select array(
          select w.provider_id
          from public.watch_availability w
          left join public.watch_providers wp on wp.provider_id = w.provider_id
          where w.media_item_id = m.id
            and w.region = v_region
            and w.removed_at is null
            and w.offer_type in ('flatrate', 'free', 'ads')
          group by w.provider_id
          order by min((wp.display_priorities ->> v_region)::integer) nulls last, w.provider_id
        ) as streams_on
      ) av
    )
  from numbered nr
  order by nr.row_index;
end;
$$;

comment on function public.movie_home_rows(text, date) is
  'Home''s rows by reason for the caller, in order: the watchlist, up to three genres they rank high, up to three "Because you loved" a Loved film, or one Popular row when none has anything to say; at most twelve candidates each, best predicted first, each with where it streams in the region and which of those are the caller''s services. Security definer bound to auth.uid().';

revoke all on function public.movie_home_rows(text, date) from public, anon;
grant execute on function public.movie_home_rows(text, date) to authenticated, service_role;

-- ==============================================================================
-- 5. deck_candidates for films
-- ==============================================================================
--
-- The movies onboarding's film deck (movies-build PR 6) reads the same pool
-- the games deck does, with the medium as an argument. For films:
--
--   * popularity is TMDB's vote count, the order popular_games uses for a
--     film, served by media_items_film_vote_count;
--   * a film without a poster or not released yet is left out: the deck asks
--     "have you seen this", which an unreleased film cannot answer, and a card
--     without its poster is not a card (rule 29);
--   * p_platforms is ignored, and platforms comes back empty: services are
--     not a filter on what you have already seen;
--   * boost is the caller's film content profile over the film's features, the
--     same weighting as the games path, from two ranked films.
--
-- The games path is the body of 20261007120000_onboarding_backend.sql,
-- unchanged. Drop and create, because the argument list changes; the old
-- three-argument function would otherwise stay as an overload PostgREST
-- cannot choose between. The grants and the comment are written again.

drop function if exists public.deck_candidates(text[], integer, integer);

create function public.deck_candidates(
  p_platforms text[] default null,
  p_limit integer default 10,
  p_offset integer default 0,
  p_medium public.medium default 'game'
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  genres text[],
  platforms text[],
  popularity_rank integer,
  boost numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := coalesce(p_offset, 0);
  v_medium public.medium := coalesce(p_medium, 'game');
  v_platforms text[] := case when cardinality(p_platforms) > 0 then p_platforms end;
  v_features text[] := '{}';
  v_weights numeric[] := '{}';
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'deck_candidates requires an authenticated user';
  end if;

  if v_offset < 0 then
    raise exception using
      errcode = '22023',
      message = format('p_offset must be 0 or more, not %s', v_offset);
  end if;

  -- The caller's profile in the medium, only when it can exist: a feature
  -- counts once it is on two ranked items.
  if (
    select count(*) >= 2
    from public.ranking_entries r
    where r.user_id = v_uid and r.medium = v_medium
  ) then
    select coalesce(array_agg(p.feature), '{}'), coalesce(array_agg(p.weight), '{}')
    into v_features, v_weights
    from public.recommendation_content_profile(v_uid, v_medium) p;
  end if;

  if v_medium = 'game' then
    return query
    with page as (
      -- Row Level Security does not apply in a definer function: the caller's
      -- entries and rankings are filtered by v_uid by hand.
      select
        m.id,
        m.title,
        m.year,
        m.cover_image_id,
        m.external_ids,
        coalesce(g.genres, '{}'::text[]) as genres,
        coalesce(g.platforms, '{}'::text[]) as platforms,
        nullif(m.metadata ->> 'total_rating_count', '')::numeric as popularity
      from public.media_items m
      left join public.game_details g on g.media_item_id = m.id
      where m.medium = 'game'
        and (v_platforms is null or coalesce(g.platforms, '{}'::text[]) && v_platforms)
        and not exists (
          select 1 from public.user_entries e
          where e.user_id = v_uid and e.media_item_id = m.id
        )
        and not exists (
          select 1 from public.ranking_entries r
          where r.user_id = v_uid and r.media_item_id = m.id
        )
      order by nullif(m.metadata ->> 'total_rating_count', '')::numeric desc nulls last, m.id
      limit v_limit
      offset v_offset
    ),
    boosts as (
      select f.media_item_id, sum(w.weight) as boost
      from public.recommendation_item_features(
        'game', (select coalesce(array_agg(p.id), '{}') from page p)
      ) f
      join unnest(v_features, v_weights) as w(feature, weight) on w.feature = f.feature
      group by f.media_item_id
    ),
    ranked as (
      select
        p.*,
        (v_offset + row_number() over (order by p.popularity desc nulls last, p.id))::integer as popularity_rank
      from page p
    )
    select
      r.id, r.title, r.year, r.cover_image_id, r.external_ids, r.genres, r.platforms,
      r.popularity_rank, round(coalesce(b.boost, 0), 4)
    from ranked r
    left join boosts b on b.media_item_id = r.id
    order by r.popularity_rank;
  else
    return query
    with page as (
      select
        m.id,
        m.title,
        m.year,
        m.cover_image_id,
        m.external_ids,
        coalesce(md.genres, td.genres, '{}'::text[]) as genres,
        '{}'::text[] as platforms,
        nullif(m.metadata ->> 'vote_count', '')::numeric as popularity
      from public.media_items m
      left join public.movie_details md on md.media_item_id = m.id
      left join public.tv_details td on td.media_item_id = m.id
      where m.medium = v_medium
        and m.cover_image_id is not null
        -- the server's date, explicitly: deck_candidates takes no p_today,
        -- and a film released today west of Greenwich shows a few hours
        -- early at worst, which a "have you seen this" deck can afford
        and m.release_date <= current_date
        and not exists (
          select 1 from public.user_entries e
          where e.user_id = v_uid and e.media_item_id = m.id
        )
        and not exists (
          select 1 from public.ranking_entries r
          where r.user_id = v_uid and r.media_item_id = m.id
        )
      order by nullif(m.metadata ->> 'vote_count', '')::numeric desc nulls last, m.id
      limit v_limit
      offset v_offset
    ),
    boosts as (
      select f.media_item_id, sum(w.weight) as boost
      from public.recommendation_item_features(
        v_medium, (select coalesce(array_agg(p.id), '{}') from page p)
      ) f
      join unnest(v_features, v_weights) as w(feature, weight) on w.feature = f.feature
      group by f.media_item_id
    ),
    ranked as (
      select
        p.*,
        (v_offset + row_number() over (order by p.popularity desc nulls last, p.id))::integer as popularity_rank
      from page p
    )
    select
      r.id, r.title, r.year, r.cover_image_id, r.external_ids, r.genres, r.platforms,
      r.popularity_rank, round(coalesce(b.boost, 0), 4)
    from ranked r
    left join boosts b on b.media_item_id = r.id
    order by r.popularity_rank;
  end if;
end;
$$;

comment on function public.deck_candidates(text[], integer, integer, public.medium) is
  'One page of the deck in a medium: items the caller has neither tracked nor ranked, most popular first (IGDB''s rating count for games on any of p_platforms; TMDB''s vote count for films and series, released and with a poster, p_platforms ignored), p_limit (1 to 50, default 10) from p_offset, each with its 1-based popularity_rank and the caller''s content-profile boost in the medium (0 without a profile). Security definer bound to auth.uid().';

revoke all on function public.deck_candidates(text[], integer, integer, public.medium) from public, anon;
grant execute on function public.deck_candidates(text[], integer, integer, public.medium) to authenticated, service_role;

-- ==============================================================================
-- 6. The Letterboxd import writes its diary rows as 'import'
-- ==============================================================================
--
-- 20261012130000_letterboxd_import.sql (PR #99) writes one watch_log row per
-- watched date in the export, and it landed before the source column existed,
-- so its rows would take the default and read as 'log', "Watched X" on the
-- day the person picked, which is the log sheet's claim and not the import's.
-- apply_letterboxd_import is restated whole below, the body #99 shipped, with
-- one change: the diary insert names its source. Everything else (the films
-- with no date get no diary row and keep their finished_at, as #99 decided)
-- is unchanged. create or replace keeps its grants and its comment.
--
-- The rows it already wrote are marked in section 1, before the source lock.

create or replace function public.apply_letterboxd_import(
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
  insert into public.watch_log (media_item_id, watched_on, source)
  select distinct f.media_item_id, d.day, 'import'
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

-- ==============================================================================
-- 7. tier_list reads a film's genres
-- ==============================================================================
--
-- tier_list (as 20261007120000_onboarding_backend.sql left it) joins
-- game_details alone, so every ranked film came back with genres '{}': the
-- film Ranking rows' "year · genre", the Genre filter and the
-- genre-preferring pivot ("Which sci-fi movie...") had nothing to read. The
-- body is restated with genres from whichever extension table holds the row,
-- as search_games and suggestion_candidates already read them; a series'
-- genres come with it for when TV is unheld. platforms stays a game's field.
-- Same arguments and return table, so create or replace keeps the grants and
-- the comment; both are written again anyway so this file says what it left.

create or replace function public.tier_list(
  p_medium public.medium,
  p_tier public.tier
)
returns table (
  media_item_id uuid,
  "position" integer,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  genres text[],
  platforms text[],
  played_platforms text[],
  placed_by text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    r.media_item_id,
    r.position,
    m.title,
    m.year,
    m.cover_image_id,
    m.external_ids,
    coalesce(g.genres, md.genres, td.genres, '{}'::text[]),
    coalesce(g.platforms, '{}'::text[]),
    coalesce(e.played_platforms, '{}'::text[]),
    r.placed_by
  from public.ranking_entries r
  join public.media_items m on m.id = r.media_item_id
  left join public.game_details g on g.media_item_id = m.id
  left join public.movie_details md on md.media_item_id = m.id
  left join public.tv_details td on td.media_item_id = m.id
  left join public.user_entries e
    on e.user_id = r.user_id
   and e.media_item_id = r.media_item_id
  where r.user_id = auth.uid()
    and r.medium = p_medium
    and r.tier = p_tier
  order by r.position;
$$;

comment on function public.tier_list(public.medium, public.tier) is
  'The caller''s ranked items in one tier, best first, joined with catalog details. genres come from whichever extension table holds the row (a game''s IGDB genres, a film''s or a series'' TMDB ones); platforms is a game''s field. external_ids carries the Steam app id a cover falls back to; played_platforms is the caller''s own list from the entry, empty when nothing is recorded or the entry is gone; placed_by is user or prior, the provisional mark.';

revoke all on function public.tier_list(public.medium, public.tier) from public, anon;
grant execute on function public.tier_list(public.medium, public.tier) to authenticated, service_role;
