-- pgTAP tests for supabase/migrations/20260923110000_search_aliases.sql.
-- Run with: supabase test db
--
-- What is under test, in order: the aliases table and who may read or write
-- it; search_key and title_initialisms as pure functions; the trigger that
-- keeps initialisms in step with titles; and search_games, which is the point
-- of all of it: "gta" finds Grand Theft Auto first, "zelda" finds every Legend
-- of Zelda, "breath" finds Breath of the Wild, "botw" hits the initialism, and
-- an unrelated title stays out. The row also carries `external_ids` now, for
-- the Steam cover fallback, and the drop-and-create that adds it has to put
-- back the grants and both `set` clauses.
--
-- The fixtures carry rating counts above nine billion, past anything IGDB has
-- recorded, so that on a database that also holds the real mirrored catalog
-- they win every popularity tie-break and the ordering assertions still hold.
-- Where an assertion is about the fixtures, it filters to their ids; where it
-- is genuinely about the whole result ("the first four are all Grand Theft
-- Auto"), it says so, and it holds against the real catalog as well.

begin;
select plan(65);

-- Fixtures --------------------------------------------------------------------
-- Ids in the ...-0000000027xx range, so they cannot meet another suite's.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000027a', 'search-a@example.com');

insert into public.media_items (id, medium, title, year, metadata) values
  ('00000000-0000-0000-0000-0000000027f1', 'game', 'Grand Theft Auto V', 2013,
   '{"total_rating_count": 9000009000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f2', 'game', 'Grand Theft Auto: San Andreas', 2004,
   '{"total_rating_count": 9000008000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f3', 'game', 'Grand Theft Auto IV', 2008,
   '{"total_rating_count": 9000007000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f4', 'game', 'Grand Theft Auto', 1997,
   '{"total_rating_count": 9000001000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f5', 'game', 'The Legend of Zelda', 1986,
   '{"total_rating_count": 9000006000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f6', 'game', 'The Legend of Zelda: Breath of the Wild', 2017,
   '{"total_rating_count": 9000009500}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f7', 'game', 'The Legend of Zelda: Ocarina of Time', 1998,
   '{"total_rating_count": 9000008500}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f8', 'game', 'Zelda II: The Adventure of Link', 1987,
   '{"total_rating_count": 9000002000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027f9', 'game', 'Breath of Fire', 1993,
   '{"total_rating_count": 9000003000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027fa', 'game', 'Gran Turismo 7', 2022,
   '{"total_rating_count": 9000004000}'::jsonb),
  ('00000000-0000-0000-0000-0000000027fb', 'game', 'Hades', 2020,
   '{"total_rating_count": 9000005000}'::jsonb),
  -- A film with a game's title, for the medium filter.
  ('00000000-0000-0000-0000-0000000027fc', 'movie', 'Grand Theft Auto', 1977,
   '{"vote_count": 9000000100}'::jsonb);

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000027f1', 927001, '{Shooter}', '{PC}'),
  ('00000000-0000-0000-0000-0000000027f6', 927006, '{Adventure}', '{"Nintendo Switch"}');

-- What the catalog mirror writes from IGDB's alternative_names.
insert into public.media_aliases (media_item_id, alias, source) values
  ('00000000-0000-0000-0000-0000000027f1', 'GTA 5', 'igdb'),
  ('00000000-0000-0000-0000-0000000027f6', '塞尔达传说 旷野之息', 'igdb');

-- The table -------------------------------------------------------------------

-- 1
select has_table('public', 'media_aliases', 'media_aliases exists');

-- 2
select col_is_pk('public', 'media_aliases', array['media_item_id', 'source', 'alias'],
  'the primary key includes the source, so each source owns its own rows');

-- 3
select ok(
  (select relrowsecurity from pg_class where oid = 'public.media_aliases'::regclass),
  'RLS is on for media_aliases'
);

-- 4
select throws_ok(
  $$ insert into public.media_aliases (media_item_id, alias, source)
     values ('00000000-0000-0000-0000-0000000027fb', 'Hades One', 'tmdb') $$,
  '23514',
  null,
  'a source other than igdb or initialism is refused'
);

