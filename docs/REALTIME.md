# Supabase Realtime (Leaderboard, Results & LMS)

The **Leaderboard** and **Results** screens subscribe to Realtime updates on the `races` table. When the update-race-results script (or anything else) updates a race (e.g. sets `is_finished` or when horse results are written), the app refetches and the UI updates without the user pulling to refresh.

The **LMS competition** screen subscribes to Realtime updates on `lms_fixtures`. When the matchday sync writes live scores or marks a fixture finished, Fixtures + Standing refetch (debounced) without a manual refresh.

## How it works (Broadcast from DB)

Realtime uses **Broadcast from the database**, not Postgres Changes / table Replication. That means you do **not** need Database → Replication (or a compute upgrade for read replicas).

1. Triggers on `lms_fixtures` and `races` call `realtime.broadcast_changes(...)` on `UPDATE`.
2. Events go to private topics: `lms_fixtures` and `races`.
3. The app joins those topics with `{ config: { private: true } }` after `supabase.realtime.setAuth()`, filters by the ids on the open screen, then debounces ~1.2s and refetches.

Migration: `supabase/migrations/085_realtime_broadcast_topics.sql`.

## Apply the migration

Run migration **085** against your project (CLI or SQL Editor). It:

- Creates RLS on `realtime.messages` so authenticated users can **receive** Broadcast on topics `lms_fixtures` and `races`
- Adds `AFTER UPDATE` triggers that broadcast row changes on those topics

No Dashboard → Replication steps are required.

If the migration is not applied, the app still works; screens just won’t auto-refresh until pull-to-refresh or leaving and re-entering.

## Screens

- **Leaderboard**: Subscribes to topic `races` for the current competition’s race list. Matching updates refetch the leaderboard (debounced ~1.2s).
- **Results**: Same topic `races` for races in the loaded meetings.
- **LMS competition**: Subscribes to topic `lms_fixtures` for the open gameweek’s fixture ids. On a matching update, debounces ~1.2s then force-refetches those fixtures plus participants/picks (live scores and progressive eliminations after sync marks a game finished).

Only rows relevant to the current view trigger a refetch, so client work stays low. The matchday cron remains the only football-data writer; Realtime only notifies open apps.
