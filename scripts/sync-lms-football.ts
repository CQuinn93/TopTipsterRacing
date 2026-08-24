import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/**
 * Sync Premier League teams + fixtures/results from football-data.org into LMS tables.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   Football_API  (or FOOTBALL_API / FOOTBALL_DATA_API_TOKEN)
 *
 * Optional:
 *   LMS_SEASON=2026/27
 *   FOOTBALL_DATA_SEASON=2026   (API season start year)
 *   LMS_AUTO_SETTLE=true       (default true) settle finished gameweeks
 *
 * Endpoints used (2 calls, within free-tier rate limits):
 *   GET /v4/competitions/PL/teams?season=YYYY
 *   GET /v4/competitions/PL/matches?season=YYYY
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FOOTBALL_API =
  process.env.Football_API ??
  process.env.FOOTBALL_API ??
  process.env.FOOTBALL_DATA_API_TOKEN;

const LMS_SEASON = process.env.LMS_SEASON ?? '2026/27';
const API_SEASON = Number(process.env.FOOTBALL_DATA_SEASON ?? '2026');
const AUTO_SETTLE = (process.env.LMS_AUTO_SETTLE ?? 'true').toLowerCase() !== 'false';

const API_BASE = 'https://api.football-data.org/v4';

type FdTeam = {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
};

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  homeTeam: { id: number; name: string; shortName?: string; tla?: string };
  awayTeam: { id: number; name: string; shortName?: string; tla?: string };
  score?: {
    fullTime?: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
  };
};

type LmsFixtureStatus = 'scheduled' | 'live' | 'finished';

/**
 * Pick home/away goals from football-data score objects.
 * Finished → full-time only. Live → best current score available.
 */
function pickMatchGoals(
  score: FdMatch['score'],
  status: LmsFixtureStatus
): { home: number | null; away: number | null } {
  if (status === 'scheduled') return { home: null, away: null };

  const ft = score?.fullTime;
  const rt = score?.regularTime;
  const ht = score?.halfTime;

  if (status === 'finished') {
    return { home: ft?.home ?? null, away: ft?.away ?? null };
  }

  // Live: API may expose running score on fullTime, regularTime, or halfTime.
  const home = ft?.home ?? rt?.home ?? ht?.home ?? null;
  const away = ft?.away ?? rt?.away ?? ht?.away ?? null;
  return { home, away };
}

type LmsTeamRow = {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  external_id: number | null;
};

/**
 * Turn a club name into a URL-safe slug for matching / storing in `lms_teams.slug`.
 * Example: "Manchester United" → "manchester-united"
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Map football-data.org match status strings into our LMS fixture statuses.
 * Only `finished` matches are used for settlement / scoring.
 */
function mapMatchStatus(status: string): LmsFixtureStatus {
  switch (status) {
    case 'FINISHED':
      return 'finished';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    default:
      return 'scheduled';
  }
}

/**
 * Call the football-data.org API with the free-tier auth token and return JSON.
 * This is the only place we talk to the external football API (2 calls total per sync).
 */
async function fdGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'X-Auth-Token': FOOTBALL_API ?? '',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Main LMS sync job. Runs end-to-end:
 * 1) sync Premier League teams into `lms_teams`
 * 2) sync fixtures/results into `lms_fixtures` + refresh `lms_gameweeks`
 * 3) auto-assign missed picks after the deadline
 * 4) settle finished gameweeks when every included fixture is complete
 *
 * Designed to be triggered by cron-job.org → GitHub Actions.
 */
