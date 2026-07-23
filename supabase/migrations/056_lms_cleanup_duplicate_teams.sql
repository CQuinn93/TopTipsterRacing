-- =============================================================================
-- LMS: remove duplicate / non–Premier League teams
-- =============================================================================
-- Seed rows have external_id null. API sync rows have football-data.org ids.
-- Keep only synced PL clubs; remap FKs onto keepers where possible.
-- =============================================================================

-- Remap fixtures home -> keeper (by name / short_name / slug)
update public.lms_fixtures f
set home_team_id = keeper.id
from public.lms_teams orphan
join public.lms_teams keeper
  on keeper.external_id is not null
 and (
      lower(trim(orphan.name)) = lower(trim(keeper.name))
   or lower(trim(orphan.short_name)) = lower(trim(keeper.short_name))
   or orphan.slug = keeper.slug
 )
where f.home_team_id = orphan.id
  and orphan.external_id is null
  and not exists (
    select 1 from public.lms_fixtures x
    where x.gameweek_id = f.gameweek_id
      and x.home_team_id = keeper.id
      and x.away_team_id = f.away_team_id
      and x.id <> f.id
  );

update public.lms_fixtures f
set away_team_id = keeper.id
from public.lms_teams orphan
join public.lms_teams keeper
  on keeper.external_id is not null
 and (
      lower(trim(orphan.name)) = lower(trim(keeper.name))
   or lower(trim(orphan.short_name)) = lower(trim(keeper.short_name))
   or orphan.slug = keeper.slug
 )
where f.away_team_id = orphan.id
  and orphan.external_id is null
  and not exists (
    select 1 from public.lms_fixtures x
    where x.gameweek_id = f.gameweek_id
      and x.home_team_id = f.home_team_id
      and x.away_team_id = keeper.id
      and x.id <> f.id
  );

-- Drop fixtures still tied to non-API teams
delete from public.lms_fixtures f
using public.lms_teams t
where (f.home_team_id = t.id or f.away_team_id = t.id)
  and t.external_id is null;

-- Remap picks
update public.lms_picks p
set team_id = keeper.id
from public.lms_teams orphan
join public.lms_teams keeper
  on keeper.external_id is not null
 and (
      lower(trim(orphan.name)) = lower(trim(keeper.name))
   or lower(trim(orphan.short_name)) = lower(trim(keeper.short_name))
   or orphan.slug = keeper.slug
 )
where p.team_id = orphan.id
  and orphan.external_id is null
  and not exists (
    select 1 from public.lms_picks x
    where x.competition_id = p.competition_id
      and x.user_id = p.user_id
      and x.gameweek_id = p.gameweek_id
      and x.id <> p.id
  );

delete from public.lms_picks p
using public.lms_teams t
where p.team_id = t.id
  and t.external_id is null;

-- Remap used_teams
update public.lms_used_teams u
set team_id = keeper.id
from public.lms_teams orphan
join public.lms_teams keeper
  on keeper.external_id is not null
 and (
      lower(trim(orphan.name)) = lower(trim(keeper.name))
   or lower(trim(orphan.short_name)) = lower(trim(keeper.short_name))
   or orphan.slug = keeper.slug
 )
where u.team_id = orphan.id
  and orphan.external_id is null
  and not exists (
    select 1 from public.lms_used_teams x
    where x.competition_id = u.competition_id
      and x.user_id = u.user_id
      and x.team_id = keeper.id
  );

delete from public.lms_used_teams u
using public.lms_teams t
where u.team_id = t.id
  and t.external_id is null;

-- Delete all non-synced teams (duplicates + non-PL leftovers)
delete from public.lms_teams
where external_id is null;
