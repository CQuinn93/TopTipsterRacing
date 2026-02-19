-- Allow the pull-races script (and update-race-results, remove-old-races) to write race data.
-- Scripts should use SUPABASE_SERVICE_KEY (service role key) which bypasses RLS.
-- If using a key subject to RLS, these policies allow the writes.

-- race_days: insert + update (upsert)
create policy "Race days insert" on public.race_days for insert with check (true);
create policy "Race days update" on public.race_days for update using (true);

-- races: insert, update, delete
create policy "Races insert" on public.races for insert with check (true);
create policy "Races update" on public.races for update using (true);
create policy "Races delete" on public.races for delete using (true);

-- horses: insert, update, delete
create policy "Horses insert" on public.horses for insert with check (true);
create policy "Horses update" on public.horses for update using (true);
create policy "Horses delete" on public.horses for delete using (true);

-- competition_race_days: insert (for linking after pull)
create policy "Competition race days insert" on public.competition_race_days for insert with check (true);
