-- =============================================================================
-- Allow competition creators / Owners to read LMS competition data via RLS.
-- Without this, non-participant managers get empty shells from client selects.
-- =============================================================================

-- Competitions
drop policy if exists "lms_competitions_select_participant" on public.lms_competitions;
create policy "lms_competitions_select_participant" on public.lms_competitions
  for select to authenticated
  using (
    public.lms_is_competition_member(id)
    or public.lms_has_competition_join_request(id)
    or public.lms_can_manage_competition(id)
  );

-- Participants
drop policy if exists "lms_participants_select_same_comp" on public.lms_participants;
create policy "lms_participants_select_same_comp" on public.lms_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.lms_is_competition_member(competition_id)
    or public.lms_can_manage_competition(competition_id)
  );

-- Picks
drop policy if exists "lms_picks_select_same_comp" on public.lms_picks;
create policy "lms_picks_select_same_comp" on public.lms_picks
  for select to authenticated
  using (
    public.lms_is_competition_member(competition_id)
    or public.lms_can_manage_competition(competition_id)
  );

-- Used teams
drop policy if exists "lms_used_teams_select_own_or_same" on public.lms_used_teams;
create policy "lms_used_teams_select_own_or_same" on public.lms_used_teams
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.lms_is_competition_member(competition_id)
    or public.lms_can_manage_competition(competition_id)
  );

-- Join requests: own rows, or manager of that competition
drop policy if exists "lms_join_requests_select_own" on public.lms_join_requests;
create policy "lms_join_requests_select_own" on public.lms_join_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.lms_can_manage_competition(competition_id)
  );

-- Team pool: members or managers
drop policy if exists "lms_competition_teams_select" on public.lms_competition_teams;
create policy "lms_competition_teams_select"
  on public.lms_competition_teams for select to authenticated
  using (
    public.lms_is_competition_member(competition_id)
    or public.lms_can_manage_competition(competition_id)
  );
