# Supabase Realtime (Leaderboard & Results)

The **Leaderboard** and **Results** screens subscribe to Realtime updates on the `races` table. When the update-race-results script (or anything else) updates a race (e.g. sets `is_finished` or when horse results are written), the app refetches and the UI updates without the user pulling to refresh.

## Enable Replication for `races`

For Realtime to receive changes, the table must be in the replication set:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Database** → **Replication**.
3. Under **Supabase Realtime**, find **public.races** (or add it if needed).
4. Ensure **races** is enabled so that `INSERT`/`UPDATE`/`DELETE` events are broadcast.

If Realtime is disabled for a table, the app still works; Leaderboard and Results just won’t auto-refresh until the user pulls to refresh or leaves and re-enters the screen.

## How it works

- **Leaderboard**: Subscribes to `races` when the current competition’s race list is loaded. When any of those races is updated, the leaderboard refetches (debounced ~1.2s).
- **Results**: Subscribes to `races` for the races in the loaded meetings. When any of those races is updated, results refetch (same debounce).

Only races that are relevant to the current view trigger a refetch, so traffic stays low.
