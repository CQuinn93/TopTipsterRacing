-- View: competitions the current user has joined (one row per competition).
-- Use from app to load "My Competitions" in one query.
create or replace view public.user_competitions as
select
  c.id as competition_id,
  c.name,
  c.status,
  c.festival_start_date,
  c.festival_end_date,
  cp.display_name
from public.competitions c
join public.competition_participants cp on cp.competition_id = c.id
where cp.user_id = auth.uid();

grant select on public.user_competitions to authenticated;
