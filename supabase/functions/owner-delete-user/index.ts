// Supabase Edge Function: owner-delete-user
// Permanently deletes another user's data + auth account. Owner-only.
// POST body: { user_id: string }
// Authorization: Bearer <owner access_token>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Missing or invalid Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);
    if (userError || !user?.id) {
      return json(401, { error: "Invalid or expired token" });
    }

    const ownerId = user.id;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: ownerProfile, error: ownerProfileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", ownerId)
      .maybeSingle();
    if (ownerProfileError) {
      console.error("owner profile lookup failed", ownerProfileError);
      return json(500, { error: "Server error" });
    }
    if ((ownerProfile as { role?: string } | null)?.role !== "Owner") {
      return json(403, { error: "unauthorized" });
    }

    let body: { user_id?: string } = {};
    try {
      body = (await req.json()) as { user_id?: string };
    } catch {
      return json(400, { error: "invalid_body" });
    }

    const targetId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!targetId) {
      return json(400, { error: "user_required" });
    }
    if (targetId === ownerId) {
      return json(400, { error: "cannot_delete_self" });
    }

    const { data: targetProfile, error: targetProfileError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", targetId)
      .maybeSingle();
    if (targetProfileError) {
      console.error("target profile lookup failed", targetProfileError);
      return json(500, { error: "Server error" });
    }
    if (!targetProfile) {
      return json(404, { error: "user_not_found" });
    }
    if ((targetProfile as { role?: string }).role === "Owner") {
      return json(400, { error: "cannot_delete_owner" });
    }

    // Racing tables (no auth.users FK) — same cleanup as self-service delete-account.
    await admin.from("selections").delete().eq("user_id", targetId);
    await admin.from("daily_selections").delete().eq("user_id", targetId);
    await admin.from("competition_join_requests").delete().eq("user_id", targetId);
    await admin.from("competition_participants").delete().eq("user_id", targetId);

    // WC FKs that block auth.users delete.
    const wc = admin.schema("wc2026");
    await wc
      .from("football_competitions")
      .update({ created_by: ownerId })
      .eq("created_by", targetId);
    await wc
      .from("ante_post_submissions")
      .update({ reopened_by: null })
      .eq("reopened_by", targetId);

    // Best-effort: clear password reset rows for this email.
    const { data: authUserData } = await admin.auth.admin.getUserById(targetId);
    const email = authUserData?.user?.email?.trim().toLowerCase();
    if (email) {
      await admin.from("password_reset_codes").delete().eq("email", email);
    }

    await admin.from("profiles").delete().eq("id", targetId);

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetId);
    if (deleteAuthError) {
      console.error("Auth delete error:", deleteAuthError);
      return json(500, { error: "Failed to delete user" });
    }

    return json(200, { success: true, user_id: targetId });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error" });
  }
});
