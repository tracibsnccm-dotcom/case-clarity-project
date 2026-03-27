import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const GHL_WEBHOOK_URL =
  "https://services.leadconnectorhq.com/hooks/ITbDyXjk2WeWIs8L8mmP/webhook-trigger/1dc872ce-450c-40a2-890e-f18e3f743e42";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TrialPayload = {
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

function errorBody(
  message: string,
  extras: {
    success: boolean;
    ghl_status: number | null;
    webhook_response_text: string | null;
    payload: TrialPayload | null;
  },
): Record<string, unknown> {
  return { error: message, ...extras };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      errorBody("Method not allowed. Use POST.", {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      405,
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(
      errorBody("Invalid JSON body", {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      400,
    );
  }

  if (!raw || typeof raw !== "object") {
    return jsonResponse(
      errorBody("Request body must be a JSON object", {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      400,
    );
  }

  const body = raw as Record<string, unknown>;
  const idRaw = typeof body.id === "string" ? body.id.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";

  if (!idRaw && !emailRaw) {
    return jsonResponse(
      errorBody('Provide either "id" (UUID) or "email" in the JSON body', {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      400,
    );
  }

  if (idRaw && emailRaw) {
    return jsonResponse(
      errorBody('Provide only one of "id" or "email", not both', {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      400,
    );
  }

  if (idRaw && !UUID_RE.test(idRaw)) {
    return jsonResponse(
      errorBody("Invalid id: must be a UUID", {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      errorBody(
        "Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing",
        {
          success: false,
          ghl_status: null,
          webhook_response_text: null,
          payload: null,
        },
      ),
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let q = supabase
    .from("trial_users")
    .select("full_name,email,ccp,pin,law_firm,phone");

  if (idRaw) {
    q = q.eq("id", idRaw);
  } else {
    q = q.eq("email", emailRaw);
  }

  const { data: row, error: dbError } = await q.maybeSingle();

  if (dbError) {
    console.error("send-ghl-trial-sample db:", dbError.message);
    return jsonResponse(
      errorBody("Could not load trial user", {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      500,
    );
  }

  if (!row) {
    return jsonResponse(
      errorBody("trial_users row not found for the given id or email", {
        success: false,
        ghl_status: null,
        webhook_response_text: null,
        payload: null,
      }),
      404,
    );
  }

  const requiredKeys = [
    "full_name",
    "email",
    "ccp",
    "pin",
    "law_firm",
  ] as const;
  for (const key of requiredKeys) {
    const v = row[key];
    if (v == null || (typeof v === "string" && v.trim() === "")) {
      return jsonResponse(
        errorBody(`Row is missing required non-empty field: ${key}`, {
          success: false,
          ghl_status: null,
          webhook_response_text: null,
          payload: null,
        }),
        422,
      );
    }
  }

  const payload: TrialPayload = {
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
    const ghlRes = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    ghlStatus = ghlRes.status;
    webhookResponseText = await ghlRes.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-ghl-trial-sample fetch:", message);
    return jsonResponse(
      {
        success: false,
        error: `GHL webhook request failed: ${message}`,
        ghl_status: null,
        webhook_response_text: null,
        payload,
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
        payload,
      },
      502,
    );
  }

  return jsonResponse({
    success: true,
    ghl_status: ghlStatus,
    webhook_response_text: webhookResponseText,
    payload,
  });
});
