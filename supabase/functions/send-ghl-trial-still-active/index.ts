import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Full active 6-tool set required for “Trial Still Active” GHL webhook */
const ACTIVE_TOOL_KEYS = [
  "CCI_active",
  "CAF_active",
  "HSI_active",
  "FCI_active",
  "RRF_active",
  "CSA_active",
] as const;

type TrialPayload = {
  event: string;
  full_name: string;
  email: string;
  ccp: string;
  pin: string;
  law_firm: string;
  phone: string | null;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseTrialStartMs(trialStartAt: unknown): number | null {
  if (trialStartAt == null) return null;
  const s = String(trialStartAt).trim();
  if (s === "") return null;
  const ms = new Date(s).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function trialDaysElapsedFromMs(startMs: number): number {
  return Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24));
}

function fullSixToolSetComplete(completedTools: unknown): boolean {
  if (!completedTools || typeof completedTools !== "object") return false;
  const ct = completedTools as Record<string, unknown>;
  for (const k of ACTIVE_TOOL_KEYS) {
    const v = ct[k];
    if (!v || typeof v !== "object") return false;
    if ((v as { completed?: boolean }).completed !== true) return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!raw || typeof raw !== "object") {
    return jsonResponse({ success: false, error: "Body must be a JSON object" }, 400);
  }

  const body = raw as Record<string, unknown>;
  const idRaw = typeof body.id === "string" ? body.id.trim() : "";

  if (!idRaw || !UUID_RE.test(idRaw)) {
    return jsonResponse(
      { success: false, error: 'Provide a valid UUID "id" in the JSON body' },
      400,
    );
  }

  const webhookUrl = (Deno.env.get("GHL_TRIAL_STILL_ACTIVE_WEBHOOK_URL") ?? "")
    .trim();
  if (!webhookUrl) {
    console.error(
      "send-ghl-trial-still-active: GHL_TRIAL_STILL_ACTIVE_WEBHOOK_URL not set",
    );
    return jsonResponse(
      {
        success: false,
        reason: "webhook_not_configured",
      },
      503,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      { success: false, error: "Server configuration error" },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: row, error: dbError } = await supabase
    .from("trial_users")
    .select(
      "id,full_name,email,ccp,pin,law_firm,phone,status,trial_start_at,completed_tools,trial_still_active_email_sent",
    )
    .eq("id", idRaw)
    .maybeSingle();

  if (dbError) {
    console.error("send-ghl-trial-still-active db:", dbError.message);
    return jsonResponse({ success: false, error: "Could not load trial user" }, 500);
  }

  if (!row) {
    return jsonResponse({ success: false, error: "trial_users row not found" }, 404);
  }

  if (row.trial_still_active_email_sent === true) {
    return jsonResponse({
      success: true,
      sent: false,
      skipped: true,
      reason: "already_sent",
    });
  }

  if (row.status !== "trial_active") {
    return jsonResponse({
      success: true,
      sent: false,
      skipped: true,
      reason: "trial_not_active",
    });
  }

  const startMs = parseTrialStartMs(row.trial_start_at);
  if (startMs === null) {
    return jsonResponse({
      success: true,
      sent: false,
      skipped: true,
      reason: "trial_start_missing_or_invalid",
    });
  }

  const daysElapsed = trialDaysElapsedFromMs(startMs);
  if (daysElapsed >= 7) {
    return jsonResponse({
      success: true,
      sent: false,
      skipped: true,
      reason: "trial_expired",
    });
  }

  if (!fullSixToolSetComplete(row.completed_tools)) {
    return jsonResponse({
      success: true,
      sent: false,
      skipped: true,
      reason: "not_all_tools_complete",
    });
  }

  const requiredKeys = [
    "full_name",
    "email",
    "ccp",
    "pin",
    "law_firm",
  ] as const;
  for (const key of requiredKeys) {
    const v = row[key as keyof typeof row];
    if (v == null || (typeof v === "string" && v.trim() === "")) {
      return jsonResponse(
        {
          success: false,
          error: `Row is missing required non-empty field: ${key}`,
        },
        422,
      );
    }
  }

  const payload: TrialPayload = {
    event: "trial_all_tools_complete_while_active",
    full_name: row.full_name as string,
    email: row.email as string,
    ccp: row.ccp as string,
    pin: row.pin as string,
    law_firm: row.law_firm as string,
    phone:
      row.phone == null || String(row.phone).trim() === ""
        ? null
        : String(row.phone),
  };

  let ghlStatus: number;
  let webhookResponseText: string;
  try {
    const ghlRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    ghlStatus = ghlRes.status;
    webhookResponseText = await ghlRes.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-ghl-trial-still-active fetch:", message);
    return jsonResponse(
      {
        success: false,
        error: `GHL webhook request failed: ${message}`,
        sent: false,
      },
      502,
    );
  }

  const ghlOk = ghlStatus >= 200 && ghlStatus < 300;
  if (!ghlOk) {
    return jsonResponse(
      {
        success: false,
        error: "GHL webhook returned a non-success HTTP status",
        ghl_status: ghlStatus,
        webhook_response_text: webhookResponseText,
        sent: false,
      },
      502,
    );
  }

  const { error: updErr } = await supabase
    .from("trial_users")
    .update({ trial_still_active_email_sent: true })
    .eq("id", idRaw)
    .eq("trial_still_active_email_sent", false);

  if (updErr) {
    console.error("send-ghl-trial-still-active update:", updErr.message);
    return jsonResponse(
      {
        success: false,
        error: "Webhook succeeded but could not update trial_still_active_email_sent",
        ghl_status: ghlStatus,
      },
      500,
    );
  }

  return jsonResponse({
    success: true,
    sent: true,
    ghl_status: ghlStatus,
    webhook_response_text: webhookResponseText,
  });
});
