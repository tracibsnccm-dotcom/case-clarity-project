/**
 * create-case-clarity-checkout-session
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
 *   STRIPE_SECRET_KEY       — Stripe secret key (test/live matching your Price IDs)
 *   CASE_CLARITY_SITE_URL   — Origin only, no trailing slash: the live site that hosts
 *                             pricing.html, clarity-post-trial-pricing.html, and case-clarity-portal.html
 *                             (e.g. your Vercel deployment URL). Used for Stripe success/cancel redirects.
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// Stripe Price IDs (C.A.S.E. Clarity). SUPPORT is not used in this flow.
const FOUNDATION_PRICE_ID = "price_1TEYqhGINAhAkAYrDyydtLe0";
const PROFESSIONAL_PRICE_ID = "price_1TEYs0GINAhAkAYrX7yHGeXI";
const ENTERPRISE_PRICE_ID = "price_1TEYt8GINAhAkAYr2TvFElmU";
const ONBOARDING_PRICE_ID = "price_1TEYupGINAhAkAYrS5lwunQ6";

const TIER_TO_PRICE: Record<"foundation" | "professional" | "enterprise", string> = {
  foundation: FOUNDATION_PRICE_ID,
  professional: PROFESSIONAL_PRICE_ID,
  enterprise: ENTERPRISE_PRICE_ID,
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200): Response {
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
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrlRaw = Deno.env.get("CASE_CLARITY_SITE_URL");

  if (!stripeSecretKey) {
    console.error("create-case-clarity-checkout-session: STRIPE_SECRET_KEY is not set");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  if (!siteUrlRaw?.trim()) {
    console.error("create-case-clarity-checkout-session: CASE_CLARITY_SITE_URL is not set");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const siteBase = siteUrlRaw.trim().replace(/\/$/, "");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const { tier, addOnboarding, user_id } = body as Record<string, unknown>;

  if (tier !== "foundation" && tier !== "professional" && tier !== "enterprise") {
    return jsonResponse({
      error: 'tier must be "foundation", "professional", or "enterprise"',
    }, 400);
  }

  if (typeof addOnboarding !== "boolean") {
    return jsonResponse({ error: "addOnboarding must be a boolean" }, 400);
  }

  if (typeof user_id !== "string" || !UUID_RE.test(user_id.trim())) {
    return jsonResponse({ error: "user_id must be a valid UUID string" }, 400);
  }

  const userId = user_id.trim();

  const lineItems: { price: string; quantity: number }[] = [
    { price: TIER_TO_PRICE[tier], quantity: 1 },
  ];

  if (addOnboarding) {
    lineItems.push({ price: ONBOARDING_PRICE_ID, quantity: 1 });
  }

  const mode = tier === "foundation" ? "payment" : "subscription";

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const successUrl =
    tier === "foundation"
      ? `https://clarity-post-trial-pricing.vercel.app/thank-you-report.html?uid=${encodeURIComponent(userId)}`
      : `https://clarity-post-trial-pricing.vercel.app/thank-you-subscription.html?uid=${encodeURIComponent(userId)}`;
  const cancelUrl = `${siteBase}/pricing.html?purchase=cancelled`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        product_family: "case_clarity",
        tier,
        add_onboarding: addOnboarding ? "true" : "false",
        user_id: userId,
      },
    });

    if (!session.url) {
      return jsonResponse({ error: "Checkout session missing redirect URL" }, 500);
    }

    return jsonResponse({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("create-case-clarity-checkout-session:", message);
    return jsonResponse({ error: "Could not create checkout session" }, 500);
  }
});
