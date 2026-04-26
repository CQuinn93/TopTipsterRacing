-- Group team assignments (wc2026 schema).
-- This is the schema-adapted equivalent of legacy group-assignments.sql.

with assignments(group_name, country_code, position) as (
  values
    ('A','US',1), ('A','MX',2), ('A','BR',3), ('A','FR',4),
    ('B','CA',1), ('B','AR',2), ('B','ES',3), ('B','DE',4),
    ('C','IT',1), ('C','NL',2), ('C','PT',3), ('C','JP',4),
    ('D','GB',1), ('D','BE',2), ('D','UY',3), ('D','KR',4),
    ('E','CL',1), ('E','CO',2), ('E','HR',3), ('E','SA',4),
    ('F','EC',1), ('F','DK',2), ('F','AU',3), ('F','SN',4),
    ('G','PY',1), ('G','AT',2), ('G','MA',3), ('G','IR',4),
    ('H','PE',1), ('H','CH',2), ('H','EG',3), ('H','QA',4),
    ('I','JM',1), ('I','CZ',2), ('I','NG',3), ('I','AE',4),
    ('J','CR',1), ('J','SE',2), ('J','GH',3), ('J','IQ',4),
    ('K','NO',1), ('K','TN',2), ('K','TH',3), ('K','NZ',4),
    ('L','FI',1), ('L','CI',2), ('L','CN',3), ('L','TR',4)
)
insert into wc2026.group_teams (group_id, team_id, position)
select g.id, t.id, a.position
from assignments a
join wc2026.groups g on g.group_name = a.group_name
join wc2026.teams t on t.country_code = a.country_code
on conflict (group_id, team_id) do nothing;
