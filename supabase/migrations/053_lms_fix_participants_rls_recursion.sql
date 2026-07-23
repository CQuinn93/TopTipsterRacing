-- =============================================================================
-- Fix RLS infinite recursion on lms_participants (42P17)
-- =============================================================================
-- Policy "lms_participants_select_same_comp" queried lms_participants inside
-- its own USING clause, which re-triggered the same policy.
-- Fix: check membership via SECURITY DEFINER helpers that bypass RLS.
-- =============================================================================

create or replace function public.lms_is_competition_member(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lms_participants
    where competition_id = p_competition_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.lms_has_competition_join_request(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lms_join_requests
    where competition_id = p_competition_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.lms_is_competition_member(uuid) from public;
revoke all on function public.lms_has_competition_join_request(uuid) from public;
grant execute on function public.lms_is_competition_member(uuid) to authenticated;
grant execute on function public.lms_has_competition_join_request(uuid) to authenticated;

-- Competitions: member or pending join request
drop policy if exists "lms_competitions_select_participant" on public.lms_competitions;
create policy "lms_competitions_select_participant" on public.lms_competitions
  for select to authenticated
  using (
    public.lms_is_competition_member(id)
    or public.lms_has_competition_join_request(id)
  );

-- Participants: own row, or same competition via helper (no self-select)
drop policy if exists "lms_participants_select_same_comp" on public.lms_participants;
create policy "lms_participants_select_same_comp" on public.lms_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.lms_is_competition_member(competition_id)
  );

-- Picks / used teams: same competition membership
drop policy if exists "lms_picks_select_same_comp" on public.lms_picks;
create policy "lms_picks_select_same_comp" on public.lms_picks
  for select to authenticated
  using (public.lms_is_competition_member(competition_id));

drop policy if exists "lms_used_teams_select_own_or_same" on public.lms_used_teams;
create policy "lms_used_teams_select_own_or_same" on public.lms_used_teams
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.lms_is_competition_member(competition_id)
  );
