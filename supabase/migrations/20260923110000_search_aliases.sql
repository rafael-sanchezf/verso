-- Search smarter: aliases, initialisms, and word-level matching.
-- ROADMAP.md work queue item 27; docs/private/phone-feedback.md entries 6 and 9.
--
-- Two complaints from the phone, one cause. `search_games` matched a row when
-- the *whole title* was trigram-similar to the term (`title % term`, threshold
-- 0.3) or started with it:
--
--   * "GTA" found nothing (entry 6). Three letters share no trigram with
--     "Grand Theft Auto V", and nothing else in the catalog says that GTA is
--     what everyone calls it.
--   * "Zelda" found the titles that start with Zelda plus the 1986 original
--     (entry 9). Similarity is over the entire string, so the five-letter term
--     shares six trigrams with "The Legend of Zelda" (about 0.32, in) and the
--     same six with "The Legend of Zelda: Breath of the Wild" (about 0.17,
--     out). The term is a word inside the title, not the title.
--
-- Four pieces:
--
--   1. `media_aliases`, a media-agnostic store of other names for a catalog
--      row, from two sources: IGDB's `alternative_names` (the mirror in
--      packages/catalog writes them) and an initialism derived here from the
--      title.
--   2. `search_key(text)`, the normal form two spellings are compared in, so
--      "GTAV", "gta v" and "GTA-V" are one key.
--   3. `title_initialisms(text)`, which derives "GTA V" and "GTA 5" from
--      "Grand Theft Auto V" and "BOTW" from "The Legend of Zelda: Breath of the
--      Wild", with a trigger keeping them current and a backfill below.
--   4. `search_games`, rewritten to match words in the title and any alias,
--      ranked exact title, then exact IGDB alias, then a word or alias that
--      starts with the term, then similarity, with popularity breaking ties.
--      Same arguments and grants; the row gains `external_ids`, the Steam
--      cover fallback's input (see section 5).

-- ==============================================================================
-- 1. search_key
-- ==============================================================================
-- Lower case with whitespace and punctuation removed. It is the form an alias
-- is indexed under and the form the term is compared in, so a compact spelling
-- and a spaced one meet: "GTAV" and "GTA V" are both `gtav`, "gta 5" and
-- "GTA5" are both `gta5`, "Halo: Reach" and "halo reach" are both `haloreach`.
-- That is also why title_initialisms stores "GTA V" and not "GTAV" beside it:
-- the key already makes them the same alias.
--
-- The class is ASCII punctuation and whitespace plus the typographic marks
-- IGDB titles actually carry (curly quotes, en and em dashes, the middle dot),
-- listed explicitly rather than trusted to the database locale's idea of
-- punctuation outside ASCII. Letters in any script survive, so a Japanese
-- alternative name keeps a key that a Japanese query can meet.
--
-- No `set search_path` on this one, unlike every other function in the
-- project, and on purpose: a SQL function with a SET clause is never inlined
-- and pays a configuration save and restore on every call, and search_games
-- calls this once per candidate row. Every name in the body is qualified with
-- pg_catalog instead, so the search path has nothing to resolve.

create function public.search_key(p_text text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(p_text, '[[:space:][:punct:]‘’“”–—·]+', '', 'g')
  )
$$;

comment on function public.search_key(text) is
  'The normal form search compares in: lower case, whitespace and punctuation removed. "GTA V", "GTAV" and "gta-v" share the key gtav.';