-- 5
select throws_ok(
  $$ insert into public.media_aliases (media_item_id, alias, source)
     values ('00000000-0000-0000-0000-0000000027fb', '   ', 'igdb') $$,
  '23514',
  null,
  'a blank alias is refused'
);

-- 6
select is(
  (select alias_key from public.media_aliases
    where media_item_id = '00000000-0000-0000-0000-0000000027f1' and alias = 'GTA 5' and source = 'igdb'),
  'gta5',
  'alias_key is generated from the alias: lower case, no spaces'
);

-- 7
select ok(
  pg_get_indexdef('public.media_aliases_alias_trgm'::regclass) ~ 'gin \(alias (extensions\.)?gin_trgm_ops\)',
  'a trigram GIN index serves similarity on the alias'
);

-- 8
select ok(
  pg_get_indexdef('public.media_aliases_alias_key'::regclass) ~ 'btree \(alias_key text_pattern_ops\)',
  'a text_pattern_ops btree serves exact and prefix matches on the key'
);

-- search_key --------------------------------------------------------------------

-- 9
select is(public.search_key('GTA V'), 'gtav', 'search_key: GTA V is gtav');
-- 10
select is(public.search_key('gta-v'), 'gtav', 'search_key: gta-v is gtav too');
-- 11
select is(public.search_key('Halo: Reach'), 'haloreach', 'search_key drops the colon and the space');
-- 12
select is(public.search_key('Baldur’s Gate 3'), 'baldursgate3', 'search_key drops a curly apostrophe');
-- 13
select is(public.search_key('塞尔达传说 旷野之息'), '塞尔达传说旷野之息', 'search_key keeps letters in another script');

-- title_initialisms -------------------------------------------------------------

-- 14
select is(public.title_initialisms('Grand Theft Auto V'), array['GTA V', 'GTA 5'],
  'Grand Theft Auto V gives GTA V and GTA 5; GTAV and GTA5 are the same keys');
-- 15
select is(public.title_initialisms('The Legend of Zelda: Breath of the Wild'),
  array['BOTW', 'TLOZ BOTW', 'LOZ BOTW'],
  'a subtitle is its own abbreviation, and joins the main title with and without The');
-- 16
select is(public.title_initialisms('Grand Theft Auto: San Andreas'), array['GTA SA'],
  'SA is too short alone but joins the main title');
-- 17
select is(public.title_initialisms('The Legend of Zelda'), array['TLOZ', 'LOZ'],
  'a leading The gives a second form without it');
-- 18
select is(public.title_initialisms('Red Dead Redemption 2'), array['RDR 2'],
  'an Arabic numeral is kept whole and spaced');
-- 19
select is(public.title_initialisms('Super Mario 3D World'), array['SM 3D W'],
  'a word that starts with a digit is kept whole');
-- 20
select is(public.title_initialisms('Final Fantasy VII'), array['FF VII', 'FF 7'],
  'two letters and a numeral qualify, with the Roman numeral also in Arabic');
-- 21
select is(public.title_initialisms('Half-Life 2'), array['HL 2'],
  'a hyphen splits words');
-- 22
select is(public.title_initialisms('I Am Setsuna'), array['IAS'],
  'a leading I is a word, not a numeral');
-- 23
select is(public.title_initialisms('Hades II'), '{}'::text[],
  'one letter and a numeral is too short to be an abbreviation');
-- 24
select is(public.title_initialisms('Hades'), '{}'::text[], 'a one-word title has none');
-- 25
select is(public.title_initialisms('ゼルダの伝説'), '{}'::text[], 'a title in another script has none');
-- 26
select is(public.title_initialisms(null), '{}'::text[], 'null has none');

-- The trigger ---------------------------------------------------------------------

-- 27
select results_eq(
  $$ select alias from public.media_aliases
      where media_item_id = '00000000-0000-0000-0000-0000000027f1' and source = 'initialism'
      order by alias $$,
  $$ values ('GTA 5'::text), ('GTA V') $$,
  'inserting a catalog row derives its initialisms'
);

-- 28
select is(
  (select count(*) from public.media_aliases
    where media_item_id = '00000000-0000-0000-0000-0000000027f1' and alias = 'GTA 5'),
  2::bigint,
  'the same text from IGDB and from the initialism is two rows, one per source'
);

