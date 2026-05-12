# WC2026 (Football) — internal map

## Routes (`app/(wc2026)/`)

| Area | Path | Role |
|------|------|------|
| Tabs shell | `(wc2026)/(tabs)/` | Home, Selections, Competitions, Results, Fixtures (hidden) |
| Ante post hub | `ante-post-navigation` | Stage list / locks → group + KO prediction screens |
| KO predictions | `round-of-32-predictions`, `round-of-16-predictions`, … | Ante post score entry by round |
| Match Day Tips | `match-day-tips` | Live picks (R32+): 1X2, goals, BTTS |
| Results / points | `*-results`, `points` | Read-only / scoring views |

Auth admin (racing + global): `(auth)/admin`. WC football competitions admin: `(auth)/admin-wc-football`.

## Services (`features/wc2026/services/`)

| Service | Data source |
|---------|-------------|
| `lib/supabase.ts` → `wcSupabase` | PostgREST `wc2026` schema (`matches`, `predictions`, …) |
| `fixtures.ts` | `wc2026.matches` (+ cache) |
| `predictions.ts` | `wc2026.predictions` (`ante_post` \| `live`) |
| `async-predictions.ts` | AsyncStorage drafts + lock flag; sync via `batch-save-predictions.ts` |
| `football-competitions.ts` | `public.wc_football_*` RPCs + `wc2026.football_*` tables |
| `tournament-gates.ts` | `wc2026.tournament_flags` + local group completion |
| `football-leaderboard.ts` | `public.wc_football_leaderboard` RPC |
| `match-day-tips.ts` | `wc2026.matches` + `predictions` live columns |

## Supabase (`wc2026` schema)

- Reference: `teams`, `venues`, `groups`, `tournament_stages`, `matches`
- Picks: `predictions` (unique `user_id, match_number, prediction_type`); shared across all WC football competitions
- Social: `football_competitions`, `football_competition_participants` (single join per user per competition)
- Ops: `tournament_flags` (e.g. match day unlock)

Public RPCs (called with root `supabase` client): `wc_football_create_competition`, `wc_football_join_competition`, `wc_football_list_my_competitions`, `wc_football_leaderboard`, `wc_admin_set_tournament_flag`.
