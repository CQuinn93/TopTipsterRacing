-- Diagnostics for wc2026 group stage load.
-- Adapted from legacy diagnose script for wc2026 schema.

select 'stages' as check_type, id, stage_name, stage_order, is_knockout
from wc2026.tournament_stages
where stage_name = 'Group Stage';

select 'groups_count' as check_type, count(*) as total_groups
from wc2026.groups;

select 'group_teams_count' as check_type, count(*) as total_group_team_rows
from wc2026.group_teams;

select 'matches_count' as check_type, count(*) as total_matches
from wc2026.matches;

select 'group_stage_matches' as check_type, count(*) as total_group_stage_matches
from wc2026.matches m
join wc2026.tournament_stages ts on ts.id = m.tournament_stage_id
where ts.stage_name = 'Group Stage';

select 'missing_match_numbers' as check_type, gs.match_number
from generate_series(1, 72) as gs(match_number)
left join wc2026.matches m on m.match_number = gs.match_number
where m.id is null
order by gs.match_number;

select 'duplicate_match_numbers' as check_type, match_number, count(*) as copies
from wc2026.matches
group by match_number
having count(*) > 1
order by match_number;

select 'fixtures_preview' as check_type,
       m.match_number,
       g.group_name,
       ht.country_code as home_team,
       at.country_code as away_team,
       v.city as venue_city,
       m.match_date
from wc2026.matches m
left join wc2026.groups g on g.id = m.group_id
left join wc2026.teams ht on ht.id = m.home_team_id
left join wc2026.teams at on at.id = m.away_team_id
left join wc2026.venues v on v.id = m.venue_id
order by m.match_number
limit 30;
