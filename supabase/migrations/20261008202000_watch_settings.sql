-- Where the user watches: the region and the streaming services.
-- docs/design/movies-brief.md, "Data model" ("The settings row (region,
-- provider ids) named in media-brief.md is now a V0 prerequisite for
-- movies"); docs/design/media-brief.md decision 3 and question 8; the
-- onboarding brief's "Where do you watch?", the movies analog of the
-- platforms step.
--
-- The settings row already exists: it is the profile. profiles.platforms
-- (20261007120000_onboarding_backend.sql) is the games answer to "where do
-- you play", written by the onboarding and read by the deck; this is the films
-- answer to "where do you watch", written by the same flow and read by the
-- finder, the Watchlist's "On my services" and the calendar. Two columns on
-- the row every account has from its first second, through the update policy
-- that already lets the owner and nobody else write it, rather than a second
-- table with a second policy and a row that has to be created.
--
--   watch_region        the market availability and release dates are read
--                       in, an ISO 3166-1 alpha-2 code. 'US' by default: the
--                       one region the TMDB mirror stores (tmdb-sync
--                       --regions US) and the default suggestion_candidates
--                       already uses. The app reads the device's locale and
--                       confirms it in one line (onboarding brief, inference 2).
--   watch_provider_ids  the services the user pays for or uses, as
--                       watch_providers.provider_id (TMDB's JustWatch ids, the
--                       numbers suggestion_candidates' p_provider_ids takes).
--                       Empty means not answered, or skipped: the finder then
--                       says where each pick streams and offers "Pick your
--                       services".
--
-- No foreign key and no trigger ties the ids to watch_providers, the choice
-- profiles.platforms made for the same reason: the directory is a mirror the
-- nightly sync rewrites, and a service it drops for a night must not make every
-- later write to the profile fail. The picker offers only what the directory
-- lists.
--
-- Visibility. profiles is readable by every signed-in user (the social layer
-- reads usernames), so these are as visible as profiles.platforms, which that
-- migration judged the kind of fact a public profile shows; the group pick of
-- V2 reads the union of the people present's services, which needs them
-- readable. If that changes, all three columns move to an owner-only table
-- together.

alter table public.profiles
  add column watch_region text not null default 'US'
    constraint profiles_watch_region_check check (watch_region ~ '^[A-Z]{2}$'),
  add column watch_provider_ids integer[] not null default '{}'
    constraint profiles_watch_provider_ids_check check (
      array_position(watch_provider_ids, null) is null
      and 0 < all (watch_provider_ids)
      and cardinality(watch_provider_ids) <= 100
    );

comment on column public.profiles.watch_region is
  'The market the user watches in, ISO 3166-1 alpha-2 in capitals: which region''s availability, release dates and certifications the movie reads use. US by default, the one region the TMDB mirror stores today.';
comment on column public.profiles.watch_provider_ids is
  'The streaming services the user has, as watch_providers.provider_id. Empty means not answered or skipped. The silent filter of the finder and the Watchlist''s "On my services"; a flatrate, free or ads offer in watch_region counts.';
