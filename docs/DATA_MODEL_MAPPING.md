# Data model mapping

This document maps your intended entity model to the current Supabase schema.

## Your model → current tables

| Your entity | Current table(s) | Notes |
|-------------|------------------|--------|
| **Users** | `auth.users` (Supabase) | User identity. |
| **Competition_Users** | `competition_participants` | Bridge: one row per (user, competition). ✓ |
| **Competitions** | `competitions` | ✓ |
| **Courses** | `competition_courses.course` (text) | Course is a label per competition; no separate `courses` table. |
| **Meetings** | Derived | A Meeting = (Competition, Course). Derived from `competition_courses`; a “meeting” is the pair (competition_id, course). Days for that meeting = `race_days` linked via `competition_race_days` where `race_days.course` matches. |
| **Days** | `race_days` | One row per (course, race_date). Linked to competitions via `competition_race_days`. ✓ |
| **Races** | `races` | Belongs to `race_days` (Day). ✓ |
| **Horses** | `horses` | One row per runner in a race (`race_id`). Not a global horse entity; same horse in two races = two rows. |
| **Race_Horses** | `horses` | We model “runner in race” as `horses(race_id, …)`; no separate bridge. |
| **Selections** | `daily_selections` (current) | Currently one row per (competition, user, race_date) with JSON `{ raceId → { runnerId, runnerName, oddsDecimal } }`. Your model: one row per (user, competition, race, horse). See below. |
| **Race_Results** | `races.winner_horse_id`, `place1_horse_id`, …; `race_days.races[].results` | Stored on `races` and in JSON for the app. |

## Selections: aligning with your model

Your rule: **A Selection belongs to 1 User, 1 Competition, 1 Race, 1 Horse.**

The **`selections`** table (migration 015) implements that:

- `selections` (id, user_id, competition_id, race_id, horse_id, odds_decimal, created_at, updated_at)
- Unique on (user_id, competition_id, race_id) so one pick per user per race per competition.

Migration 016 backfills `selections` from existing `daily_selections` JSON. The app can be updated to read/write **`selections`** (and optionally keep writing `daily_selections` for a transition period, or switch fully to `selections`).

## Relationship paths (current schema)

- **Users ↔ Competitions**: `competition_participants`
- **Competitions → Courses**: `competition_courses`
- **Competitions → Days**: `competition_race_days` → `race_days`
- **Courses → Days**: `race_days.course` (days for a course)
- **Days → Races**: `races.race_day_id` → `race_days`
- **Races → Horses**: `horses.race_id` → `races`
- **Users → Selections**: `selections.user_id`
- **Competitions → Selections**: `selections.competition_id`
- **Races → Selections**: `selections.race_id`
- **Horses → Selections**: `selections.horse_id`

## Optional: explicit Meetings table

If you want an explicit **Meetings** table (Competition + Course):

- `meetings` (id, competition_id, course, …)
- `meeting_days` (meeting_id, race_day_id) — or reuse `competition_race_days` by restricting to `race_days.course = meeting.course`

Right now “meeting” is derived from `competition_courses` + `competition_race_days` + `race_days.course`; no schema change required unless you want Meetings as first-class entities.