async function main() {
  // ---------------------------------------------------------------------------
  // Step 0: Validate env + create Supabase service client
  // ---------------------------------------------------------------------------
  console.log('[lms-sync] Env check:', {
    SUPABASE_URL: SUPABASE_URL ? 'set' : 'MISSING',
    SUPABASE_SERVICE_KEY: SUPABASE_KEY ? 'set' : 'MISSING',
    Football_API: FOOTBALL_API ? 'set' : 'MISSING',
    LMS_SEASON,
    API_SEASON,
    AUTO_SETTLE,
  });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!FOOTBALL_API) {
    console.error('Set Football_API (football-data.org token) in env / GitHub Secrets');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------------------------------------------------------------------------
  // Step 1: Ensure PL teams exist in `lms_teams` (insert missing only)
  // ---------------------------------------------------------------------------
  console.log('[lms-sync] Fetching PL teams…');
  const teamsPayload = await fdGet<{ teams: FdTeam[] }>(
    `/competitions/PL/teams?season=${API_SEASON}`
  );
  const fdTeams = teamsPayload.teams ?? [];
  console.log(`[lms-sync] API teams: ${fdTeams.length}`);

  // Load current DB teams so we can skip existing clubs instead of rewriting them
  const { data: existingTeams, error: teamsErr } = await supabase
    .from('lms_teams')
    .select('id, name, short_name, slug, external_id');
  if (teamsErr) throw teamsErr;
  const teams = (existingTeams ?? []) as LmsTeamRow[];

  // Lookup maps: match API clubs to DB clubs by external_id, slug, or name
  const byExternal = new Map<number, LmsTeamRow>();
  const bySlug = new Map<string, LmsTeamRow>();
  const byName = new Map<string, LmsTeamRow>();
  for (const t of teams) {
    if (t.external_id != null) byExternal.set(t.external_id, t);
    bySlug.set(t.slug, t);
    byName.set(t.name.trim().toLowerCase(), t);
  }

  // Insert missing Premier League clubs only — season roster is fixed, so skip
  // existing rows (avoids 20 redundant updates every sync). Still link external_id
  // once if a club was matched by slug/name without it.
  // (UI icons come from assets/Icons via TeamColourChip — not remote crest URLs)
  let teamsInserted = 0;
  let teamsSkipped = 0;
  let teamsLinked = 0;
  for (const ft of fdTeams) {
    const slug = slugify(ft.shortName || ft.name);
    const shortName = (ft.tla || ft.shortName || ft.name).slice(0, 3).toUpperCase();
    const existing =
      byExternal.get(ft.id) ??
      bySlug.get(slug) ??
      bySlug.get(slugify(ft.name)) ??
      byName.get(ft.name.trim().toLowerCase());

    if (existing) {
      if (existing.external_id === ft.id) {
        teamsSkipped += 1;
        continue;
      }
      // Matched by slug/name but missing/wrong API id — one-time link only
      const { error } = await supabase
        .from('lms_teams')
        .update({ external_id: ft.id })
        .eq('id', existing.id);
      if (error) throw error;
      existing.external_id = ft.id;
      byExternal.set(ft.id, existing);
      teamsLinked += 1;
      continue;
    }

    // New club → insert
    const { data, error } = await supabase
      .from('lms_teams')
      .insert({
        name: ft.name,
        short_name: shortName,
        slug,
        external_id: ft.id,
      })
      .select('id, name, short_name, slug, external_id')
      .single();
    if (error) throw error;
    const row = data as LmsTeamRow;
    byExternal.set(ft.id, row);
    bySlug.set(row.slug, row);
    byName.set(row.name.trim().toLowerCase(), row);
    teamsInserted += 1;
  }
  console.log(
    `[lms-sync] Teams inserted: ${teamsInserted}; linked: ${teamsLinked}; skipped (already present): ${teamsSkipped}`
  );

  // Remove leftover teams not in this PL season response (seed / old clubs)
  const keepExternalIds = new Set(fdTeams.map((t) => t.id));
  const { data: teamsAfterUpsert, error: afterErr } = await supabase
    .from('lms_teams')
    .select('id, external_id');
  if (afterErr) throw afterErr;

  const staleIds = ((teamsAfterUpsert ?? []) as { id: string; external_id: number | null }[])
    .filter((t) => t.external_id == null || !keepExternalIds.has(t.external_id))
    .map((t) => t.id);

  if (staleIds.length) {
    // Clean related rows first so team deletes don't leave dangling FK references
    await supabase
      .from('lms_fixtures')
      .delete()
      .or(`home_team_id.in.(${staleIds.join(',')}),away_team_id.in.(${staleIds.join(',')})`);
    await supabase.from('lms_picks').delete().in('team_id', staleIds);
    await supabase.from('lms_used_teams').delete().in('team_id', staleIds);
    const { error: delErr } = await supabase.from('lms_teams').delete().in('id', staleIds);
    if (delErr) throw delErr;
    console.log(`[lms-sync] Removed stale / non-PL teams: ${staleIds.length}`);
  }

  // Rebuild external_id → uuid map for linking fixtures to home/away teams
  const { data: allTeams, error: allTeamsErr } = await supabase
    .from('lms_teams')
    .select('id, external_id');
  if (allTeamsErr) throw allTeamsErr;
  const teamIdByExternal = new Map<number, string>();
  for (const t of (allTeams ?? []) as { id: string; external_id: number | null }[]) {
    if (t.external_id != null) teamIdByExternal.set(t.external_id, t.id);
  }

  // ---------------------------------------------------------------------------
  // Step 2: Sync PL matches into fixtures + keep gameweeks in sync
  // ---------------------------------------------------------------------------
  console.log('[lms-sync] Fetching PL matches…');
  const matchesPayload = await fdGet<{ matches: FdMatch[] }>(
    `/competitions/PL/matches?season=${API_SEASON}`
  );
  // Only keep valid Premier League matchdays (GW1–GW38)
  const matches = (matchesPayload.matches ?? []).filter(
    (m) => m.matchday != null && m.matchday >= 1 && m.matchday <= 38
  );
  console.log(`[lms-sync] API matches (GW1–38): ${matches.length}`);

  // Group matches by matchday so we can set each gameweek's first kick-off / deadline
  const byMatchday = new Map<number, FdMatch[]>();
  for (const m of matches) {
    const md = m.matchday as number;
    if (!byMatchday.has(md)) byMatchday.set(md, []);
    byMatchday.get(md)!.push(m);
  }

  // Load existing gameweeks for this LMS season
  const { data: existingGws, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number, status, starts_at, deadline_at')
    .eq('season', LMS_SEASON);
  if (gwErr) throw gwErr;
  type GwRow = {
    id: string;
    number: number;
    status: string;
    starts_at: string | null;
    deadline_at: string | null;
  };
  const gwByNumber = new Map<number, GwRow>();
  for (const g of existingGws ?? []) {
    gwByNumber.set(g.number as number, {
      id: g.id as string,
      number: g.number as number,
      status: g.status as string,
      starts_at: (g.starts_at as string | null) ?? null,
      deadline_at: (g.deadline_at as string | null) ?? null,
    });
  }

  // Ensure GW1–GW38 rows exist; refresh starts_at / deadline_at / status when not yet complete
  for (let n = 1; n <= 38; n++) {
    const mdMatches = byMatchday.get(n) ?? [];
    const kickoffs = mdMatches
      .map((m) => new Date(m.utcDate).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    // Earliest kick-off = gameweek start; deadline = 20 minutes before that
    const startsAt =
      kickoffs.length > 0
        ? new Date(kickoffs[0]).toISOString()
        : new Date(Date.UTC(2026, 7, 22, 11, 30) + (n - 1) * 7 * 24 * 3600 * 1000).toISOString();
    const deadlineAt = new Date(new Date(startsAt).getTime() - 20 * 60 * 1000).toISOString();

    const existing = gwByNumber.get(n);
    if (existing) {
      if (existing.status !== 'complete') {
        const anyLive = mdMatches.some((m) => mapMatchStatus(m.status) === 'live');
        const allFinished =
          mdMatches.length > 0 && mdMatches.every((m) => mapMatchStatus(m.status) === 'finished');
        const now = Date.now();
        let status = existing.status;
        // Don't mark complete here — settlement owns that transition
        if (!allFinished) {
          if (anyLive || new Date(startsAt).getTime() <= now) status = 'live';
          else status = 'upcoming';
        }
        const { error } = await supabase
          .from('lms_gameweeks')
          .update({
            starts_at: startsAt,
            deadline_at: deadlineAt,
            status,
          })
          .eq('id', existing.id);
        if (error) throw error;
        existing.status = status;
        existing.starts_at = startsAt;
        existing.deadline_at = deadlineAt;
      }
    } else {
      // First sync of this gameweek → create the row
      const { data, error } = await supabase
        .from('lms_gameweeks')
        .insert({
          season: LMS_SEASON,
          starts_at: startsAt,
          deadline_at: deadlineAt,
          number: n,
          status: 'upcoming',
        })
        .select('id, number, status, starts_at, deadline_at')
        .single();
      if (error) throw error;
      gwByNumber.set(n, {
        id: data.id as string,
        number: data.number as number,
        status: data.status as string,
        starts_at: (data.starts_at as string | null) ?? startsAt,
        deadline_at: (data.deadline_at as string | null) ?? deadlineAt,
      });
    }
  }

  // One read of existing fixtures → skip unchanged rows (biggest gateway saver)
  const { data: existingFixtures, error: existingFxErr } = await supabase
    .from('lms_fixtures')
    .select('id, external_id, gameweek_id, home_team_id, away_team_id, kickoff_at, status, home_goals, away_goals');
  if (existingFxErr) throw existingFxErr;

  type ExistingFx = {
    id: string;
    external_id: number | null;
    gameweek_id: string;
    home_team_id: string;
    away_team_id: string;
    kickoff_at: string;
    status: string;
    home_goals: number | null;
    away_goals: number | null;
  };
  const fxByExternal = new Map<number, ExistingFx>();
  const fxByPair = new Map<string, ExistingFx>();
  for (const fx of (existingFixtures ?? []) as ExistingFx[]) {
    if (fx.external_id != null) fxByExternal.set(fx.external_id, fx);
    fxByPair.set(`${fx.gameweek_id}:${fx.home_team_id}:${fx.away_team_id}`, fx);
  }

  const sameGoals = (a: number | null, b: number | null) =>
    (a == null && b == null) || a === b;

  // Upsert only matches that changed (or are new)
  let fixturesUpserted = 0;
  let fixturesUnchanged = 0;
  let fixturesSkipped = 0;
  for (const m of matches) {
    const md = m.matchday as number;
    const gw = gwByNumber.get(md);
    if (!gw) {
      fixturesSkipped += 1;
      continue;
    }
    const homeId = teamIdByExternal.get(m.homeTeam.id);
    const awayId = teamIdByExternal.get(m.awayTeam.id);
    if (!homeId || !awayId) {
      console.warn(
        `[lms-sync] Missing team mapping for match ${m.id}: ${m.homeTeam.name} vs ${m.awayTeam.name}`
      );
      fixturesSkipped += 1;
      continue;
    }

    const status = mapMatchStatus(m.status);
    const { home: homeGoals, away: awayGoals } = pickMatchGoals(m.score, status);

    const row = {
      // Intentionally omit excluded_from_lms / excluded_reason / excluded_at / excluded_by
      // so admin exclusions survive sync upserts.
      gameweek_id: gw.id,
      home_team_id: homeId,
      away_team_id: awayId,
      kickoff_at: m.utcDate,
      status,
      home_goals: homeGoals,
      away_goals: awayGoals,
      external_id: m.id,
    };

    const existingFx =
      fxByExternal.get(m.id) ?? fxByPair.get(`${gw.id}:${homeId}:${awayId}`);

    if (
      existingFx &&
      existingFx.gameweek_id === row.gameweek_id &&
      existingFx.home_team_id === row.home_team_id &&
      existingFx.away_team_id === row.away_team_id &&
      existingFx.kickoff_at === row.kickoff_at &&
      existingFx.status === row.status &&
      sameGoals(existingFx.home_goals, row.home_goals) &&
      sameGoals(existingFx.away_goals, row.away_goals) &&
      existingFx.external_id === row.external_id
    ) {
      fixturesUnchanged += 1;
      continue;
    }

    if (existingFx) {
      const { error: updErr } = await supabase.from('lms_fixtures').update(row).eq('id', existingFx.id);
      if (updErr) throw updErr;
    } else {
      const { error } = await supabase.from('lms_fixtures').upsert(row, {
        onConflict: 'external_id',
        ignoreDuplicates: false,
      });
      if (error) {
        const { error: insErr } = await supabase.from('lms_fixtures').insert(row);
        if (insErr) throw insErr;
      }
    }
    fixturesUpserted += 1;
  }
  console.log(
    `[lms-sync] Fixtures written: ${fixturesUpserted}; unchanged: ${fixturesUnchanged}; skipped: ${fixturesSkipped}`
  );

  // ---------------------------------------------------------------------------
  // Step 3: After deadline → auto-assign missed picks
  // Step 3b: Progressive eliminate when a pick's fixture has finished
  // Step 4: When all included fixtures are finished → settle the gameweek
  // Only touch GWs that are live / past deadline — not all 38 upcoming weeks.
  // ---------------------------------------------------------------------------
  let autoAssigned = 0;
  let progressiveScored = 0;
  let progressiveEliminated = 0;
  let settled = 0;
  let gwsProcessed = 0;
  let gwsSkippedUpcoming = 0;
  const nowMs = Date.now();

  for (const gw of gwByNumber.values()) {
    if (gw.status === 'complete') continue;

    const deadlineMs = gw.deadline_at ? new Date(gw.deadline_at).getTime() : NaN;
    const startsMs = gw.starts_at ? new Date(gw.starts_at).getTime() : NaN;
    const pastDeadline = Number.isFinite(deadlineMs) && nowMs >= deadlineMs;
    const startedOrLive =
      gw.status === 'live' || (Number.isFinite(startsMs) && nowMs >= startsMs);

    // Future upcoming weeks: nothing to auto-assign / apply / settle yet
    if (!pastDeadline && !startedOrLive) {
      gwsSkippedUpcoming += 1;
      continue;
    }

    gwsProcessed += 1;

    // Auto-assign only after the pick deadline has passed
    if (pastDeadline) {
      const { data: assignRes, error: assignErr } = await supabase.rpc(
        'lms_auto_assign_missed_picks',
        { p_gameweek_id: gw.id }
      );
      if (assignErr) {
        console.warn(`[lms-sync] Auto-assign GW${gw.number} failed:`, assignErr.message);
      } else {
        const n = Number((assignRes as { assigned?: number })?.assigned ?? 0);
        if (n > 0) {
          autoAssigned += n;
          console.log(`[lms-sync] Auto-assigned ${n} pick(s) for GW${gw.number}`);
        }
      }
    }

    if (!AUTO_SETTLE) continue;

    // Mid-week: score finished fixtures and eliminate losers immediately
    const { data: applyRes, error: applyErr } = await supabase.rpc(
      'lms_apply_finished_pick_results',
      { p_gameweek_id: gw.id }
    );
    if (applyErr) {
      console.warn(`[lms-sync] Progressive apply GW${gw.number} failed:`, applyErr.message);
    } else {
      const scored = Number((applyRes as { scored?: number })?.scored ?? 0);
      const elim = Number((applyRes as { eliminated?: number })?.eliminated ?? 0);
      progressiveScored += scored;
      progressiveEliminated += elim;
      if (scored > 0) {
        console.log(
          `[lms-sync] Progressive GW${gw.number}: scored ${scored}, eliminated ${elim}`
        );
      }
    }

    // One fixture status read (was two HEAD count requests per GW)
    const { data: fxStatuses, error: fxStatusErr } = await supabase
      .from('lms_fixtures')
      .select('status')
      .eq('gameweek_id', gw.id)
      .eq('excluded_from_lms', false);
    if (fxStatusErr) throw fxStatusErr;
    const statuses = (fxStatuses ?? []) as { status: string }[];
    if (statuses.length < 1) continue;
    if (statuses.some((f) => f.status !== 'finished')) continue;

    // Winner/rollover, no-picks, set GW status = complete
    const { data: settleRes, error: settleErr } = await supabase.rpc('lms_settle_gameweek_internal', {
      p_gameweek_id: gw.id,
    });
    if (settleErr) {
      console.warn(`[lms-sync] Settle GW${gw.number} failed:`, settleErr.message);
      continue;
    }
    const ok = (settleRes as { success?: boolean })?.success;
    if (ok) {
      settled += 1;
      console.log(`[lms-sync] Settled GW${gw.number}`);
    } else {
      console.warn(`[lms-sync] Settle GW${gw.number} response:`, settleRes);
    }
  }

  console.log('[lms-sync] Done.', {
    teamsInserted,
    teamsLinked,
    teamsSkipped,
    fixturesUpserted,
    fixturesUnchanged,
    fixturesSkipped,
    gwsProcessed,
    gwsSkippedUpcoming,
    autoAssigned,
    progressiveScored,
    progressiveEliminated,
    settled,
  });
}

/**
 * Entrypoint wrapper: run `main()` and exit with a non-zero code if anything throws.
 */
main().catch((e) => {
  console.error('[lms-sync] Fatal:', e);
  process.exit(1);
});
