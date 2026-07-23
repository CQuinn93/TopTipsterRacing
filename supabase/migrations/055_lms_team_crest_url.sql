-- =============================================================================
-- LMS: store football-data.org crest URLs for team identification in UI
-- =============================================================================

alter table public.lms_teams
  add column if not exists crest_url text;

comment on column public.lms_teams.crest_url is
  'Remote crest URL from football-data.org; used only to identify clubs in-app.';
