import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-03-31.basil",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

serve(async (req: Request) => {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!signature || !webhookSecret) {
      return new Response("Missing signature or secret", { status: 400 });
    }

    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email;
      const customerId = session.customer;

      if (customerEmail) {
        await supabase
          .from("trial_users")
          .update({
            subscription_tier: session.metadata?.tier || "pro",
            subscription_status: "active",
            access_type: session.mode === "subscription" ? "subscription" : "one_time",
            stripe_customer_id: customerId,
          })
          .eq("email", customerEmail);
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      await supabase
        .from("trial_users")
        .update({
          subscription_status: subscription.status,
        })
        .eq("stripe_customer_id", subscription.customer);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      await supabase
        .from("trial_users")
        .update({
          subscription_status: "canceled",
        })
        .eq("stripe_customer_id", subscription.customer);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error:", msg);
    return new Response(`Error: ${msg}`, { status: 400 });
  }
});
