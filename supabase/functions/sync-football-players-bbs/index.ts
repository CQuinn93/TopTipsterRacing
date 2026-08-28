/**
 * Owner-only: Big Balls player roster → football_players.
 */
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BBS_API_BASE = "https://api.bigballsdata.com/v1";
const BBS_LEAGUE = "epl";
const PAGE_SIZE = 100;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchLmsTeam(
  teams: Array<{ id: string; name: string; short_name: string; slug: string }>,
  name: string,
  shortName?: string | null
) {
  const n = normalizeName(name);
  const sn = shortName ? normalizeName(shortName) : "";
  return teams.find(
    (t) =>
      normalizeName(t.name) === n ||
      normalizeName(t.short_name) === sn ||
      t.slug === slugify(name) ||
      (shortName && t.slug === slugify(shortName))
  );
}

function normalizeFootballPosition(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === "gk" || s.startsWith("goal")) return "GK";
  if (s === "def" || s.startsWith("def")) return "DEF";
  if (s === "mid" || s.startsWith("mid")) return "MID";
  if (s === "fwd" || s.startsWith("for") || s.startsWith("att") || s.startsWith("strik")) {
    return "FWD";
  }
  return null;
}

async function bbsFetch(path: string, apiKey: string) {
  const res = await fetch(`${BBS_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Big Balls ${path}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`
    );
  }
  return json;
}

async function bbsListAll(pathWithQuery: string, apiKey: string) {
  const out: unknown[] = [];
  let offset = 0;
  for (let i = 0; i < 30; i++) {
    const sep = pathWithQuery.includes("?") ? "&" : "?";
    const payload = await bbsFetch(
      `${pathWithQuery}${sep}limit=${PAGE_SIZE}&offset=${offset}`,
      apiKey
    );
    const batch = (payload.data as unknown[]) ?? [];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    const total = (payload.pagination as { total?: number } | undefined)?.total;
    if (total != null && out.length >= total) break;
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const bbsKey = Deno.env.get("BIG_BALLS_API") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ success: false, error: "not_authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "Owner") {
      return new Response(JSON.stringify({ success: false, error: "unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!bbsKey) {
      return new Response(JSON.stringify({ success: false, error: "missing_big_balls_api" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lmsTeams, error: teamsErr } = await admin
      .from("lms_teams")
      .select("id, name, short_name, slug");
    if (teamsErr) throw teamsErr;
    const teams = lmsTeams ?? [];

    if (teams.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "no_lms_teams",
          hint: "Run LMS football sync first so lms_teams is populated.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bbsTeams = await bbsListAll(
      `/teams?sport=football&league=${BBS_LEAGUE}`,
      bbsKey
    );
    const bbsTeamToLms = new Map<string, string>();
    for (const bt of bbsTeams as Array<{
      id: string;
      name: string;
      short_name?: string;
      abbreviation?: string;
    }>) {
      const matched = matchLmsTeam(lmsTeams, bt.name, bt.short_name ?? bt.abbreviation);
      if (matched) bbsTeamToLms.set(bt.id, matched.id);
    }

    const players = await bbsListAll(
      `/players?sport=football&league=${BBS_LEAGUE}`,
      bbsKey
    );

    if (players.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "bbs_empty_players",
          hint: "Big Balls returned 0 players. Check read:players scope and API key.",
          teams_mapped: bbsTeamToLms.size,
          bbs_teams_fetched: bbsTeams.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let upserted = 0;
    let skippedNoTeam = 0;
    let skippedNoName = 0;

    for (const p of players as Array<{
      id: string;
      name?: string;
      display_name?: string;
      first_name?: string;
      last_name?: string;
      position?: string;
      team?: { id?: string; name?: string };
      team_id?: string;
    }>) {
      const display =
        (p.display_name ?? p.name ?? "").trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (!display || !p.id) {
        skippedNoName += 1;
        continue;
      }

      const bbsTeamId = p.team?.id ?? p.team_id;
      let teamId = bbsTeamId ? bbsTeamToLms.get(bbsTeamId) : undefined;
      if (!teamId && p.team?.name) {
        const m = matchLmsTeam(lmsTeams, p.team.name);
        if (m) teamId = m.id;
      }
      if (!teamId) {
        skippedNoTeam += 1;
        continue;
      }

      const fullName =
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || display;
      const position = normalizeFootballPosition(p.position);

      const { data: existing } = await admin
        .from("football_players")
        .select("id")
        .eq("bbs_player_id", p.id)
        .maybeSingle();

      if (existing) {
        const { error } = await admin
          .from("football_players")
          .update({
            team_id: teamId,
            display_name: display,
            full_name: fullName,
            position,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: byName } = await admin
          .from("football_players")
          .select("id")
          .eq("team_id", teamId)
          .ilike("display_name", display)
          .maybeSingle();

        if (byName) {
          const { error } = await admin
            .from("football_players")
            .update({
              bbs_player_id: p.id,
              full_name: fullName,
              position,
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", byName.id);
          if (error) throw error;
        } else {
          const { error } = await admin.from("football_players").insert({
            team_id: teamId,
            display_name: display,
            full_name: fullName,
            bbs_player_id: p.id,
            position,
            is_active: true,
          });
          if (error) throw error;
        }
      }
      upserted += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        upserted,
        fetched: players.length,
        skipped_no_team: skippedNoTeam,
        skipped_no_name: skippedNoName,
        teams_mapped: bbsTeamToLms.size,
        bbs_teams_fetched: bbsTeams.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
