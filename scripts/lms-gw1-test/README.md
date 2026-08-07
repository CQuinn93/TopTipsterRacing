# LMS GW1 short test scripts

Run in the **Supabase SQL Editor**. Pause LMS sync while testing.

| Order | Script | What it does |
|-------|--------|----------------|
| 0 | `00_gw1_lock_deadline.sql` | Move `deadline_at` into the past + auto-assign missed picks |
| 1 | `01_gw1_midweek_results.sql` | Write scores on first 5 fixtures + progressive eliminate |
| 2 | `02_gw1_finish_and_settle.sql` | Finish rest + settle week (`complete` → GW2 picks) |
| 3 | `03_reset_gw1_test.sql` | Clear mock data |

## How the live deadline works

There is **no** `closed` status column for picks.

- `lms_gameweeks.deadline_at` = first kick-off − 20 minutes  
- App / RPCs compare `now()` to that timestamp  
- When past deadline → submit pick fails (`deadline_passed`); UI shows “picks closed”  
- Sync then runs `lms_auto_assign_missed_picks` for anyone without a pick  

Script **00** only changes `deadline_at` (and runs that auto-assign), same as the clock passing the cutoff.

After that, **new join requests are blocked** (start-gameweek deadline passed). Rejoin codes are unchanged.

## How results work

Sync updates existing `lms_fixtures` (`home_goals`, `away_goals`, `status = finished`).  
That drives progressive elimination, then full settle when every fixture is finished.
