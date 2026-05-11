-- Group team assignments (wc2026 schema) — FIFA World Cup 2026™ group stage draw.
-- Source: official draw (see also https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums )
--
-- Slot order (position 1–4) is used by wc2026_04_all_group_stage_matches.sql to build the six
-- round-robin fixtures per group. After changing this file on an existing database, run
-- wc2026_08_reset_group_stage_for_new_draw.sql then re-run THIS file’s insert block, then
-- wc2026_04_all_group_stage_matches.sql (or run 08 which chains reset + inserts + regenerate).

with assignments(group_name, country_code, position) as (
  values
    -- Group A: Mexico, South Africa, Korea Republic, Czechia
    ('A', 'MX', 1), ('A', 'ZA', 2), ('A', 'KR', 3), ('A', 'CZ', 4),
    -- Group B: Canada, Bosnia and Herzegovina, Qatar, Switzerland
    ('B', 'CA', 1), ('B', 'BA', 2), ('B', 'QA', 3), ('B', 'CH', 4),
    -- Group C: Brazil, Morocco, Haiti, Scotland
    ('C', 'BR', 1), ('C', 'MA', 2), ('C', 'HT', 3), ('C', 'SC', 4),
    -- Group D: USA, Paraguay, Australia, Türkiye
    ('D', 'US', 1), ('D', 'PY', 2), ('D', 'AU', 3), ('D', 'TR', 4),
    -- Group E: Germany, Curaçao, Côte d'Ivoire, Ecuador
    ('E', 'DE', 1), ('E', 'CW', 2), ('E', 'CI', 3), ('E', 'EC', 4),
    -- Group F: Netherlands, Japan, Sweden, Tunisia
    ('F', 'NL', 1), ('F', 'JP', 2), ('F', 'SE', 3), ('F', 'TN', 4),
    -- Group G: Belgium, Egypt, IR Iran, New Zealand
    ('G', 'BE', 1), ('G', 'EG', 2), ('G', 'IR', 3), ('G', 'NZ', 4),
    -- Group H: Spain, Cabo Verde, Saudi Arabia, Uruguay
    ('H', 'ES', 1), ('H', 'CV', 2), ('H', 'SA', 3), ('H', 'UY', 4),
    -- Group I: France, Senegal, Iraq, Norway
    ('I', 'FR', 1), ('I', 'SN', 2), ('I', 'IQ', 3), ('I', 'NO', 4),
    -- Group J: Argentina, Algeria, Austria, Jordan
    ('J', 'AR', 1), ('J', 'DZ', 2), ('J', 'AT', 3), ('J', 'JO', 4),
    -- Group K: Portugal, Congo DR, Uzbekistan, Colombia
    ('K', 'PT', 1), ('K', 'CD', 2), ('K', 'UZ', 3), ('K', 'CO', 4),
    -- Group L: England, Croatia, Ghana, Panama
    ('L', 'GB', 1), ('L', 'HR', 2), ('L', 'GH', 3), ('L', 'PA', 4)
)
insert into wc2026.group_teams (group_id, team_id, position)
select g.id, t.id, a.position
from assignments a
join wc2026.groups g on g.group_name = a.group_name
join wc2026.teams t on t.country_code = a.country_code
on conflict (group_id, team_id) do nothing;
