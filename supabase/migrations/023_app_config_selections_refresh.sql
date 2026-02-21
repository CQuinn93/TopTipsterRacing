-- App config for client-side refresh hints.
-- pull-races sets selections_refresh_after_utc = 50 min before first race.
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- RLS: allow read for all (app fetches this). Writes via service role (pull-races) bypass RLS.
alter table public.app_config enable row level security;
create policy "App config read" on public.app_config for select using (true);

-- Insert placeholder so pull-races can upsert
insert into public.app_config (key, value) values ('selections_refresh_after_utc', '{"utc": null}')
on conflict (key) do nothing;