create temp table search_aliases_before as
  select ctid::text as row_at from public.media_aliases
   where media_item_id = '00000000-0000-0000-0000-0000000027f1' and source = 'initialism';

update public.media_items set year = 2014 where id = '00000000-0000-0000-0000-0000000027f1';

-- 29
select set_eq(
  $$ select ctid::text as row_at from public.media_aliases
      where media_item_id = '00000000-0000-0000-0000-0000000027f1' and source = 'initialism' $$,
  $$ select row_at from search_aliases_before $$,
  'an update that leaves the title alone rewrites no alias row'
);

update public.media_items set title = 'Grand Theft Auto IV: The Lost and Damned'
 where id = '00000000-0000-0000-0000-0000000027f3';

-- 30
select results_eq(
  $$ select alias from public.media_aliases
      where media_item_id = '00000000-0000-0000-0000-0000000027f3' and source = 'initialism'
      order by alias $$,
  $$ values ('GTA 4 TLAD'::text), ('GTA IV TLAD'), ('TLAD') $$,
  'a title change replaces the initialisms with the new title''s'
);

insert into public.media_aliases (media_item_id, alias, source) values
  ('00000000-0000-0000-0000-0000000027f3', 'GTA IV', 'igdb');
update public.media_items set title = 'Grand Theft Auto IV'
 where id = '00000000-0000-0000-0000-0000000027f3';

-- 31
select results_eq(
  $$ select alias, source from public.media_aliases
      where media_item_id = '00000000-0000-0000-0000-0000000027f3'
      order by source, alias $$,
  $$ values ('GTA IV'::text, 'igdb'::text), ('GTA 4', 'initialism'), ('GTA IV', 'initialism') $$,
  'and never touches the igdb rows, which belong to the mirror'
);

delete from public.media_items where id = '00000000-0000-0000-0000-0000000027fb';

-- 32
select is(
  (select count(*) from public.media_aliases where media_item_id = '00000000-0000-0000-0000-0000000027fb'),
  0::bigint,
  'deleting a catalog row takes its aliases with it'
);

insert into public.media_items (id, medium, title, year, metadata) values
  ('00000000-0000-0000-0000-0000000027fb', 'game', 'Hades', 2020,
   '{"total_rating_count": 9000005000}'::jsonb);

-- One fixture on Steam and without an IGDB cover, the case the external_ids
-- column exists for. Every other fixture keeps the default empty object.
update public.media_items set external_ids = '{"steam": 1145360}'::jsonb
 where id = '00000000-0000-0000-0000-0000000027fb';

-- search_games: shape and safety ----------------------------------------------------

-- 33
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_games'),
  1::bigint,
  'still exactly one search_games'
);

-- 34
select is(
  pg_get_function_result('public.search_games(text,integer,public.medium)'::regprocedure),
  'TABLE(media_item_id uuid, title text, year smallint, cover_image_id text, external_ids jsonb, igdb_id integer, developer text, genres text[], platforms text[], score real, person_match text)',
  'it returns the row it did before plus external_ids, the Steam cover fallback''s input (and person_match since 20261013100000_movie_screens.sql)'
);

-- 35
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.search_games(text,integer,public.medium)'::regprocedure),
  false,
  'search_games is still security invoker'
);

-- 36
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.search_games(text,integer,public.medium)'::regprocedure)
    @> array['search_path=public, extensions'],
  'its search_path is still pinned'
);

-- 37
select ok(
  not has_function_privilege('anon', 'public.search_games(text,integer,public.medium)', 'execute')
  and has_function_privilege('authenticated', 'public.search_games(text,integer,public.medium)', 'execute')
  and has_function_privilege('service_role', 'public.search_games(text,integer,public.medium)', 'execute'),
  'grants unchanged: signed-in users and the service role, never anon'
);

-- 38
select ok(
  not has_function_privilege('anon', 'public.search_key(text)', 'execute')
  and not has_function_privilege('anon', 'public.title_initialisms(text)', 'execute')
  and not has_function_privilege('anon', 'public.media_items_sync_initialisms()', 'execute'),
  'none of the new functions is on the anonymous surface'
);

-- Act as a signed-in user -------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000027a","role":"authenticated"}';

