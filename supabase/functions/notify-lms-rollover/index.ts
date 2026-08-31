/**
 * Web Push to all LMS participants when a competition rolls over.
 *
 * Triggered by sync-lms-football after settle outcome === 'rollover'
 * (service role), or manually with service role / CRON_SECRET.
 *
 * Title: Rollover for <competition name>
 * Body: Visit the competition for more information.
 *
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization") ?? "";
    const headerSecret = req.headers.get("x-cron-secret") ?? "";
    const bearerToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

    const isServiceRole =
      Boolean(serviceKey) && (auth === `Bearer ${serviceKey}` || bearerToken === serviceKey);
    const isCron = Boolean(cronSecret) && headerSecret === cronSecret;

    if (!isServiceRole && !isCron) {
      return json(401, { error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@toptipster.ie";
    if (!vapidPublic || !vapidPrivate) {
      return json(500, { error: "VAPID keys not configured" });
    }
    if (vapidPublic === vapidPrivate) {
      return json(500, {
        error: "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be different values",
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const admin = createClient(supabaseUrl, serviceKey);

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const p = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const competitionId = typeof p.competition_id === "string" ? p.competition_id : null;
    if (!competitionId) {
      return json(400, { error: "missing_competition_id" });
    }

    const { data: comp, error: compErr } = await admin
      .from("lms_competitions")
      .select("id, name")
      .eq("id", competitionId)
      .maybeSingle();
    if (compErr) throw compErr;
    if (!comp) return json(404, { error: "competition_not_found" });

    const competitionName =
      typeof (comp as { name?: string }).name === "string" && (comp as { name: string }).name.trim()
        ? (comp as { name: string }).name.trim()
        : "the competition";

    const { data: parts, error: partErr } = await admin
      .from("lms_participants")
      .select("user_id")
      .eq("competition_id", competitionId);
    if (partErr) throw partErr;

    const userIds = [
      ...new Set(
        ((parts ?? []) as { user_id: string }[])
          .map((r) => r.user_id)
          .filter((id) => typeof id === "string" && id.length > 0),
      ),
    ];

    if (userIds.length === 0) {
      return json(200, {
        ok: true,
        skipped: "no_participants",
        competition_id: competitionId,
        sent: 0,
      });
    }

    const { data: subs, error: subErr } = await admin
      .from("web_push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", userIds);
    if (subErr) throw subErr;

    const rows = (subs ?? []) as {
      endpoint: string;
      p256dh: string;
      auth: string;
      user_id: string;
    }[];

    if (rows.length === 0) {
      return json(200, {
        ok: true,
        skipped: "no_subscriptions",
        competition_id: competitionId,
        participants: userIds.length,
        sent: 0,
      });
    }

    const title = `Rollover for ${competitionName}`;
    const bodyText = "Visit the competition for more information.";
    const payload = JSON.stringify({
      title,
      body: bodyText,
      icon: "/apple-touch-icon.png",
      badge: "/favicon.png",
      competitionId,
      url: `/${competitionId}`,
      competitionName,
      kind: "lms_rollover",
    });

    let sent = 0;
    let failed = 0;
    let pruned = 0;
    const notifiedUsers = new Set<string>();

    for (const row of rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 * 3 },
        );
        sent += 1;
        notifiedUsers.add(row.user_id);
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
      competition_id: competitionId,
      participants: userIds.length,
      devices: rows.length,
      users_notified: notifiedUsers.size,
      sent,
      failed,
      pruned,
    });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error" });
  }
});
