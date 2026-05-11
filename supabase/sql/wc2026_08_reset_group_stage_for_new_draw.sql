-- Reset group-stage data so a new draw (wc2026_03) and fixture generator (wc2026_04) can run cleanly.
-- Run in Supabase SQL editor when you change group assignments or need to regenerate the 72 group matches.
--
-- WARNING: Deletes every prediction row that references a group-stage match, then those matches,
-- then all group_teams rows. Knockout / other stages are not touched.
--
-- After this script:
--   1) Ensure wc2026_02_seed_data includes any new teams (e.g. CD), then
--   2) Run wc2026_03_group_assignments.sql (insert group_teams), then
--   3) Run wc2026_04_all_group_stage_matches.sql

begin;

delete from wc2026.predictions p
using wc2026.matches m
where p.match_id = m.id
  and m.group_id is not null;

delete from wc2026.matches
where group_id is not null;

delete from wc2026.group_teams;

commit;
