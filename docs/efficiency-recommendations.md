# Efficiency recommendations

Areas where the app can be made more efficient (network, CPU, memory). Ordered by impact vs effort.

---

## Egress (data transfer) – free tier

To keep Supabase egress low:

- **Competitions list** does **not** fetch race days or horses. It only loads `daily_selections` (and participants, competitions). "Your position" there uses an odds-based sum so it can be approximate; **leaderboard** uses full DB points (pos_points + sp_points) when you open a competition.
- **Leaderboard** and **participant-selections** fetch race days (with races + horses) for **one** competition at a time. Horses select includes `pos_points`, `sp_points` (two extra columns); the rest was already loaded.
- **Caches** (AsyncStorage): leaderboard bulk, selections bulk, available races, latest results – reduce repeat fetches when the user stays in the app.

To get **exact** DB points on the competitions list with minimal egress you’d need a **DB-side** solution, e.g. an RPC or view that returns `(competition_id, user_id, total_points)` so the app does one small query instead of pulling all race/horse data.

---

## 1. **Parallelise race-days fetches (high impact, low effort)**

**Current behaviour:** In several places we fetch race days **per competition in sequence**:

- `lib/selectionsBulkCache.ts`: `for (const compId of competitionIds) { await fetchRaceDaysForCompetition(...) }`
- `lib/availableRacesForUser.ts`: same loop
- `lib/resultsTemplateForUser.ts`: same loop

If a user is in 3 competitions, we do 3 sequential round-trips (each of which can hit `competition_race_days`, `race_days`, then `buildRacesForRaceDays` → races + horses). That multiplies latency.

**Improvement:** Fetch all competitions’ race days in parallel with `Promise.all(competitionIds.map(compId => fetchRaceDaysForCompetition(...)))`. Same data, fewer round-trips in wall time.

**Status:** Implemented in this pass.

---

## 2. **Leaderboard: use cache on load (medium impact, low effort)**

**Current behaviour:** The leaderboard screen always fetches fresh data (race days, participants, daily_selections, profiles). It **writes** to `setLeaderboardBulkCache` after load. Participant-selections **reads** that cache when you tap “See selections”.

So opening the leaderboard always does a full fetch, even if you just left it and came back.

**Improvement:** On load, call `getLeaderboardBulkCache(selectedId)` first. If cache exists and is “fresh” (e.g. &lt; 2–5 minutes, or a flag “prefer cache until pull-to-refresh”), render from cache and optionally refetch in the background. Pull-to-refresh continues to force a full fetch. Result: faster repeat visits and fewer DB hits.

---

## 3. **Memoise derived lists in UI (low–medium impact, low effort)**

**Current behaviour:** Some screens recompute derived data on every render:

- **Leaderboard:** `listRows = [...rows].sort((a, b) => a.rank_overall - b.rank_overall)` and `getDailyPoints(r)` run every render. Rows don’t change unless data is reloaded or day tab changes.
- **Selections (My selections view):** `groupedByDay`, `dayGroups`, `courseDayGroups`, `currentGroup` are recomputed every time (reduce + sort + filter).

**Improvement:** Wrap in `useMemo` with the right dependencies (e.g. `listRows` from `rows`, `dayGroups` from `mySelectionsList` / `selectedCourse` / etc.). Reduces work on re-renders (e.g. from tab changes or modal open/close).

---

## 4. **Participant-selections: parallel cache reads (low impact, low effort)**

**Current behaviour:** On cache miss we do a loop over race days with `await getCached(competitionId, participantUserId, d.race_date)` one by one.

**Improvement:** `Promise.all(days.map(d => getCached(...)))` so all cache reads run in parallel. Then build `next` from the results. Small win when cache is cold.

---

## 5. **Avoid refetching when navigating Home → Selections (medium impact, medium effort)**

**Current behaviour:** Home loads “available races” (participations, competitions, race days per comp, daily_selections). Selections (with a competitionId) loads race days and daily_selections for that comp again. So the same competition’s race days and that day’s selections can be fetched twice in quick succession.

**Improvement:** Options (pick one or combine):

- **Shared cache by competition:** e.g. a small in-memory or AsyncStorage cache keyed by `competitionId` (and optionally race_date) for “last fetched race days” and “last fetched selections”. When opening selections with a competitionId, try cache first with a short TTL (e.g. 1–2 min).
- **Pass data via navigation:** When navigating from home to selections, pass race days / selections in params or a global/store so the selections screen can show immediately and only refetch on refresh. More invasive.

---

## 6. **Reduce leaderboard effect that re-sorts rows (low impact, code clarity)**

**Current behaviour:** When `selectedDayIndex` changes, a `useEffect` runs that does `setRows(prev => { ... sort by daily rank, assign rank_daily ... })`. So we keep rank_daily in state and mutate a copy of rows.

**Improvement:** You could derive “current daily rank” in render (or in a useMemo) from `rows` and `selectedDayIndex` instead of storing it in state. That would remove this effect and make the data flow simpler; rank_daily would be computed when needed. Same UX, less state.

---

## 7. **Batch or debounce AsyncStorage writes (low impact)**

**Current behaviour:** After each bulk fetch we do `AsyncStorage.setItem(key, JSON.stringify(...))`. For large payloads (e.g. selections bulk with many comps and race days), the stringify + write can be noticeable.

**Improvement:** Usually not necessary unless profiling shows it. If needed: avoid writing the exact same payload twice in a short window (e.g. compare with last written value or debounce by a few hundred ms). Prefer one write per logical “load” rather than multiple writes for the same key in quick succession.

---

## 8. **Limit / paginate very large lists (only if needed)**

**Current behaviour:** Leaderboard and selections render full lists. For typical competition sizes (tens of participants, a few days) this is fine.

**Improvement:** If you ever have hundreds of rows, consider `FlatList` with a windowed render or pagination so we don’t mount hundreds of row components at once. Not required for current scale.

---

## Summary table

| # | Area | Impact | Effort | Status |
|---|------|--------|--------|--------|
| 1 | Parallelise race-days fetches | High | Low | Done |
| 2 | Leaderboard use cache on load | Medium | Low | Recommended |
| 3 | useMemo for derived lists | Low–Medium | Low | Recommended |
| 4 | Parallel cache reads (participant-selections) | Low | Low | Optional |
| 5 | Shared cache / pass data Home → Selections | Medium | Medium | Optional |
| 6 | Derive rank_daily instead of effect | Low | Low | Optional |
| 7 | Batch/debounce AsyncStorage | Low | Low | Only if profiling shows need |
| 8 | Virtualise/paginate large lists | N/A until scale up | Medium | When needed |
