import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findAuthUserByNormalizedEmail } from "../_shared/findAuthUserByEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CODE_TTL_MINUTES = 15;
const MIN_RESEND_SECONDS = 60;
const MAX_SENDS_PER_EMAIL_PER_DAY = 5;
const MAX_SENDS_PER_EMAIL_PER_MONTH = 25;
const BRAND_NAME = "Top Tipster Racing";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildResetEmailHtml(code: string): string {
  return `
    <div style="margin:0;padding:0;background:#f3f4f6;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#10b981;padding:18px 24px;">
                  <p style="margin:0;font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">${BRAND_NAME}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#111827;">Reset your password</p>
                  <p style="margin:0 0 18px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151;">
                    We received a request to reset your password. Use the code below in the app to continue.
                  </p>

                  <div style="margin:0 0 18px 0;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px;text-align:center;">
                    <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#065f46;">Verification code</p>
                    <p style="margin:0;font-family:Arial,sans-serif;font-size:34px;font-weight:700;letter-spacing:6px;color:#065f46;">${code}</p>
                  </div>

                  <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:13px;color:#4b5563;">
                    This code expires in <strong>${CODE_TTL_MINUTES} minutes</strong>.
                  </p>
                  <p style="margin:0 0 16px 0;font-family:Arial,sans-serif;font-size:13px;color:#4b5563;">
                    If you did not request this, you can safely ignore this email.
                  </p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
                  <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;">
                    Need help? Contact support at <a href="mailto:support@toptipster.ie" style="color:#059669;text-decoration:none;">support@toptipster.ie</a>.
                  </p>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;">
              ${BRAND_NAME}
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json().catch(() => ({ email: "" }));
    const normalizedEmail = normalizeEmail(String(email ?? ""));
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESET_FROM_EMAIL") ?? "noreply@toptipster.ie";
    const resetPepper = Deno.env.get("RESET_CODE_PEPPER") ?? "default-reset-pepper";

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Prevent rapid resends for the same email.
    const { data: existing } = await admin
      .from("password_reset_codes")
      .select("last_sent_at, sent_day, sent_today_count, sent_month, sent_month_count")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (existing?.last_sent_at) {
      const deltaMs = Date.now() - new Date(existing.last_sent_at).getTime();
      if (deltaMs < MIN_RESEND_SECONDS * 1000) {
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Check auth user existence without leaking result to client.
    const authUser = await findAuthUserByNormalizedEmail(admin, normalizedEmail);

    if (authUser && resendApiKey) {
      const now = new Date();
      const todayUtc = now.toISOString().slice(0, 10);
      const monthUtc = now.toISOString().slice(0, 7);
      const todayCount = existing?.sent_day === todayUtc ? (existing?.sent_today_count ?? 0) : 0;
      const monthCount = existing?.sent_month === monthUtc ? (existing?.sent_month_count ?? 0) : 0;

      // Quietly drop extra sends to protect monthly/daily email allowance.
      if (todayCount >= MAX_SENDS_PER_EMAIL_PER_DAY || monthCount >= MAX_SENDS_PER_EMAIL_PER_MONTH) {
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const code = randomCode();
      const codeHash = await sha256(`${normalizedEmail}:${code}:${resetPepper}`);
      const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

      const html = buildResetEmailHtml(code);

      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: normalizedEmail,
          subject: `${BRAND_NAME}: Your password reset code`,
          html,
        }),
      });
      if (!sendRes.ok) {
        const body = await sendRes.text().catch(() => "");
        console.error("Resend send failed", sendRes.status, body);
        throw new Error("resend_send_failed");
      }

      await admin
        .from("password_reset_codes")
        .upsert({
          email: normalizedEmail,
          code_hash: codeHash,
          expires_at: expiresAt,
          attempts: 0,
          last_sent_at: now.toISOString(),
          sent_day: todayUtc,
          sent_today_count: todayCount + 1,
          sent_month: monthUtc,
          sent_month_count: monthCount + 1,
          updated_at: now.toISOString(),
        });
    }

    // Always return generic success to avoid account enumeration.
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ success: false, error: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
