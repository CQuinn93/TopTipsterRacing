# Scripts for Cheltenham Top Tipster

These scripts use [RapidAPI Horse Racing](https://rapidapi.com/ortegalex/api/horse-racing) (`horse-racing.p.rapidapi.com`). **50 requests/day** and **10 per minute** on free tier. Racecards are well released by 5pm; we pull at **5pm and 6pm UK time** (second run is backup). Competitions for the following day must be created before 8pm UK. Cron is in UTC: 17:00, 18:00 = 5pm/6pm GMT; in BST = 6pm/7pm UK.

### Request count per day (example)

- **Pull races (once):** 1× racecards + 1× per race. e.g. 3 meetings × 7 races = **1 + 21 = 22 requests**.
- **Results (every 20 min, 13:00–18:00):** one GET /race/{id} per race when we poll for results = **21 requests** (same 21 races).
- **Total:** **22 + 21 = 43 requests/day**, under the 50/day limit.

**Delay between race-detail calls:** Limit is 10/min, so minimum spacing = 6 seconds. We use **6s** by default (fastest within limit). 21 races → 20 × 6s = **~2 min** for the race-detail phase. Doing “9 then wait a minute” would be slower (only 9/min). Set **`RACE_FETCH_DELAY_MS`** (ms) in env to override; minimum 6000 for 10/min.

## Scripts used by this project

| Script | Purpose | When to run |
|--------|---------|-------------|
| **pull-races.ts** | 1) DB: Competitions where tomorrow ∈ [festival_start_date, festival_end_date]; get their **course** (one per competition). 2) API: One call GET /racecards for tomorrow; filter by those courses. 3) API: One call per race GET /race/{id} for runners (with delay). Each race gets an extra **FAV** option (SP favourite). 4) DB: One bulk upload – upsert race_days, insert races, insert horses, upsert competition_race_days. | **5pm, 6pm UK** – cron `0 17,18 * * *` UTC (5/6 GMT; 6/7 BST). Second run is backup. Competitions for the following day must be created **before 8pm UK** to get races that night. |
| **update-race-results.ts** | Gets from DB the **latest race** where `scheduled_time_utc` + 30 min < now and `is_finished = false`. Calls GET /race/{id}. If no positions yet, exits (retry in 10 min). Updates **horses**: position, sp, is_fav. Sets **races.is_finished = true**. App derives races from races + horses tables. | **30 min after each race**; retry after 10 min if blank – cron every 20 min `*/20 * * * *`. |
| **remove-old-races.ts** | Deletes **race_days** where `race_date` is older than **5 days** (cascade deletes `races` and `horses`). Keeps DB small. | Daily, e.g. **18:00 UTC** – cron `0 18 * * *`. |
| **backfill-fav-selections.ts** | For each race day where the selection deadline (1 hour before first race) has passed, sets any **missing** per-race selections to **FAV** for every participant. Run after deadline so users who didn't pick get the favourite. | **After deadline** – e.g. every 15 min `*/15 * * * *` or once per race day. |

## Database tables (migrations 010–011)

- **race_days**: one row per (course, race_date); course, race_date, first_race_utc. Races derived from races + horses.
- **competition_courses**: competition ↔ courses (admin sets 1+ courses per competition).
- **competition_race_days**: bridge linking competitions to race_days.
- **races**: id, race_day_id, api_race_id, name, scheduled_time_utc, distance, is_handicap, **is_finished** (default false; true when results applied).
- **horses**: id, race_id, api_horse_id, name, jockey, trainer, age, weight, number, last_ran_days_ago, non_runner, form, owner, odds_decimal, **sp**, **position** (finishing position), **is_fav** (true for horse(s) with lowest SP in race), **pos_points**, **sp_points** (scoring, when rules applied).

## Place rules (update-race-results)

- **Handicap** (title contains "Handicap"): if total runners (non_runner = 0) **≥ 16** → store positions 1, 2, 3, **4**; if **< 16** → 1, 2, 3.
- **Not Handicap**: **≥ 15** → 1, 2, 3; **8–14** → 1, 2; **4–7** → 1.

## Environment variables

- **SUPABASE_URL**, **SUPABASE_SERVICE_KEY** (or SUPABASE_SERVICE_ROLE_KEY)
- **RAPIDAPI_KEY** (for pull-races and update-race-results)
- **RACE_FETCH_DELAY_MS** (optional) – delay in ms between each GET /race/{id} in pull-races. Default 6000 (6s = 10/min, fastest). Increase if you hit rate limits.
- **COURSE_FILTER** – ignored; courses are taken from active competitions in the DB (one course per competition).
- **RESEND_API_KEY** (optional) – if set with **PULL_RACES_NOTIFICATION_EMAIL**, pull-races will email a short report after each run (includes **API calls made**; success: courses and races added; skipped: already had data; errors: message). Same key can be used for update-race-results if **UPDATE_RESULTS_NOTIFICATION_EMAIL** is set. Sign up at [resend.com](https://resend.com), create an API key, and add to your env or GitHub Secrets. Emails are sent from `onboarding@resend.dev` (Resend’s test sender). With the test sender, the recipient must be the same email you used to sign up at resend.com; for other addresses, verify a domain in Resend and set the `from` address in the script.
- **UPDATE_RESULTS_NOTIFICATION_EMAIL** (optional) – if set with **RESEND_API_KEY**, update-race-results will email after each run with API calls made, races updated, and status.

## Running locally

```bash
# Pull tomorrow's races (3pm / 6pm / 9pm runs)
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... RAPIDAPI_KEY=... npx tsx scripts/pull-races.ts

# Update results for latest race due (30+ min after start)
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... RAPIDAPI_KEY=... npx tsx scripts/update-race-results.ts

# Remove race_days older than 5 days
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/remove-old-races.ts

# Backfill FAV for users who didn't select before deadline (1h before first race)
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/backfill-fav-selections.ts
```

## GitHub Actions

Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RAPIDAPI_KEY_PULL_RACES`, `RAPIDAPI_KEY_UPDATE_RESULTS`. Optional: `RESEND_API_KEY`, `PULL_RACES_NOTIFICATION_EMAIL`, `UPDATE_RESULTS_NOTIFICATION_EMAIL` to receive email reports (including API call counts) after each run.

- **Pull-races** is capped at **50 API calls per run** (1 racecards + up to 49 race details). Each run’s email reports how many calls were made.
- **Update-race-results** is capped at **2 races per run** (max 32/day over 16 runs). Each run’s email reports API calls made and races updated.

- **17:00, 18:00 UTC** – pull-races (following day) = 5pm, 6pm UK (GMT) / 6pm, 7pm UK (BST). Second run is backup. Competitions for tomorrow must be created before 8pm UK.
- **Every 30 min 13:30–21:00 UTC** – update-race-results (30 min after race + retry).
- **18:00 UTC** – remove-old-races.

## API (RapidAPI Horse Racing)

- **GET /racecards?date=YYYY-MM-DD** – list of races (id_race, title, course, date, distance, …).
- **GET /race/{id_race}** – race detail; **horses**: horse, id_horse, jockey, trainer, age, weight, number, last_ran_days_ago, non_runner, form, owner, odds, sp, **position** (after race).
