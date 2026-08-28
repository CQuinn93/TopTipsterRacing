/**
 * Owner-only: trigger Big Balls player roster sync.
 * Invokes the same workflow logic as scripts/sync-football-players-bbs.ts (inline).
 */
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BBS_API_BASE = "https://api.bigballsdata.com/v4";

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

    const { data: lmsTeams } = await admin.from("lms_teams").select("id, name, short_name, slug");
    const teams = lmsTeams ?? [];

    const matchTeam = (name: string, shortName?: string) => {
      const n = normalizeName(name);
      const sn = shortName ? normalizeName(shortName) : "";
      return teams.find(
        (t: { name: string; short_name: string; slug: string }) =>
          normalizeName(t.name) === n ||
          normalizeName(t.short_name) === sn ||
          t.slug === slugify(name)
      );
    };

    const teamsRes = await fetch(`${BBS_API_BASE}/teams?sport=football&league=epl&limit=200`, {
      headers: { Authorization: `Bearer ${bbsKey}`, Accept: "application/json" },
    });
    const teamsPayload = await teamsRes.json();
    const bbsTeams = teamsPayload.data ?? [];
    const bbsTeamToLms = new Map<string, string>();
    for (const bt of bbsTeams) {
      const m = matchTeam(bt.name, bt.short_name ?? bt.abbreviation);
      if (m) bbsTeamToLms.set(bt.id, m.id);
    }

    const playersRes = await fetch(
      `${BBS_API_BASE}/players?sport=football&league=epl&limit=200`,
      { headers: { Authorization: `Bearer ${bbsKey}`, Accept: "application/json" } }
    );
    const playersPayload = await playersRes.json();
    const players = playersPayload.data ?? [];

    let upserted = 0;
    for (const p of players) {
      const display =
        (p.display_name ?? p.name ?? "").trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (!display || !p.id) continue;

      const bbsTeamId = p.team?.id ?? p.team_id;
      let teamId = bbsTeamId ? bbsTeamToLms.get(bbsTeamId) : undefined;
      if (!teamId && p.team?.name) {
        const m = matchTeam(p.team.name);
        if (m) teamId = m.id;
      }
      if (!teamId) continue;

      const fullName =
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || display;

      const { data: existing } = await admin
        .from("football_players")
        .select("id")
        .eq("bbs_player_id", p.id)
        .maybeSingle();

      if (existing) {
        await admin
          .from("football_players")
          .update({
            team_id: teamId,
            display_name: display,
            full_name: fullName,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await admin.from("football_players").upsert(
          {
            team_id: teamId,
            display_name: display,
            full_name: fullName,
            bbs_player_id: p.id,
            is_active: true,
          },
          { onConflict: "bbs_player_id" }
        );
      }
      upserted += 1;
    }

    return new Response(
      JSON.stringify({ success: true, upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
