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
  crest?: string;
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
  };
};

type LmsTeamRow = {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  external_id: number | null;
  crest_url: string | null;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapMatchStatus(status: string): 'scheduled' | 'live' | 'finished' {
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

async function main() {
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

  // --- Teams ---
  console.log('[lms-sync] Fetching PL teams…');
  const teamsPayload = await fdGet<{ teams: FdTeam[] }>(
    `/competitions/PL/teams?season=${API_SEASON}`
  );
  const fdTeams = teamsPayload.teams ?? [];
  console.log(`[lms-sync] API teams: ${fdTeams.length}`);

  const { data: existingTeams, error: teamsErr } = await supabase
    .from('lms_teams')
    .select('id, name, short_name, slug, external_id, crest_url');
  if (teamsErr) throw teamsErr;
  const teams = (existingTeams ?? []) as LmsTeamRow[];

  const byExternal = new Map<number, LmsTeamRow>();
  const bySlug = new Map<string, LmsTeamRow>();
  for (const t of teams) {
    if (t.external_id != null) byExternal.set(t.external_id, t);
    bySlug.set(t.slug, t);
  }

  let teamsUpserted = 0;
  for (const ft of fdTeams) {
    const slug = slugify(ft.shortName || ft.name);
    const shortName = (ft.tla || ft.shortName || ft.name).slice(0, 3).toUpperCase();
    const crestUrl = ft.crest?.trim() || null;
    const existing = byExternal.get(ft.id) ?? bySlug.get(slug) ?? bySlug.get(slugify(ft.name));

    if (existing) {
      const { error } = await supabase
        .from('lms_teams')
        .update({
          name: ft.name,
          short_name: shortName,
          slug: existing.slug || slug,
          external_id: ft.id,
          crest_url: crestUrl,
        })
        .eq('id', existing.id);
      if (error) throw error;
      existing.external_id = ft.id;
      existing.name = ft.name;
      existing.short_name = shortName;
      existing.crest_url = crestUrl;
      byExternal.set(ft.id, existing);
      bySlug.set(existing.slug, existing);
    } else {
      const { data, error } = await supabase
        .from('lms_teams')
        .insert({
          name: ft.name,
          short_name: shortName,
          slug,
          external_id: ft.id,
          crest_url: crestUrl,
        })
        .select('id, name, short_name, slug, external_id, crest_url')
        .single();
      if (error) throw error;
      const row = data as LmsTeamRow;
      byExternal.set(ft.id, row);
      bySlug.set(row.slug, row);
    }
    teamsUpserted += 1;
  }
  console.log(`[lms-sync] Teams upserted/updated: ${teamsUpserted}`);

  // Refresh team map
  const { data: allTeams, error: allTeamsErr } = await supabase
    .from('lms_teams')
    .select('id, name, short_name, slug, external_id, crest_url');
  if (allTeamsErr) throw allTeamsErr;
  const teamIdByExternal = new Map<number, string>();
  for (const t of (allTeams ?? []) as LmsTeamRow[]) {
    if (t.external_id != null) teamIdByExternal.set(t.external_id, t.id);
  }

  // --- Matches ---
  console.log('[lms-sync] Fetching PL matches…');
  const matchesPayload = await fdGet<{ matches: FdMatch[] }>(
    `/competitions/PL/matches?season=${API_SEASON}`
  );
  const matches = (matchesPayload.matches ?? []).filter(
    (m) => m.matchday != null && m.matchday >= 1 && m.matchday <= 38
  );
  console.log(`[lms-sync] API matches (GW1–38): ${matches.length}`);

  // Ensure gameweeks exist and refresh starts/deadlines from earliest kickoff
  const byMatchday = new Map<number, FdMatch[]>();
  for (const m of matches) {
    const md = m.matchday as number;
    if (!byMatchday.has(md)) byMatchday.set(md, []);
    byMatchday.get(md)!.push(m);
  }

  const { data: existingGws, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number, status, starts_at, deadline_at')
    .eq('season', LMS_SEASON);
  if (gwErr) throw gwErr;
  const gwByNumber = new Map<number, { id: string; number: number; status: string }>();
  for (const g of existingGws ?? []) {
    gwByNumber.set(g.number as number, {
      id: g.id as string,
      number: g.number as number,
      status: g.status as string,
    });
  }

  for (let n = 1; n <= 38; n++) {
    const mdMatches = byMatchday.get(n) ?? [];
    const kickoffs = mdMatches
      .map((m) => new Date(m.utcDate).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    const startsAt =
      kickoffs.length > 0
        ? new Date(kickoffs[0]).toISOString()
        : new Date(Date.UTC(2026, 7, 22, 11, 30) + (n - 1) * 7 * 24 * 3600 * 1000).toISOString();
    const deadlineAt = new Date(new Date(startsAt).getTime() - 90 * 60 * 1000).toISOString();

    const existing = gwByNumber.get(n);
    if (existing) {
      if (existing.status !== 'complete') {
        const anyLive = mdMatches.some((m) => mapMatchStatus(m.status) === 'live');
        const allFinished =
          mdMatches.length > 0 && mdMatches.every((m) => mapMatchStatus(m.status) === 'finished');
        const now = Date.now();
        let status = existing.status;
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
      }
    } else {
      const { data, error } = await supabase
        .from('lms_gameweeks')
        .insert({
          season: LMS_SEASON,
          number: n,
          starts_at: startsAt,
          deadline_at: deadlineAt,
          status: 'upcoming',
        })
        .select('id, number, status')
        .single();
      if (error) throw error;
      gwByNumber.set(n, {
        id: data.id as string,
        number: data.number as number,
        status: data.status as string,
      });
    }
  }

  let fixturesUpserted = 0;
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
    const homeGoals = status === 'finished' ? m.score?.fullTime?.home ?? null : null;
    const awayGoals = status === 'finished' ? m.score?.fullTime?.away ?? null : null;

    const row = {
      gameweek_id: gw.id,
      home_team_id: homeId,
      away_team_id: awayId,
      kickoff_at: m.utcDate,
      status,
      home_goals: homeGoals,
      away_goals: awayGoals,
      external_id: m.id,
    };

    const { error } = await supabase.from('lms_fixtures').upsert(row, {
      onConflict: 'external_id',
      ignoreDuplicates: false,
    });
    if (error) {
      // Fallback if unique index is partial and upsert target differs
      const { data: existingFx } = await supabase
        .from('lms_fixtures')
        .select('id')
        .eq('external_id', m.id)
        .maybeSingle();
      if (existingFx?.id) {
        const { error: updErr } = await supabase.from('lms_fixtures').update(row).eq('id', existingFx.id);
        if (updErr) throw updErr;
      } else {
        const { data: byPair } = await supabase
          .from('lms_fixtures')
          .select('id')
          .eq('gameweek_id', gw.id)
          .eq('home_team_id', homeId)
          .eq('away_team_id', awayId)
          .maybeSingle();
        if (byPair?.id) {
          const { error: updErr } = await supabase.from('lms_fixtures').update(row).eq('id', byPair.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase.from('lms_fixtures').insert(row);
          if (insErr) throw insErr;
        }
      }
    }
    fixturesUpserted += 1;
  }
  console.log(`[lms-sync] Fixtures upserted/updated: ${fixturesUpserted}; skipped: ${fixturesSkipped}`);

  // --- Auto-settle finished gameweeks ---
  let settled = 0;
  if (AUTO_SETTLE) {
    for (const gw of gwByNumber.values()) {
      if (gw.status === 'complete') continue;
      const { count, error: cntErr } = await supabase
        .from('lms_fixtures')
        .select('id', { count: 'exact', head: true })
        .eq('gameweek_id', gw.id);
      if (cntErr) throw cntErr;
      if (!count || count < 1) continue;

      const { count: unfinished, error: unfinishedErr } = await supabase
        .from('lms_fixtures')
        .select('id', { count: 'exact', head: true })
        .eq('gameweek_id', gw.id)
        .neq('status', 'finished');
      if (unfinishedErr) throw unfinishedErr;
      if ((unfinished ?? 0) > 0) continue;

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
  }

  console.log('[lms-sync] Done.', { teamsUpserted, fixturesUpserted, fixturesSkipped, settled });
}

main().catch((e) => {
  console.error('[lms-sync] Fatal:', e);
  process.exit(1);
});
