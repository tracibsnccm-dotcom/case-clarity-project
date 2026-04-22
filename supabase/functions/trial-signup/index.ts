import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BLOCKED = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'me.com',
  'live.com',
  'msn.com',
  'proton.me',
  'protonmail.com',
])

function isPersonalDomain(email: string): boolean {
  const m = String(email).trim().toLowerCase().match(/@([^@]+)$/)
  if (!m) return true
  return BLOCKED.has(m[1])
}

function generateCCP(): string {
  const num = Math.floor(Math.random() * 900000) + 100000
  return 'CCP-' + num.toString().padStart(6, '0')
}

function generatePIN(): string {
  return String(Math.floor(Math.random() * 900000) + 100000)
}

function trialDaysElapsed(trialStartIso: string): number {
  const trialStart = new Date(trialStartIso).getTime()
  const now = Date.now()
  return Math.floor((now - trialStart) / (1000 * 60 * 60 * 24))
}

/** GHL Inbound Webhook (Supabase Edge Function secret: GHL_TRIAL_WEBHOOK_URL). Fires on new trial row only. */
async function sendGhlTrialWelcomeWebhook(inserted: Record<string, unknown>): Promise<void> {
  const url =
    (Deno.env.get('GHL_TRIAL_WEBHOOK_URL') || Deno.env.get('GHL_WEBHOOK_URL') || '').trim()
  if (!url || /YOUR_WEBHOOK/i.test(url)) {
    console.info('trial-signup: GHL welcome webhook skipped (set GHL_TRIAL_WEBHOOK_URL in Edge Function secrets)')
    return
  }
  const payload = {
    event: 'trial_signup',
    welcome_email_type: 'trial_welcome',
    access_delivery: 'magic_link',
    full_name: inserted.full_name,
    title: inserted.title,
    email: inserted.email,
    law_firm: inserted.law_firm ?? '—',
    phone: inserted.phone ?? null,
    ccp: inserted.ccp,
    pin: inserted.pin,
    trial_start_at: inserted.trial_start_at,
    trial_user_id: inserted.id,
    note:
      'Portal access is via secure email link (Supabase Auth). CCP/PIN retained for internal continuity only.',
  }
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 15_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    })
    if (!res.ok) {
      const text = await res.text()
      console.warn('trial-signup: GHL webhook non-OK', res.status, text.slice(0, 500))
    }
  } catch (e) {
    console.warn('trial-signup: GHL webhook request failed:', e)
  } finally {
    clearTimeout(t)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const firstName = String(body.first_name ?? body.firstName ?? '').trim()
  const emailRaw = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.title ?? body.role ?? '').trim()

  if (!firstName) {
    return new Response(JSON.stringify({ error: 'First name is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return new Response(JSON.stringify({ error: 'Enter a valid email address.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (isPersonalDomain(emailRaw)) {
    return new Response(
      JSON.stringify({
        error: 'Please use your business email address to request trial access.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (!role) {
    return new Response(JSON.stringify({ error: 'Role is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: existing, error: selErr } = await admin
    .from('trial_users')
    .select('*')
    .eq('email', emailRaw)
    .maybeSingle()

  if (selErr) {
    console.error('trial-signup select:', selErr)
    return new Response(JSON.stringify({ error: 'Could not verify enrollment. Try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (existing) {
    const row = existing as Record<string, unknown>
    const days = trialDaysElapsed(String(row.trial_start_at))
    const expired =
      row.status === 'trial_expired' || (row.status === 'trial_active' && days >= 7)

    if (expired) {
      if (row.status === 'trial_active' && days >= 7) {
        await admin.from('trial_users').update({ status: 'trial_expired' }).eq('id', row.id as string)
      }
      return new Response(JSON.stringify({ error: 'trial_expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: upErr } = await admin
      .from('trial_users')
      .update({ full_name: firstName, title: role })
      .eq('id', row.id as string)

    if (upErr) {
      console.error('trial-signup update existing:', upErr)
      return new Response(JSON.stringify({ error: 'Could not update profile. Try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ action: 'existing_updated', email: emailRaw }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const pin = generatePIN()
  const trialStartAt = new Date().toISOString()
  let inserted: Record<string, unknown> | null = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const ccp = generateCCP()
    const { data, error } = await admin
      .from('trial_users')
      .insert({
        full_name: firstName,
        title: role,
        email: emailRaw,
        law_firm: '—',
        phone: null,
        ccp,
        pin,
        trial_start_at: trialStartAt,
        status: 'trial_active',
        completed_tools: {},
      })
      .select()
      .single()

    if (!error && data) {
      inserted = data as Record<string, unknown>
      break
    }
    const dupMsg = ((error?.message || '') + ' ' + (error?.details || '')).toLowerCase()
    if (error?.code === '23505' && dupMsg.includes('ccp')) {
      continue
    }
    if (error?.code === '23505') {
      return new Response(
        JSON.stringify({
          error:
            'Could not complete signup. If you already have a trial, request a new access link from the signup page.',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    console.error('trial-signup insert:', error)
    return new Response(JSON.stringify({ error: 'Registration failed. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!inserted) {
    return new Response(
      JSON.stringify({ error: 'Registration failed (could not assign a unique record).' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  await sendGhlTrialWelcomeWebhook(inserted)

  return new Response(
    JSON.stringify({
      action: 'created',
      user: {
        full_name: inserted.full_name,
        title: inserted.title,
        email: inserted.email,
        law_firm: inserted.law_firm,
        phone: inserted.phone,
        ccp: inserted.ccp,
        pin: inserted.pin,
        trial_start_at: inserted.trial_start_at,
        id: inserted.id,
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
