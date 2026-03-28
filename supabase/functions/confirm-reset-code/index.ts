import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findAuthUserByNormalizedEmail } from "../_shared/findAuthUserByEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const normalizedEmail = normalizeEmail(String(body?.email ?? ""));
    const code = String(body?.code ?? "").trim();
    const newPassword = String(body?.newPassword ?? "");

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!code || code.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: "weak_password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resetPepper = Deno.env.get("RESET_CODE_PEPPER") ?? "default-reset-pepper";
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: row } = await admin
      .from("password_reset_codes")
      .select("email, code_hash, expires_at, attempts")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (!row) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_or_expired_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from("password_reset_codes").delete().eq("email", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, error: "code_expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ success: false, error: "too_many_attempts" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const expected = await sha256(`${normalizedEmail}:${code}:${resetPepper}`);
    if (expected !== row.code_hash) {
      await admin
        .from("password_reset_codes")
        .update({ attempts: (row.attempts ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("email", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, error: "invalid_or_expired_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authUser = await findAuthUserByNormalizedEmail(admin, normalizedEmail);
    if (!authUser?.id) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_or_expired_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });
    if (updateErr) throw updateErr;

    await admin.from("password_reset_codes").delete().eq("email", normalizedEmail);

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
