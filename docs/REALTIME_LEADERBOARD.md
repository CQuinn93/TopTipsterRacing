# Supabase Realtime (Leaderboard)

The leaderboard screen subscribes to Postgres changes on the `races` table. When your **update-race-results** script (or any process) updates a race (e.g. sets `is_finished`, or when results are written to `horses` and the race is marked complete), every user with the leaderboard open gets a silent refresh so scores and order update without pulling to refresh.

## Enable in Supabase

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Database** → **Replication** (or **Publications**).
3. Find the `supabase_realtime` publication and ensure the **`races`** table is included (add it if not).
4. Save. No migration needed if the publication already exists; you're just adding `races` to the replicated tables.

Once enabled, the app will receive UPDATE events when `races` rows change and refetch the leaderboard in the background.

## Free tier impact

- **Concurrent connections:** Each user with the leaderboard open holds one Realtime connection. Free tier allows 200; with 100 users you're fine.
- **Messages:** One race update can trigger one refetch per connected user. 7 updates/day × 100 users ≈ 700 messages/day; free tier allows 2M/month.
- **Egress:** Realtime payloads are small; the main egress remains REST (fetching leaderboard data). Realtime adds negligible bandwidth.
