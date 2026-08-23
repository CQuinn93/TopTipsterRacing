# Supabase Realtime (Leaderboard, Results & LMS)

The **Leaderboard** and **Results** screens subscribe to Realtime updates on the `races` table. When the update-race-results script (or anything else) updates a race (e.g. sets `is_finished` or when horse results are written), the app refetches and the UI updates without the user pulling to refresh.

The **LMS competition** screen subscribes to Realtime updates on `lms_fixtures`. When the matchday sync writes live scores or marks a fixture finished, Fixtures + Standing refetch (debounced) without a manual refresh.

## Enable Replication for `races`

For Realtime to receive changes, the table must be in the replication set:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Database** → **Replication**.
3. Under **Supabase Realtime**, find **public.races** (or add it if needed).
4. Ensure **races** is enabled so that `INSERT`/`UPDATE`/`DELETE` events are broadcast.

If Realtime is disabled for a table, the app still works; Leaderboard and Results just won’t auto-refresh until the user pulls to refresh or leaves and re-enters the screen.

## Enable Replication for `lms_fixtures`

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Database** → **Replication**.
3. Under **Supabase Realtime**, find **public.lms_fixtures** (or add it).
4. Ensure **lms_fixtures** is enabled so `UPDATE` events are broadcast.

Without this publication, LMS still works; Fixtures / Standing just won’t auto-update until pull-to-refresh or leaving and re-entering the competition.

## How it works

- **Leaderboard**: Subscribes to `races` when the current competition’s race list is loaded. When any of those races is updated, the leaderboard refetches (debounced ~1.2s).
- **Results**: Subscribes to `races` for the races in the loaded meetings. When any of those races is updated, results refetch (same debounce).
- **LMS competition**: Subscribes to `lms_fixtures` for the open gameweek’s fixture ids. On a matching `UPDATE`, debounces ~1.2s then force-refetches those fixtures plus participants/picks (so live scores and progressive eliminations appear after the sync that marks a game finished).

Only rows relevant to the current view trigger a refetch, so traffic stays low. The matchday cron remains the only football-data writer; Realtime only notifies open apps.