-- ==============================================================================
-- 2. title_initialisms
-- ==============================================================================
-- The initials of a title's words, the way players abbreviate them.
--
-- ## The rules
--
-- * **Every word counts, articles and prepositions included.** Players write
--   BOTW, COD, GOW, TLOU, KOTOR: "of" and "the" are in all of them. The one
--   concession is a second form of the main title without a leading "The",
--   "A" or "An", because LOZ and TLOZ are both in use.
-- * **Numerals are kept whole and spaced**, so "Grand Theft Auto V" gives
--   "GTA V", "Red Dead Redemption 2" gives "RDR 2", and "Super Mario 3D World"
--   gives "SM 3D W". A Roman numeral also gives an Arabic form ("GTA 5",
--   "FF 7"). A word is a Roman numeral when it is written in capitals, is not
--   the first word, and, for "I" alone, is the last word ("Mega Man X" yes,
--   "I Am Setsuna" no). The compact spellings, "GTAV" and "GTA5", are not
--   stored: search_key makes them the same alias.
-- * **A subtitle is its own abbreviation.** The title is split at a colon or a
--   spaced dash. The subtitle gives its own form when it qualifies ("Breath of
--   the Wild" gives BOTW), and the main title and the first subtitle give a
--   combined one ("Grand Theft Auto: San Andreas" gives "GTA SA",
--   "The Legend of Zelda: Breath of the Wild" gives "TLOZ BOTW" and
--   "LOZ BOTW"). The main title alone is *not* emitted when there is a
--   subtitle: "GTA" belongs to the 1997 game, and San Andreas reaches "gta"
--   as a prefix of "GTA SA" the way GTA V does through "GTA V", so the series
--   is one group that popularity orders rather than split by which entries
--   happen to have a colon.
-- * **Too short to mean anything is dropped.** A form needs three letters, or
--   two letters and a numeral: "GTA", "BOTW", "MK 8", "DS 3" qualify; "H"
--   from "Hades II" and "SA" on its own do not. One-word titles never have
--   one.
-- * **Latin script only.** A segment with a word that starts with a letter
--   outside ASCII yields nothing, because the initial of "ゼルダの伝説" is not
--   an abbreviation anybody types. Hyphens and slashes split words
--   ("Half-Life 2" gives "HL 2"); apostrophes do not ("Baldur's Gate 3" gives
--   "BG 3").
--
-- At most eight forms, de-duplicated, never one whose key equals the title's.
-- Immutable, so a trigger and a backfill can call it and an index could.

create function public.title_initialisms(p_title text)
returns text[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  c_roman constant text[] := array[
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'
  ];
  v_segments text[];
  v_words text[];
  v_word text;
  v_clean text;
  v_first text;
  v_tokens text[];
  v_letters integer;
  v_numerals integer;
  v_skip boolean;
  v_main_full text[];
  v_main_dropped text[];
  v_main_letters integer := 0;
  v_main_dropped_letters integer := 0;
  v_sub_tokens text[];
  v_sub_letters integer;
  v_sub_numerals integer;
  v_first_sub text[];
  v_first_sub_letters integer := 0;
  v_candidates text[] := '{}';
  v_candidate text;
  v_render text;
  v_out text[] := '{}';
  v_title_key text;
  v_need_space boolean;
  v_kind text;
  v_value text;
  v_arabic boolean;
  i integer;
  j integer;
begin
  if p_title is null or pg_catalog.btrim(p_title) = '' then
    return '{}';
  end if;

  v_title_key := public.search_key(p_title);

  -- Main title, then subtitles: split at a colon or at a dash with spaces
  -- around it (a hyphen inside a word is not a subtitle).
  v_segments := pg_catalog.regexp_split_to_array(
    pg_catalog.btrim(p_title),
    '[[:space:]]*:[[:space:]]*|[[:space:]]+[-–—][[:space:]]+'
  );

  for i in 1 .. coalesce(pg_catalog.array_length(v_segments, 1), 0) loop
    continue when pg_catalog.btrim(v_segments[i]) = '';

    -- Tokens: 'L' + a capital letter, 'N' + a numeral as written, 'R' + a
    -- Roman numeral. Stored as one string per segment ('LG|LT|LA|RV'),
    -- because plpgsql has no ragged arrays.
    v_words := pg_catalog.regexp_split_to_array(
      pg_catalog.btrim(v_segments[i]), '[[:space:]/–—-]+'
    );
    v_tokens := '{}';
    v_letters := 0;
    v_numerals := 0;
    v_skip := false;

    for j in 1 .. coalesce(pg_catalog.array_length(v_words, 1), 0) loop
      v_word := v_words[j];
      -- Leading punctuation does not hide the initial: '"Splosion' is S.
      v_first := pg_catalog.left(pg_catalog.regexp_replace(v_word, '^[[:punct:]‘’“”]+', ''), 1);
      continue when v_first = '';

      if v_first !~ '^[A-Za-z0-9]$' then
        -- A word in another script: this segment is not abbreviable.
        v_skip := true;
        exit;
      end if;

      v_clean := pg_catalog.regexp_replace(v_word, '[^A-Za-z0-9]', '', 'g');

      if v_first ~ '^[0-9]$' then
        v_tokens := v_tokens || ('N' || pg_catalog.upper(v_clean));
        v_numerals := v_numerals + 1;
      elsif j > 1
        and v_clean = pg_catalog.upper(v_clean)
        and v_clean = any (c_roman)
        and (v_clean <> 'I' or j = pg_catalog.array_length(v_words, 1))
      then
        v_tokens := v_tokens || ('R' || v_clean);
        v_numerals := v_numerals + 1;
      else
        v_tokens := v_tokens || ('L' || pg_catalog.upper(v_first));
        v_letters := v_letters + 1;
      end if;
    end loop;

    continue when v_skip or pg_catalog.cardinality(v_tokens) = 0;

    if i = 1 then
      v_main_full := v_tokens;
      v_main_letters := v_letters;
      -- The article-less form, when the main title leads with one and what is
      -- left still starts with a letter.
      if pg_catalog.lower(pg_catalog.regexp_replace(v_words[1], '[^A-Za-z]', '', 'g')) in ('the', 'a', 'an')
         and v_letters > 1
         and pg_catalog.left(v_tokens[2], 1) = 'L'
      then
        v_main_dropped := v_tokens[2:];
        v_main_dropped_letters := v_letters - 1;
      end if;
    else
      v_sub_tokens := v_tokens;
      v_sub_letters := v_letters;
      v_sub_numerals := v_numerals;
      if v_first_sub is null then
        v_first_sub := v_tokens;
        v_first_sub_letters := v_letters;
      end if;
      -- A subtitle stands on its own when it qualifies by itself.
      if v_sub_letters >= 3 or (v_sub_letters >= 2 and v_sub_numerals >= 1) then
        v_candidates := v_candidates || pg_catalog.array_to_string(v_sub_tokens, '|');
      end if;
    end if;
  end loop;

  if v_main_full is not null then
    if v_first_sub is null then
      -- No subtitle: the main title's own forms.
      if v_main_letters >= 3
         or (v_main_letters >= 2 and pg_catalog.cardinality(v_main_full) > v_main_letters)
      then
        v_candidates := pg_catalog.array_to_string(v_main_full, '|') || v_candidates;
      end if;
      if v_main_dropped is not null
         and (v_main_dropped_letters >= 3
              or (v_main_dropped_letters >= 2
                  and pg_catalog.cardinality(v_main_dropped) > v_main_dropped_letters))
      then
        v_candidates := v_candidates || pg_catalog.array_to_string(v_main_dropped, '|');
      end if;
    elsif v_first_sub_letters >= 1 then
      -- Main title and first subtitle together, separated by 'S' (a space).
      if v_main_letters >= 2 then
        v_candidates := v_candidates
          || (pg_catalog.array_to_string(v_main_full, '|') || '|S|'
              || pg_catalog.array_to_string(v_first_sub, '|'));
      end if;
      if v_main_dropped is not null and v_main_dropped_letters >= 2 then
        v_candidates := v_candidates
          || (pg_catalog.array_to_string(v_main_dropped, '|') || '|S|'
              || pg_catalog.array_to_string(v_first_sub, '|'));
      end if;
    end if;
  end if;

  -- Render each candidate as written, then with Roman numerals in Arabic.
  foreach v_candidate in array v_candidates loop
    foreach v_arabic in array array[false, true] loop
      continue when v_arabic and pg_catalog.strpos('|' || v_candidate, '|R') = 0;

      v_render := '';
      v_need_space := false;
      foreach v_value in array pg_catalog.string_to_array(v_candidate, '|') loop
        v_kind := pg_catalog.left(v_value, 1);
        v_value := pg_catalog.substr(v_value, 2);

        if v_kind = 'S' then
          v_need_space := true;
          continue;
        end if;

        if v_kind = 'R' and v_arabic then
          v_value := pg_catalog.array_position(c_roman, v_value)::text;
        end if;

        if v_kind = 'L' then
          if v_need_space and v_render <> '' then
            v_render := v_render || ' ';
          end if;
          v_render := v_render || v_value;
          v_need_space := false;
        else
          if v_render <> '' then
            v_render := v_render || ' ';
          end if;
          v_render := v_render || v_value;
          v_need_space := true;
        end if;
      end loop;

      if v_render <> ''
         and public.search_key(v_render) <> v_title_key
         and not (v_render = any (v_out))
         and pg_catalog.cardinality(v_out) < 8
      then
        v_out := v_out || v_render;
      end if;
    end loop;
  end loop;

  return v_out;
end;
$$;

comment on function public.title_initialisms(text) is
  'The abbreviations players type for a title: initials of every word with numerals kept ("Grand Theft Auto V" gives GTA V and GTA 5), a subtitle on its own (BOTW) and joined to the main title (GTA SA). At most eight; none for a one-word title or a non-Latin one.';

-- ==============================================================================
-- 3. media_aliases
-- ==============================================================================
-- Other names for a catalog row. Media-agnostic like media_items: a film's
-- initialism lands here too ("The Lord of the Rings: The Fellowship of the
-- Ring" gives "TLOTR TFOTR" and friends), and a TMDB alternative-titles source
-- is a new value in the `source` check, not a new table.
--
-- `source` says who owns the row, and each source owns its rows outright:
--
--   * 'igdb': IGDB's `alternative_names` ("GTA 5", Japanese titles, working
--     titles). Written by the catalog mirror in packages/catalog, which
--     replaces a game's igdb rows with what IGDB says on every sync of it.
--   * 'initialism': derived from the title by title_initialisms. Written only
--     by the trigger below and the backfill at the end of this file.
--
-- The source is in the primary key, so the same text from both ("GTA V" from
-- IGDB and from the initialism) is two rows, and neither writer can delete or
-- relabel the other's. Search collapses them: an item is a hit once however
-- many of its aliases match.
--
-- `alias_key` is search_key(alias), stored so it can be indexed. Exact and
-- prefix matches on an alias are key comparisons, which is what makes "gtav"
-- find "GTA V" and "gta5" find "GTA 5".

create table public.media_aliases (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  alias text not null check (pg_catalog.btrim(alias) <> '' and pg_catalog.length(alias) <= 200),
  source text not null check (source in ('igdb', 'initialism')),
  alias_key text generated always as (public.search_key(alias)) stored,
  primary key (media_item_id, source, alias)
);

comment on table public.media_aliases is
  'Other names for a catalog row, for search: IGDB alternative names (source igdb, written by the mirror) and initialisms derived from the title (source initialism, written by trigger). Catalog data: readable by signed-in users, written only by the service role.';
comment on column public.media_aliases.alias_key is
  'search_key(alias): lower case, no spaces or punctuation. What exact and prefix alias matches compare, so GTAV meets GTA V.';

-- Trigram index for similarity and word similarity on the alias as written,
-- the way media_items_title_trgm serves the title.
create index media_aliases_alias_trgm
  on public.media_aliases using gin (alias extensions.gin_trgm_ops);

-- Exact and prefix matches on the key. text_pattern_ops, so `like 'gta%'` is a
-- range scan whatever the database collation.
create index media_aliases_alias_key
  on public.media_aliases (alias_key text_pattern_ops);

-- Row Level Security, the catalog way (20260916223000_film_tv_catalog.sql):
-- readable by signed-in users, no write policy at all so only the service role
-- and the migration owner write, and `anon` keeps SELECT with no policy, which
-- makes it an empty set rather than an error.
alter table public.media_aliases enable row level security;

create policy "aliases are readable by signed-in users" on public.media_aliases
  for select to authenticated using (true);

revoke all on public.media_aliases from anon, authenticated;
grant select on public.media_aliases to anon, authenticated;

-- ==============================================================================
-- 4. Keeping initialisms current
-- ==============================================================================
-- After insert, and after an update that changes the title, the row's
-- initialism aliases are replaced with the ones its title gives now. An update
-- that leaves the title alone (every nightly re-sync of an unchanged game)
-- does not fire, so a settled catalog costs no alias churn. The igdb rows are
-- never touched here.
--
-- AFTER, because the aliases reference the row by id and on insert the row has
-- to exist first. Security invoker: media_items is written only by the service
-- role and the migration owner, and both may write aliases.

create function public.media_items_sync_initialisms()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.media_aliases a
   where a.media_item_id = new.id
     and a.source = 'initialism';

  insert into public.media_aliases (media_item_id, alias, source)
  select new.id, f.alias, 'initialism'
    from pg_catalog.unnest(public.title_initialisms(new.title)) as f(alias)
  on conflict do nothing;

  return null;
end;
$$;

comment on function public.media_items_sync_initialisms() is
  'Replace a catalog row''s initialism aliases with the ones its current title gives. Fires after insert and after a title change.';

create trigger media_items_initialisms_on_insert
  after insert on public.media_items
  for each row execute function public.media_items_sync_initialisms();

create trigger media_items_initialisms_on_title
  after update of title on public.media_items
  for each row
  when (old.title is distinct from new.title)
  execute function public.media_items_sync_initialisms();

revoke all on function public.media_items_sync_initialisms() from public, anon, authenticated;

-- search_key is called by search_games as the signed-in caller and by the
-- generated column as whoever writes an alias; title_initialisms by the
-- trigger as whoever writes the catalog. Both are pure, but neither needs to be
-- on the anonymous surface.
revoke all on function public.search_key(text) from public, anon;
grant execute on function public.search_key(text) to authenticated, service_role;

revoke all on function public.title_initialisms(text) from public, anon;
grant execute on function public.title_initialisms(text) to authenticated, service_role;

-- ==============================================================================
-- 5. search_games
-- ==============================================================================
-- Same name, arguments, defaults, grants and security as
-- 20260916230000_per_medium_backlog_and_rpcs.sql left it. What changes is what
-- a match is, how matches are ordered, and one column in the row.
--
-- ## The row gains external_ids
--
-- `media_items.external_ids`, as stored, after `cover_image_id`: the two facts
-- `coverCandidates` (packages/api/src/covers.ts) builds a cover from, so a hit
-- IGDB has no cover for falls back to its Steam art. PR #77 adds the same
-- column to main's version of this function in
-- 20261008100000_search_games_external_ids.sql, which does nothing when the
-- function already returns it; with this file carrying it too, the two land
-- in either order, replayed fresh or pushed one at a time, and end with this
-- body and the column.
--
-- Adding a column changes the return table, which `create or replace` cannot
-- do, so the function is dropped and created. The drop takes the grants, the
-- comment and both `set` clauses with it; all of them are written again below
-- and asserted in supabase/tests/search_aliases.test.sql (work queue item 17).
--
-- ## What is a match
--
-- A catalog row of the requested medium is a candidate when any of these is
-- true:
--
--   title   `title % term`        whole-title similarity, as before (typos)
--           `term <% title`       word similarity: the term is close to some
--                                 run of words in the title ("zelda" in "The
--                                 Legend of Zelda: Breath of the Wild" is 1.0)
--           `title ilike 'term%'` or `'% term%'`: the title, or a word in it,
--                                 starts with the term
--   alias   `alias_key like key%` an alias's key equals or starts with the
--                                 term's key ("gta" for "GTA V", "gtav" for
--                                 "GTA V", "botw" for "BOTW")
--           `alias % term`, `term <% alias`: similar, as for the title
--
-- ## How matches are ordered
--
-- By tier, then by closeness, then by popularity:
--
--   4  the title is the term (compared by key, so "halo reach" is "Halo: Reach")
--   3  an IGDB alias is the term (by key: "gta" is Grand Theft Auto's, "gtav"
--      and "gta 5" are GTA V's)
--   2  a word in the title starts with the term ("zelda", "breath"), or an
--      alias does ("gta" for "GTA V" and "GTA SA"), or a derived initialism
--      is the term ("botw")
--   1  similar only
--
-- Closeness is the best of word similarity and similarity over the title and
-- every alias, so within a tier a whole-word hit beats a partial one ("cod"
-- is all of "COD MW 2" but only part of "Code Vein"). Popularity is the
-- tie-break after that: IGDB's rating count for a game, TMDB's vote count for
-- a film or series, the same keys popular_games orders by. It is what puts
-- Breath of the Wild above a CD-i Zelda when both contain the word and
-- neither is closer, and GTA V first among the "GTA ..." aliases.
--
-- Two departures from "exact title, exact alias, word prefix, alias prefix,
-- similarity", both measured against the full 69,126-game catalog:
--
--   * **A derived initialism that equals the term is not an exact alias.**
--     Twenty catalog titles abbreviate to COD, most of them "Something of
--     Darkness", and "Grand Tits Adventure" abbreviates to GTA. In a tier of
--     their own they would sit above every Call of Duty sequel and above
--     GTA V. An IGDB alternative name is somebody saying that is what the game
--     is called; an initialism is a guess, so it ranks with the prefixes,
--     where closeness and popularity sort the guesses.
--   * **A title word prefix and an alias prefix share a tier.** Otherwise
--     "cod" would rank "Code Vein" (a word starting with cod) above "Call of
--     Duty: Modern Warfare 2" (an alias starting with cod) whatever either's
--     closeness or popularity. In one tier, closeness decides first.
--
-- `score` is `tier + closeness`, so it still orders the rows (up to the
-- popularity tie-break) and is still only meaningful as an ordering.
--
-- ## Cost
--
-- Measured on the full catalog (69,126 games, 94,000 aliases) on the local
-- stack, as a signed-in user, best of five; the PR has the plans. Most terms
-- take 19 to 42 ms ("gta" 19, "zelda" 25, "cod" 40, "legend zelda" 41); the
-- worst cases are a word in nine thousand titles ("the", 255) and a single
-- letter ("a", 280), which the app's 250 ms debounce rarely sends on its own.
-- The function this replaces took 180 to 230 ms for every one of those terms
-- on the same data, for the reason in the last point below.
--
-- * **One UNION arm per condition, each a bitmap scan of one index**: the
--   trigram index on the title for similarity, word similarity, title prefix
--   and word prefix; the trigram index on the alias for similarity and word
--   similarity; the btree on the alias key for exact and prefix. Not an OR per
--   table: the planner prices each trigram bitmap scan at about 1,600 and a
--   sequential scan of media_items at about 4,300, so four ORed conditions
--   (6,500) "cost more" than reading the table, and it reads the table,
--   running word_similarity on every title: 390 ms for "gta". An OR with an
--   EXISTS over aliases would be worse: one condition no index can drive.
-- * **Aliases are scored from the ones that matched**, grouped once per
--   item, rather than by probing every candidate's aliases afterwards. For a
--   common word that is ten thousand probes saved.
-- * **Short terms skip the arms that cannot help them.** Word similarity on a
--   three-letter term finds nothing the word-prefix arm does not, and costs a
--   scan of every title that contains a common trigram, so the title arm needs
--   four characters of key and the alias arm three; the mid-title word-prefix
--   arm needs two, because "% a%" is most of the catalog.
-- * **`enable_seqscan` is off inside this function**, and that is a
--   deliberate override of the planner, for a reason specific to RLS. The
--   caller is `authenticated` and media_items has Row Level Security, and
--   Postgres does not let a non-leakproof operator such as ILIKE see column
--   statistics through RLS (they could leak what the policy hides). So as the
--   caller, `title ilike 'gta%'` is priced at a flat 4% of the catalog (2,765
--   rows) where the table owner sees 7, and the arm reads the whole table:
--   51 of the 56 ms "gta" took with the setting at its default, and the whole
--   of the old function's 180. Every arm here has an index that serves it,
--   the join back to media_items has its primary key, and the three detail
--   tables theirs, so turning the sequential scan off costs nothing where it
--   was right and removes it where it was wrong. The setting lasts for this
--   function's execution only.
--
-- The query is built with format() and planned on each call with the term as
-- a literal (%L, which is quote_literal, so the term is never SQL), so a
-- skipped arm is a constant false the planner removes and each pattern is
-- priced as itself. Planning takes about 5 ms. The term is capped at 100
-- characters, longer than any title anybody types, so a pasted paragraph
-- cannot become an expensive trigram set.

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
  score real
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
    -- One arm per condition, on purpose; see "Cost" above.
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
        -- An exact key is also a prefix of itself, which is where an
        -- initialism equal to the term lands.
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
    hits as (
      select t.id from title_hits t
      union
      select b.media_item_id from alias_best b
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
          when public.search_key(m.title) = %6$L then 4
          when coalesce(b.igdb_exact, false) then 3
          when m.title ilike %2$L or m.title ilike %3$L or coalesce(b.prefix, false) then 2
          else 1
        end as tier,
        greatest(
          extensions.word_similarity(%1$L, m.title),
          extensions.similarity(m.title, %1$L),
          coalesce(b.closeness, 0)
        ) as closeness
      from hits h
      join public.media_items m on m.id = h.id
      left join alias_best b on b.media_item_id = m.id
      where m.medium = %4$L
    )
    select
      s.id,
      s.title,
      s.year,
      s.cover_image_id,
      s.external_ids,
      g.igdb_id,
      g.developer,
      coalesce(g.genres, md.genres, td.genres, '{}'::text[]),
      coalesce(g.platforms, '{}'::text[]),
      (s.tier + s.closeness)::real
    from scored s
    left join public.game_details g on g.media_item_id = s.id
    left join public.movie_details md on md.media_item_id = s.id
    left join public.tv_details td on td.media_item_id = s.id
    order by s.tier desc, s.closeness desc, s.popularity desc nulls last, s.title asc, s.id asc
    limit %7$s
  $sql$,
    v_term,                         -- 1 the term as typed
    v_escaped || '%',               -- 2 the title starts with it
    '% ' || v_escaped || '%',       -- 3 a word in the title starts with it
    v_medium,                       -- 4
    v_key || '%',                   -- 5 an alias key starts with the term's key
    v_key,                          -- 6 the term's key, for exact matches
    v_limit,                        -- 7
    length(v_key) >= 4,             -- 8 long enough for word similarity on titles
    length(v_key) >= 3,             -- 9 long enough for word similarity on aliases
    length(v_key) >= 2              -- 10 long enough for a word prefix mid-title
  );
end;
$$;

comment on function public.search_games(text, integer, public.medium) is
  'Search one medium''s catalog by title and alias: exact title, then an exact IGDB alternative name (gtav), then a title word or an alias starting with the term (zelda, breath, gta, botw), then similarity; closeness and then popularity break ties. Defaults to games; genres come from whichever extension table holds the row; external_ids is returned as media_items stores it, for the Steam cover fallback.';

-- The drop took the grants; written again as 20260916230000 wrote them.
revoke all on function public.search_games(text, integer, public.medium) from public, anon;
grant execute on function public.search_games(text, integer, public.medium) to authenticated, service_role;

-- ==============================================================================
-- 6. Backfill
-- ==============================================================================
-- Every title already in the catalog gets its initialisms now; the trigger
-- covers every row written from here on. IGDB's alternative names are not
-- backfilled here: they come from IGDB, so they arrive with the next full
-- catalog sync (the PR says so under what to do after merge).
--
-- One statement over the whole catalog, about 69,000 rows on the hosted
-- project. `on conflict do nothing` makes it safe to re-run.

insert into public.media_aliases (media_item_id, alias, source)
select m.id, f.alias, 'initialism'
  from public.media_items m
 cross join lateral pg_catalog.unnest(public.title_initialisms(m.title)) as f(alias)
on conflict do nothing;

analyze public.media_aliases;
