import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.16.0?target=deno'

const stripeSecretKey = "sk_test_51RESxrGINAhAkAYrp6eMxwZb3NBkQuq2JURDYlfEnU0pZVcQF5hyBpPW3URFaEy1U2w79haV1UTBLfxG0Zg0fLO100X4PWs8F5"
const webhookSecret = "whsec_cpfgPPtyW1S8ZUXoyNyIdTA9kp7cddjv"
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
})

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

serve(async (req) => {
  console.log(`=== WEBHOOK CALLED ===`)
  console.log(`Method: ${req.method}`)
  
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    console.error('No signature header')
    return new Response(JSON.stringify({ error: 'No signature found' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  const rawBody = await req.arrayBuffer()
  const body = new TextDecoder().decode(rawBody)
  console.log(`Body length: ${body.length}`)
  
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    )
    console.log(`✅ VERIFIED: ${event.type}`)
  } catch (err) {
    console.error(`❌ FAILED: ${err.message}`)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      console.log(`DEBUG - Full session data:`, JSON.stringify({
        id: session.id,
        customer: session.customer,
        subscription: session.subscription,
        metadata: session.metadata,
        mode: session.mode,
      }))
      const stripeCustomerId = session.customer as string // cus_xxxxx
      const userEmail = session.customer_details?.email
      const tier = session.metadata?.tier || 'foundation'
      const userId = session.metadata?.user_id // UUID from checkout

      console.log(`Stripe Customer ID: ${stripeCustomerId}`)
      console.log(`User ID (UUID): ${userId}`)
      console.log(`Email: ${userEmail}`)
      console.log(`Tier: ${tier}`)
      console.log(`Has subscription: ${!!session.subscription}`)

      console.log(`DEBUG - Subscription data:`, {
        hasSubscription: !!session.subscription,
        subscriptionId: session.subscription,
        tier: tier,
        userId: userId,
        stripeCustomerId: stripeCustomerId,
      })

      if (!userId) {
        console.error('No user_id in metadata')
        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      let subscriptionStatus = 'active'
      let currentPeriodStart: string | null = null
      let currentPeriodEnd: string | null = null

      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)

        // Handle both string and object price formats
        const priceId = subscription.items.data[0]?.price
          ? (typeof subscription.items.data[0].price === 'string'
            ? subscription.items.data[0].price
            : subscription.items.data[0].price.id)
          : null

        console.log(`DEBUG - Subscription from Stripe:`, JSON.stringify({
          status: subscription.status,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          priceId: priceId,
          items: subscription.items.data.map(item => ({
            price: typeof item.price === 'string' ? item.price : item.price.id,
            quantity: item.quantity,
          })),
        }))

        subscriptionStatus = subscription.status
        currentPeriodStart = new Date(subscription.current_period_start * 1000).toISOString()
        currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString()
      } else {
        console.log(`One-time payment for foundation tier`)
      }

      const { error } = await supabase
        .from('trial_users')
        .update({
          stripe_customer_id: stripeCustomerId,
          subscription_status: subscriptionStatus,
          subscription_tier: tier, // Make sure this is subscription_tier, not tier
          subscription_current_period_start: currentPeriodStart,
          subscription_current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        console.error(`Database error: ${error.message}`)
      } else {
        console.log(`✅ Updated user ${userId} with tier ${tier}`)
      }
    } else {
      console.log(`Unhandled event type: ${event.type}`)
    }
    
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error(`Processing error: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