-- 39
select ok(
  (select count(*) from public.media_aliases where media_item_id = '00000000-0000-0000-0000-0000000027f6') >= 4,
  'a signed-in user can read aliases, like the rest of the catalog'
);

-- 40
select throws_ok(
  $$ insert into public.media_aliases (media_item_id, alias, source)
     values ('00000000-0000-0000-0000-0000000027f6', 'Zelda BotW', 'igdb') $$,
  '42501',
  null,
  'but cannot write one: the mirror and the trigger are the only writers'
);

-- "gta" ------------------------------------------------------------------------------

-- 41
select results_eq(
  $$ select s.media_item_id from public.search_games('gta', 100) s
      where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' $$,
  $$ values ('00000000-0000-0000-0000-0000000027f1'::uuid),
            ('00000000-0000-0000-0000-0000000027f2'::uuid),
            ('00000000-0000-0000-0000-0000000027f3'::uuid),
            ('00000000-0000-0000-0000-0000000027f4'::uuid) $$,
  '"gta": the four Grand Theft Auto games, all through an initialism (GTA V, GTA SA, GTA IV, GTA), ordered by popularity, and nothing else of the fixtures'
);

-- 42
select ok(
  (select bool_and(s.title like 'Grand Theft Auto%')
     from (select title from public.search_games('gta', 4)) s),
  '"gta": the first four results are all Grand Theft Auto games, fixtures or not'
);

-- 43
select ok(
  not exists (select 1 from public.search_games('gta', 100) s
               where s.media_item_id in ('00000000-0000-0000-0000-0000000027fa',
                                         '00000000-0000-0000-0000-0000000027fb',
                                         '00000000-0000-0000-0000-0000000027fc')),
  '"gta": Gran Turismo, Hades, and the film of the same name stay out'
);

-- 44
select ok(
  (select s.score >= 3 from public.search_games('gta 5', 100) s
    where s.media_item_id = '00000000-0000-0000-0000-0000000027f1')
  and (select s.score >= 2 and s.score <= 3 from public.search_games('gta', 100) s
        where s.media_item_id = '00000000-0000-0000-0000-0000000027f4'),
  'an exact IGDB alias ranks in the tier above the prefixes; an initialism equal to the term ranks with them'
);

