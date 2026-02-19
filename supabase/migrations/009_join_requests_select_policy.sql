-- Allow users to read their own join requests (needed for upsert conflict and for UI).
create policy "Join requests select own"
  on public.competition_join_requests
  for select
  using (auth.uid() = user_id);
