-- All Group Stage Matches for 2026 FIFA World Cup (wc2026 schema)
-- Generates 72 matches from group_teams positions.

do $$
declare
  group_stage_id uuid;
  match_num integer := 1;
  base_date date := '2026-06-11';
  group_names text[] := array['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  group_letter text;
  venue_ids uuid[];
  group_idx integer;
  day_offset integer;
begin
  select id into group_stage_id from wc2026.tournament_stages where stage_name = 'Group Stage';
  select array_agg(id) into venue_ids from wc2026.venues;

  group_idx := 0;
  foreach group_letter in array group_names
  loop
    day_offset := group_idx / 2;

    insert into wc2026.matches (match_number, tournament_stage_id, group_id, home_team_id, away_team_id, venue_id, match_date, status, is_knockout)
    select match_num, group_stage_id, g.id, gt1.team_id, gt2.team_id,
      venue_ids[((match_num - 1) % array_length(venue_ids, 1)) + 1],
      (base_date + (day_offset * 2) + 0)::timestamp + interval '18 hours',
      'scheduled', false
    from wc2026.groups g
    join wc2026.group_teams gt1 on g.id = gt1.group_id and gt1.position = 1
    join wc2026.group_teams gt2 on g.id = gt2.group_id and gt2.position = 2
    where g.group_name = group_letter
    limit 1
    on conflict do nothing;
    match_num := match_num + 1;

    insert into wc2026.matches (match_number, tournament_stage_id, group_id, home_team_id, away_team_id, venue_id, match_date, status, is_knockout)
    select match_num, group_stage_id, g.id, gt3.team_id, gt4.team_id,
      venue_ids[((match_num - 1) % array_length(venue_ids, 1)) + 1],
      (base_date + (day_offset * 2) + 0)::timestamp + interval '22 hours',
      'scheduled', false
    from wc2026.groups g
    join wc2026.group_teams gt3 on g.id = gt3.group_id and gt3.position = 3
    join wc2026.group_teams gt4 on g.id = gt4.group_id and gt4.position = 4
    where g.group_name = group_letter
    limit 1
    on conflict do nothing;
    match_num := match_num + 1;

    insert into wc2026.matches (match_number, tournament_stage_id, group_id, home_team_id, away_team_id, venue_id, match_date, status, is_knockout)
    select match_num, group_stage_id, g.id, gt1.team_id, gt3.team_id,
      venue_ids[((match_num - 1) % array_length(venue_ids, 1)) + 1],
      (base_date + (day_offset * 2) + 4)::timestamp + interval '18 hours',
      'scheduled', false
    from wc2026.groups g
    join wc2026.group_teams gt1 on g.id = gt1.group_id and gt1.position = 1
    join wc2026.group_teams gt3 on g.id = gt3.group_id and gt3.position = 3
    where g.group_name = group_letter
    limit 1
    on conflict do nothing;
    match_num := match_num + 1;

    insert into wc2026.matches (match_number, tournament_stage_id, group_id, home_team_id, away_team_id, venue_id, match_date, status, is_knockout)
    select match_num, group_stage_id, g.id, gt2.team_id, gt4.team_id,
      venue_ids[((match_num - 1) % array_length(venue_ids, 1)) + 1],
      (base_date + (day_offset * 2) + 4)::timestamp + interval '22 hours',
      'scheduled', false
    from wc2026.groups g
    join wc2026.group_teams gt2 on g.id = gt2.group_id and gt2.position = 2
    join wc2026.group_teams gt4 on g.id = gt4.group_id and gt4.position = 4
    where g.group_name = group_letter
    limit 1
    on conflict do nothing;
    match_num := match_num + 1;

    insert into wc2026.matches (match_number, tournament_stage_id, group_id, home_team_id, away_team_id, venue_id, match_date, status, is_knockout)
    select match_num, group_stage_id, g.id, gt1.team_id, gt4.team_id,
      venue_ids[((match_num - 1) % array_length(venue_ids, 1)) + 1],
      (base_date + (day_offset * 2) + 8)::timestamp + interval '18 hours',
      'scheduled', false
    from wc2026.groups g
    join wc2026.group_teams gt1 on g.id = gt1.group_id and gt1.position = 1
    join wc2026.group_teams gt4 on g.id = gt4.group_id and gt4.position = 4
    where g.group_name = group_letter
    limit 1
    on conflict do nothing;
    match_num := match_num + 1;

    insert into wc2026.matches (match_number, tournament_stage_id, group_id, home_team_id, away_team_id, venue_id, match_date, status, is_knockout)
    select match_num, group_stage_id, g.id, gt2.team_id, gt3.team_id,
      venue_ids[((match_num - 1) % array_length(venue_ids, 1)) + 1],
      (base_date + (day_offset * 2) + 8)::timestamp + interval '22 hours',
      'scheduled', false
    from wc2026.groups g
    join wc2026.group_teams gt2 on g.id = gt2.group_id and gt2.position = 2
    join wc2026.group_teams gt3 on g.id = gt3.group_id and gt3.position = 3
    where g.group_name = group_letter
    limit 1
    on conflict do nothing;
    match_num := match_num + 1;

    group_idx := group_idx + 1;
  end loop;
end $$;