-- 45
select is(
  (select s.media_item_id from public.search_games('GTAV', 100) s
    where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' limit 1),
  '00000000-0000-0000-0000-0000000027f1'::uuid,
  '"GTAV", written compact, meets the initialism "GTA V" by key'
);

-- 46
select is(
  (select s.media_item_id from public.search_games('gta 5', 1) s),
  '00000000-0000-0000-0000-0000000027f1'::uuid,
  '"gta 5" finds GTA V through its Arabic form'
);

-- 47
select is(
  (select s.media_item_id from public.search_games('Grand Theft Auto V', 1) s),
  '00000000-0000-0000-0000-0000000027f1'::uuid,
  'the exact title is still first'
);

-- "zelda" -----------------------------------------------------------------------------

-- 48
select set_eq(
  $$ select s.media_item_id from public.search_games('zelda', 100) s
      where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' $$,
  $$ values ('00000000-0000-0000-0000-0000000027f5'::uuid),
            ('00000000-0000-0000-0000-0000000027f6'::uuid),
            ('00000000-0000-0000-0000-0000000027f7'::uuid),
            ('00000000-0000-0000-0000-0000000027f8'::uuid) $$,
  '"zelda": every Legend of Zelda title, with or without a subtitle, and Zelda II'
);

-- 49
select results_eq(
  $$ select s.media_item_id from public.search_games('zelda', 100) s
      where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' $$,
  $$ values ('00000000-0000-0000-0000-0000000027f6'::uuid),
            ('00000000-0000-0000-0000-0000000027f7'::uuid),
            ('00000000-0000-0000-0000-0000000027f5'::uuid),
            ('00000000-0000-0000-0000-0000000027f8'::uuid) $$,
  '"zelda": all contain the word, so popularity orders them, Breath of the Wild first'
);

-- 50
select ok(
  (select bool_and(s.score >= 2 and s.score <= 3)
     from public.search_games('zelda', 100) s
    where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%'),
  '"zelda": each is a word-prefix match, in the prefix tier'
);

-- "breath" ----------------------------------------------------------------------------

-- 51
select is(
  (select s.media_item_id from public.search_games('breath', 1) s),
  '00000000-0000-0000-0000-0000000027f6'::uuid,
  '"breath": Breath of the Wild, a word inside the title, comes first'
);

-- 52
select results_eq(
  $$ select s.media_item_id from public.search_games('breath', 100) s
      where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' $$,
  $$ values ('00000000-0000-0000-0000-0000000027f6'::uuid),
            ('00000000-0000-0000-0000-0000000027f9'::uuid) $$,
  '"breath": Breath of Fire as well, and no other fixture'
);

-- "botw" -------------------------------------------------------------------------------

-- 53
select is(
  (select s.media_item_id from public.search_games('botw', 100) s
    where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' limit 1),
  '00000000-0000-0000-0000-0000000027f6'::uuid,
  '"botw" hits the initialism derived from the subtitle (the fixture has no IGDB alias to help it)'
);

-- 54
select ok(
  not exists (select 1 from public.search_games('botw', 100) s
               where s.media_item_id in ('00000000-0000-0000-0000-0000000027f9',
                                         '00000000-0000-0000-0000-0000000027fb')),
  '"botw": Breath of Fire and Hades stay out'
);

-- Other names and edges --------------------------------------------------------------

-- 55
select is(
  (select s.media_item_id from public.search_games('塞尔达传说', 1) s),
  '00000000-0000-0000-0000-0000000027f6'::uuid,
  'an IGDB alias in another script is found by its start'
);

-- 56
select results_eq(
  $$ select s.media_item_id from public.search_games('loz', 100) s
      where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' $$,
  $$ values ('00000000-0000-0000-0000-0000000027f6'::uuid),
            ('00000000-0000-0000-0000-0000000027f7'::uuid),
            ('00000000-0000-0000-0000-0000000027f5'::uuid) $$,
  '"loz" is the 1986 original''s initialism and the start of LOZ BOTW and LOZ OOT; a guessed initialism is no closer than those, so popularity orders the three'
);

-- 57
select ok(
  not exists (select 1 from public.search_games('loz', 100) s
               where s.media_item_id = '00000000-0000-0000-0000-0000000027f8'),
  '"loz" does not reach Zelda II, whose title has no Legend of Zelda in it'
);

-- 58
select results_eq(
  $$ select s.media_item_id from public.search_games('gta', 20, 'movie') s
      where s.media_item_id::text like '00000000-0000-0000-0000-0000000027%' $$,
  $$ values ('00000000-0000-0000-0000-0000000027fc'::uuid) $$,
  'asked for films, "gta" finds the film through its own initialism and none of the games'
);

-- 59
select is(
  (select count(*) from public.search_games('%_%')),
  0::bigint,
  'a term of nothing but punctuation matches nothing, and LIKE wildcards are not wildcards'
);

-- 60
select is(
  (select count(*) from public.search_games('gta', 2)),
  2::bigint,
  'p_limit is still honoured'
);

-- 61
select is(
  (select count(*) from public.search_games('   ')),
  0::bigint,
  'a blank query still returns nothing'
);

-- The cover fallback's column -----------------------------------------------------------

-- 62
select results_eq(
  $$ select s.cover_image_id, s.external_ids from public.search_games('Hades') s
      where s.media_item_id = '00000000-0000-0000-0000-0000000027fb' $$,
  $$ values (null::text, '{"steam": 1145360}'::jsonb) $$,
  'a hit with no IGDB cover carries the Steam id its cover falls back to'
);

-- 63
select is(
  (select s.external_ids from public.search_games('gta', 100) s
    where s.media_item_id = '00000000-0000-0000-0000-0000000027f1'),
  '{}'::jsonb,
  'a hit with no external ids returns an empty object, not null'
);

-- 64
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.search_games(text,integer,public.medium)'::regprocedure)
    @> array['enable_seqscan=off'],
  'the drop took the enable_seqscan setting too, and the create put it back'
);

-- Signed out --------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 65
select is(
  (select count(*) from public.media_aliases),
  0::bigint,
  'anon reads no aliases: select is granted, no policy lets a row through'
);

reset role;

select * from finish();
rollback;
