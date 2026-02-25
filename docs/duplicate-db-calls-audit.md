# Duplicate / redundant database calls – audit

Summary of where the app may hit the database more than needed.

---

## 1. **selections.tsx – duplicate participants + competitions (when no competitionId)**

**What happens:** When the Selections screen shows "My selections" (no `competitionId`), two separate effects run:

- **Effect 1** (`userId`): Fetches `competition_participants` + `competitions` → sets `userCompetitions`.
- **Effect 2** (`userId`, `competitionId`): When `competitionId` is absent, also fetches `competition_participants` + `competitions` → then calls `getSelectionsBulk(userId, compIds)`.

So the same **participants** and **competitions** queries run twice on mount when you're on the "My selections" list.

**Recommendation:** Fetch participants and competitions once, then use that for both `userCompetitions` and `getSelectionsBulk` (e.g. one effect that loads parts → comps → bulk and sets both `userCompetitions` and bulk/list state).

---

## 2. **selections.tsx – race days for current competition (when competitionId is set)**

**What happens:** When you're in picking mode (e.g. opened from home with `competitionId` + `raceDate`):

- **Effect 3** (`competitionId`): Calls `fetchRaceDaysForCompetition(supabase, competitionId, ...)` to set `raceDays`.

There is no second fetch of race days on this screen in that path (effect 2 is skipped when `competitionId` is set, so `getSelectionsBulk` is not called). So **no duplicate** for race days on the selections screen in picking mode.

---

## 3. **selections.tsx – daily_selections for selected date**

**What happens:** In picking mode, one effect fetches `daily_selections` for `(competitionId, userId, selectedDate)`.

- When you have **no** `competitionId`, you don’t load bulk for that competition, so this fetch is the only source for that day’s selections. **No duplicate.**
- If we ever loaded bulk for the same competition and date elsewhere on this screen, we could derive from bulk instead of refetching; currently we don’t, so this is a single, necessary call.

---

## 4. **Leaderboard – never reads from cache**

**What happens:** The leaderboard screen always fetches fresh data (race days, participants, daily_selections, profiles). It **writes** to `setLeaderboardBulkCache` after loading, which participant-selections then uses.

So leaderboard itself doesn’t duplicate with another screen; it’s a **missed optimization**: we could try `getLeaderboardBulkCache(selectedId)` first and only refetch when cache is missing or stale (e.g. pull-to-refresh).

---

## 5. **competitions.tsx**

**What happens:** One `load()` runs: participants + join_requests in parallel, then competitions for joined comps, then `daily_selections` for positions, then competitions again but only for **pending** comp ids.

Those are two different competition id sets (joined vs pending), so this is **two different queries**, not a duplicate of the same call.

---

## 6. **Home (index) vs Selections**

**What happens:**

- **Home** uses `getAvailableRacesForUser`, which (on cache miss) does: `competition_participants` → `competitions` → `fetchRaceDaysForCompetition` per comp → `daily_selections` for the user.
- **Selections** (no `competitionId`) does: `competition_participants` → `competitions` → `getSelectionsBulk`, and bulk internally does: `daily_selections` + `competition_participants` + `fetchRaceDaysForCompetition` per comp.

So after navigating **Home → Selections**, we can end up doing participants, competitions, race days per comp, and daily_selections again. That’s **overlap across screens** (different caches: availableRaces vs selectionsBulk). Reducing it would mean sharing a cache or a single “user competition data” load; that’s a larger refactor.

---

## 7. **participant-selections.tsx**

**What happens:** It tries `getLeaderboardBulkCache(competitionId)` first. On hit it uses that; on miss it fetches race days and then daily_selections (with per-date cache). So **no duplicate** within this screen.

---

## 8. **access-code.tsx**

Single `profiles.select('username')` on mount. **No duplicate.**

---

## Summary table

| Location              | Duplicate? | Notes |
|-----------------------|-----------|--------|
| selections (no compId)| Yes       | participants + competitions fetched twice (effect 1 and 2). |
| selections (picking)  | No        | Single race-days and single daily_selections fetch. |
| leaderboard           | No        | Could use cache on load to avoid refetch (optimization). |
| competitions         | No        | Two competition queries are for different id sets. |
| participant-selections| No        | Uses leaderboard cache when available. |
| Home vs Selections    | Overlap   | Same kind of data refetched across navigation; different caches. |

---

## Recommended change

- **Fix the clear duplicate:** In `selections.tsx`, when there is no `competitionId`, load participants and competitions once and use that result for both `userCompetitions` and `getSelectionsBulk` (single flow instead of two effects doing the same queries).
