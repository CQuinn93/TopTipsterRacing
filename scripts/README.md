# Scripts for Cheltenham Top Tipster

These scripts use [RapidAPI Horse Racing](https://rapidapi.com/ortegalex/api/horse-racing) (`horse-racing.p.rapidapi.com`). **50 requests/day** and **10 per minute** on free tier. Most racecards are available by 2pm; we pull at **3pm, 6pm and 9pm UK time** so users have until **8pm UK** to create competitions for the following day (after 8pm UK, creation for tomorrow is blocked and the 9pm run won’t include them). Cron is in UTC: 15:00, 18:00, 21:00 = 3pm/6pm/9pm GMT; in BST = 4pm/7pm/10pm UK.

### Request count per day (example)

- **Pull races (once):** 1× racecards + 1× per race. e.g. 3 meetings × 7 races = **1 + 21 = 22 requests**.
- **Results (every 20 min, 13:00–18:00):** one GET /race/{id} per race when we poll for results = **21 requests** (same 21 races).
- **Total:** **22 + 21 = 43 requests/day**, under the 50/day limit.

**Delay between race-detail calls:** Limit is 10/min, so minimum spacing = 6 seconds. We use **6s** by default (fastest within limit). 21 races → 20 × 6s = **~2 min** for the race-detail phase. Doing “9 then wait a minute” would be slower (only 9/min). Set **`RACE_FETCH_DELAY_MS`** (ms) in env to override; minimum 6000 for 10/min.

## Scripts used by this project

| Script | Purpose | When to run |
|--------|---------|-------------|
| **pull-races.ts** | 1) DB: Competitions where tomorrow ∈ [festival_start_date, festival_end_date]; get their **course** (one per competition). 2) API: One call GET /racecards for tomorrow; filter by those courses. 3) API: One call per race GET /race/{id} for runners (with delay). Each race gets an extra **FAV** option (SP favourite). 4) DB: One bulk upload – upsert race_days, insert races, insert horses, upsert competition_race_days. | **3pm, 6pm, 9pm UK** – cron `0 15,18,21 * * *` UTC (3/6/9 GMT; 4/7/10 BST). Competitions for the following day must be created **before 8pm UK** to get races that night. |
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
- **RESEND_API_KEY** (optional) – if set with **PULL_RACES_NOTIFICATION_EMAIL**, pull-races will email a short report after each run (success: courses and races added; skipped: already had data; errors: message). Sign up at [resend.com](https://resend.com), create an API key, and add both to your env or GitHub Secrets. Emails are sent from `onboarding@resend.dev` (Resend’s test sender). With the test sender, the recipient must be the same email you used to sign up at resend.com; for other addresses, verify a domain in Resend and set the `from` address in the script.

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

Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RAPIDAPI_KEY_PULL_RACES`. Optional: `RESEND_API_KEY`, `PULL_RACES_NOTIFICATION_EMAIL` (your email) to receive a report after each pull-races run.

- **15:00, 18:00, 21:00 UTC** – pull-races (following day) = 3pm, 6pm, 9pm UK (GMT) / 4pm, 7pm, 10pm UK (BST). Competitions for tomorrow must be created before 8pm UK.
- **Every 20 min** – update-race-results (30 min after race + retry).
- **18:00 UTC** – remove-old-races.

## API (RapidAPI Horse Racing)

- **GET /racecards?date=YYYY-MM-DD** – list of races (id_race, title, course, date, distance, …).
- **GET /race/{id_race}** – race detail; **horses**: horse, id_horse, jockey, trainer, age, weight, number, last_ran_days_ago, non_runner, form, owner, odds, sp, **position** (after race).
