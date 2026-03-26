/**
 * stripe-webhook
 *
 * IMPORTANT (FCI): This repo did not previously contain your deployed handler.
 * Before replacing the live `stripe-webhook` in Supabase, paste your existing
 * `checkout.session.completed` FCI block immediately after the marker below
 * so FCI behavior stays unchanged. The CASE Clarity branch runs only after that section.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (or your project’s webhook secret name),
 *         SUPABASE_SERVICE_ROLE_KEY (service role for trial_users updates)
 */
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CASE_TIERS = new Set(["foundation", "professional", "enterprise"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  const headerNames = [...req.headers.keys()];
  console.log(
    "stripe-webhook [diag] Stripe-Signature header present:",
    Boolean(signature?.trim()),
  );
  console.log(
    "stripe-webhook [diag] request header names:",
    JSON.stringify(headerNames),
  );
  console.log(
    "stripe-webhook [diag] STRIPE_WEBHOOK_SECRET present:",
    Boolean(webhookSecret?.trim()),
  );

  if (!stripeSecret || !webhookSecret?.trim()) {
    console.error("stripe-webhook: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  if (!supabaseUrl || !serviceRole) {
    console.error("stripe-webhook: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature ?? "",
      webhookSecret,
    );
  } catch (err) {
    const constructEventMessage = err instanceof Error ? err.message : String(err);
    console.error(
      "stripe-webhook [diag] constructEvent failed:",
      constructEventMessage,
    );
    return new Response(
      JSON.stringify({
        error: "Webhook signature verification failed",
        construct_event_message: constructEventMessage,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // =========================================================================
    // EXISTING FCI HANDLING — DO NOT REMOVE OR MODIFY WHEN MERGING FROM DASHBOARD
    // Paste your current production FCI `checkout.session.completed` logic here
    // (everything that ran before CASE Clarity was added). It must appear FIRST.
    // =========================================================================


    // =========================================================================
    // CASE Clarity subscription (added after FCI; do not move above FCI block)
    // =========================================================================
    const productFamily = session.metadata?.product_family;
    const tierMeta = session.metadata?.tier;
    const userIdMeta = session.metadata?.user_id;

    if (productFamily === "case_clarity") {
      if (!tierMeta?.trim() || !userIdMeta?.trim()) {
        console.warn(
          "stripe-webhook: case_clarity checkout missing tier or user_id; acknowledging",
        );
      } else {
        const tier = tierMeta.trim();
        const userId = userIdMeta.trim();

        if (!UUID_RE.test(userId) || !CASE_TIERS.has(tier)) {
          console.warn(
            "stripe-webhook: case_clarity invalid user_id or tier; acknowledging",
          );
        } else {
          const { data: existing, error: selErr } = await supabase
            .from("trial_users")
            .select("id")
            .eq("id", userId)
            .maybeSingle();

          if (selErr) {
            console.error("stripe-webhook: trial_users lookup error", selErr);
          } else if (!existing) {
            console.warn(
              "stripe-webhook: case_clarity user_id not found in trial_users; acknowledging",
            );
          } else {
            const { error: updErr } = await supabase
              .from("trial_users")
              .update({
                access_type: "subscription",
                subscription_status: "active",
                tier,
              })
              .eq("id", userId);

            if (updErr) {
              console.error("stripe-webhook: trial_users update error", updErr);
            }
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
