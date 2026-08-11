/**
 * Instant Web Push when an LMS join request is created (pending).
 *
 * Trigger via Supabase Database Webhook on INSERT to public.lms_join_requests
 * (see docs/WEB_PUSH.md). Also accepts a manual POST with { join_request_id }.
 *
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional CRON_SECRET / webhook
 * Authorization bearer = service role.
 */
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Recipient = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJoinRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  if (typeof p.join_request_id === "string") return p.join_request_id;
  if (typeof p.record === "object" && p.record && typeof (p.record as { id?: string }).id === "string") {
    return (p.record as { id: string }).id;
  }
  // Database Webhooks sometimes nest under `payload.record`
  if (typeof p.payload === "object" && p.payload) {
    const inner = p.payload as Record<string, unknown>;
    if (typeof inner.record === "object" && inner.record && typeof (inner.record as { id?: string }).id === "string") {
      return (inner.record as { id: string }).id;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization") ?? "";
    const headerSecret = req.headers.get("x-cron-secret") ?? "";
    const okAuth =
      (serviceKey && auth === `Bearer ${serviceKey}`) ||
      (cronSecret && headerSecret === cronSecret) ||
      // Supabase Database Webhooks can send the service role as Authorization
      (serviceKey && auth.toLowerCase().startsWith("bearer ") && auth.slice(7) === serviceKey);

    if (!okAuth) {
      return json(401, { error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@toptipster.ie";
    if (!vapidPublic || !vapidPrivate) {
      return json(500, { error: "VAPID keys not configured" });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const admin = createClient(supabaseUrl, serviceKey);

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const joinRequestId = extractJoinRequestId(body);
    if (!joinRequestId) {
      return json(400, { error: "missing_join_request_id" });
    }

    const { data: jr, error: jrErr } = await admin
      .from("lms_join_requests")
      .select("id, competition_id, user_id, status")
      .eq("id", joinRequestId)
      .maybeSingle();
    if (jrErr) throw jrErr;
    if (!jr) return json(404, { error: "join_request_not_found" });
    if (jr.status !== "pending") {
      return json(200, { ok: true, skipped: "not_pending" });
    }

    const { data: comp, error: compErr } = await admin
      .from("lms_competitions")
      .select("id, name")
      .eq("id", jr.competition_id)
      .maybeSingle();
    if (compErr) throw compErr;

    const { data: profile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", jr.user_id)
      .maybeSingle();

    const username = (profile as { username?: string | null } | null)?.username?.trim() || "Someone";
    const competitionName = (comp as { name?: string } | null)?.name || "your competition";

    const { data: recipients, error: recErr } = await admin.rpc(
      "lms_list_join_notify_recipients",
      { p_competition_id: jr.competition_id },
    );
    if (recErr) throw recErr;

    const rows = (recipients ?? []) as Recipient[];
    // Never notify the joiner about their own request
    const targets = rows.filter((r) => r.user_id !== jr.user_id);

    const title = "New join request";
    const bodyText = `${username} wants to join ${competitionName}.`;
    const payload = JSON.stringify({
      title,
      body: bodyText,
      icon: "/apple-touch-icon.png",
      badge: "/favicon.png",
      competitionId: jr.competition_id,
      url: `/${jr.competition_id}`,
    });

    let sent = 0;
    let failed = 0;
    let pruned = 0;

    for (const row of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 60 * 60 },
        );
        sent += 1;
      } catch (e: unknown) {
        failed += 1;
        const statusCode =
          e && typeof e === "object" && "statusCode" in e
            ? Number((e as { statusCode?: number }).statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("web_push_subscriptions").delete().eq("endpoint", row.endpoint);
          pruned += 1;
        }
      }
    }

    return json(200, {
      ok: true,
      join_request_id: joinRequestId,
      recipients: targets.length,
      sent,
      failed,
      pruned,
    });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error" });
  }
});
