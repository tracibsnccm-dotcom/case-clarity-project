/*
 * C.A.S.E. Clarity — Stripe billing.
 *
 * One function, two jobs:
 *  1. Start checkout (POST JSON { action: "create_checkout", plan, user_id, ccp, return_base })
 *     called from pricing.html for a signed-in trial account.
 *  2. Stripe webhooks (POST with a stripe-signature header):
 *     - checkout.session.completed  → marks the account paid (same account, same CCP)
 *     - invoice.paid                → after the 3rd paid month, the 4th month is free
 *     - customer.subscription.updated / deleted → keeps status and period current
 *
 * Plans: foundation $6,495/mo · professional $7,995/mo · enterprise $12,995/mo
 *        single $1,995 one time (30 days of access)
 *
 * Secrets (Supabase → Edge Functions → Secrets): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.16.0?target=deno'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
if (!stripeSecretKey) throw new Error('STRIPE_SECRET_KEY is missing (Supabase → Edge Functions → Secrets).')
if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is missing (Supabase → Edge Functions → Secrets).')

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' })
const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')

const PLANS: Record<string, { price: string; mode: 'subscription' | 'payment'; label: string }> = {
  foundation: { price: 'price_1UUahwGINAhAkAYreEN9Ieh5', mode: 'subscription', label: 'Foundation' },
  professional: { price: 'price_1UUahOGINAhAkAYrXbBwbrpu', mode: 'subscription', label: 'Professional' },
  enterprise: { price: 'price_1UUadJGINAhAkAYrSsSemAdQ', mode: 'subscription', label: 'Enterprise' },
  single: { price: 'price_1UUaibGINAhAkAYrU3YUWCoW', mode: 'payment', label: 'Single Client Review' },
}
const PRICE_TO_PLAN: Record<string, string> = Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [v.price, k]))

const FREE_MONTH_COUPON = 'CC_FOURTH_MONTH_FREE'
const PAID_MONTHS_FOR_FREE = 3
const SINGLE_REVIEW_DAYS = 30
const DEFAULT_BASE = 'https://trial.caseclarity.rcmspllc.com'
const ALLOWED_BASES = [/^https:\/\/trial\.caseclarity\.rcmspllc\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const iso = (sec?: number | null) => (sec ? new Date(sec * 1000).toISOString() : null)

async function updateUser(match: { id?: string; sub?: string }, fields: Record<string, unknown>) {
  let q = supabase.from('trial_users').update({ ...fields, updated_at: new Date().toISOString() })
  q = match.id ? q.eq('id', match.id) : q.eq('stripe_subscription_id', match.sub as string)
  const { error } = await q
  if (error) console.error('trial_users update failed:', error.message)
}

/* ── 1. Start checkout ── */
async function createCheckout(body: Record<string, unknown>) {
  const plan = String(body.plan || '')
  const userId = String(body.user_id || '')
  const ccp = String(body.ccp || '')
  const p = PLANS[plan]
  if (!p) return json({ error: 'Unknown plan.' }, 400)
  if (!userId || !ccp) return json({ error: 'Please sign in to your trial account first.', code: 'signin' }, 401)

  const { data: user, error } = await supabase.from('trial_users').select('id, email, ccp, stripe_customer_id').eq('id', userId).eq('ccp', ccp).maybeSingle()
  if (error || !user) return json({ error: 'Please sign in to your trial account first.', code: 'signin' }, 401)

  const reqBase = String(body.return_base || '')
  const base = ALLOWED_BASES.some((r) => r.test(reqBase)) ? reqBase : DEFAULT_BASE
  const meta = { user_id: user.id, ccp: user.ccp, tier: plan }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: p.mode,
    line_items: [{ price: p.price, quantity: 1 }],
    client_reference_id: user.id,
    metadata: meta,
    allow_promotion_codes: true,
    success_url: `${base}/thank-you-subscription.html?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pricing.html?canceled=1`,
  }
  if (user.stripe_customer_id) params.customer = user.stripe_customer_id
  else if (user.email) params.customer_email = user.email
  if (p.mode === 'subscription') params.subscription_data = { metadata: meta }
  else {
    params.payment_intent_data = { metadata: meta }
    if (!user.stripe_customer_id) params.customer_creation = 'always'
  }

  const session = await stripe.checkout.sessions.create(params)
  return json({ url: session.url })
}

