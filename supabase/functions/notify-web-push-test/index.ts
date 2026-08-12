/**
 * Send a one-shot Web Push to the signed-in user's saved subscriptions.
 * Used to verify PWA + VAPID + service worker without join/deadline logic.
 *
 * Auth: Bearer user JWT (supabase.functions.invoke from the client).
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 */
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const bearerToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

    if (!bearerToken || !anonKey || !serviceKey) {
      return json(401, { error: "Unauthorized" });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { error: "Unauthorized" });
    }
    const userId = userData.user.id;

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

    const { data: rows, error: subErr } = await admin
      .from("web_push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (subErr) throw subErr;

    const subs = (rows ?? []) as { endpoint: string; p256dh: string; auth: string }[];
    if (subs.length === 0) {
      return json(200, {
        ok: false,
        error: "no_subscription",
        message:
          "No push subscription saved for your account. Open the Home Screen app, turn Deadline Alerts on, then try again.",
        sent: 0,
        failed: 0,
      });
    }

    const payload = JSON.stringify({
      title: "Top Tipster test",
      body: "If you see this, Web Push is working on this device.",
      icon: "/apple-touch-icon.png",
      badge: "/favicon.png",
      url: "/(lms)",
    });

    let sent = 0;
    let failed = 0;
    let pruned = 0;
    const errors: string[] = [];

    for (const row of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 60 * 10 },
        );
        sent += 1;
      } catch (e: unknown) {
        failed += 1;
        const statusCode =
          e && typeof e === "object" && "statusCode" in e
            ? Number((e as { statusCode?: number }).statusCode)
            : undefined;
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(statusCode ? `${statusCode}: ${msg}` : msg);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("web_push_subscriptions").delete().eq("endpoint", row.endpoint);
          pruned += 1;
        }
      }
    }

    return json(200, {
      ok: sent > 0,
      sent,
      failed,
      pruned,
      subscriptions: subs.length,
      errors: errors.slice(0, 3),
    });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error" });
  }
});