/* ── 2. Webhooks ── */
async function ensureCoupon() {
  try {
    await stripe.coupons.retrieve(FREE_MONTH_COUPON)
  } catch {
    await stripe.coupons.create({ id: FREE_MONTH_COUPON, percent_off: 100, duration: 'once', name: '4th month free' })
  }
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id || session.client_reference_id || ''
  const tier = session.metadata?.tier || ''
  if (!userId) { console.error('checkout.session.completed without user_id'); return }
  const customer = (session.customer as string) || null

  if (session.mode === 'payment') {
    await updateUser({ id: userId }, {
      stripe_customer_id: customer,
      subscription_tier: 'single',
      subscription_status: 'active',
      single_review_expires_at: new Date(Date.now() + SINGLE_REVIEW_DAYS * 86400000).toISOString(),
      status: 'paid',
    })
    return
  }
  if (session.subscription) {
    const sub = await stripe.subscriptions.retrieve(session.subscription as string)
    const price = sub.items.data[0]?.price?.id || ''
    await updateUser({ id: userId }, {
      stripe_customer_id: customer,
      stripe_subscription_id: sub.id,
      subscription_tier: PRICE_TO_PLAN[price] || tier || null,
      subscription_status: sub.status,
      subscription_current_period_start: iso(sub.current_period_start),
      subscription_current_period_end: iso(sub.current_period_end),
      status: 'paid',
    })
  }
}

async function onSubscriptionChanged(sub: Stripe.Subscription) {
  const price = sub.items.data[0]?.price?.id || ''
  const fields: Record<string, unknown> = {
    subscription_status: sub.status,
    subscription_current_period_start: iso(sub.current_period_start),
    subscription_current_period_end: iso(sub.current_period_end),
  }
  if (PRICE_TO_PLAN[price]) fields.subscription_tier = PRICE_TO_PLAN[price]
  if (sub.metadata?.user_id) await updateUser({ id: sub.metadata.user_id }, { ...fields, stripe_subscription_id: sub.id })
  else await updateUser({ sub: sub.id }, fields)
}

/* After the 3rd paid monthly invoice, the next (4th) month is free. */
async function onInvoicePaid(inv: Stripe.Invoice) {
  if (!inv.subscription || !(inv.amount_paid > 0)) return
  const subId = inv.subscription as string
  const sub = await stripe.subscriptions.retrieve(subId)
  if (sub.metadata?.free_month_applied === 'true') return
  const invoices = await stripe.invoices.list({ subscription: subId, status: 'paid', limit: 10 })
  const paidMonths = invoices.data.filter((i) => i.amount_paid > 0).length
  if (paidMonths < PAID_MONTHS_FOR_FREE) return
  await ensureCoupon()
  await stripe.subscriptions.update(subId, {
    coupon: FREE_MONTH_COUPON,
    metadata: { ...sub.metadata, free_month_applied: 'true' },
  })
  if (sub.metadata?.user_id) await updateUser({ id: sub.metadata.user_id }, { free_month_applied: true })
  else await updateUser({ sub: subId }, { free_month_applied: true })
  console.log(`Free 4th month applied to ${subId}`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method === 'GET') return json({ status: 'healthy', timestamp: new Date().toISOString() })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const signature = req.headers.get('stripe-signature')

  // Checkout request from the pricing page (no Stripe signature).
  if (!signature) {
    try {
      const body = await req.json()
      if (body && body.action === 'create_checkout') return await createCheckout(body)
      return json({ error: 'Unknown request.' }, 400)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('create_checkout failed:', message)
      return json({ error: 'Checkout could not be started. Please try again or contact support.', detail: message }, 500)
    }
  }

  // Stripe webhook.
  const body = new TextDecoder().decode(await req.arrayBuffer())
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Webhook signature failed:', message)
    return json({ error: message }, 400)
  }

  try {
    console.log('Webhook:', event.type)
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'invoice.paid':
        await onInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await onSubscriptionChanged(event.data.object as Stripe.Subscription)
        break
      default:
        console.log('Unhandled event type:', event.type)
    }
    return json({ received: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('Webhook processing error:', message)
    return json({ error: message }, 500)
  }
})
