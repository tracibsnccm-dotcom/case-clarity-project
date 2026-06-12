import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BLOCKED = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'me.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com',
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

function trialDaysElapsed(trialStartIso: string): number {
  const trialStart = new Date(trialStartIso).getTime()
  const now = Date.now()
  return Math.floor((now - trialStart) / (1000 * 60 * 60 * 24))
}

// ── Brevo integration (GHL retired) ─────────────────────────────────────────
// Required secrets: BREVO_API_KEY, BREVO_SENDER_EMAIL
// Optional secrets: BREVO_SENDER_NAME (default "Case Clarity"),
//                   BREVO_TRIAL_TEMPLATE_ID (use a Brevo template instead of inline HTML),
//                   BREVO_TRIAL_LIST_ID (also add the contact to this Brevo list)

async function brevoPost(path: string, payload: Record<string, unknown>, apiKey: string): Promise<Response | null> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 15_000)
  try {
    return await fetch('https://api.brevo.com/v3' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey, 'accept': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    })
  } catch (e) {
    console.warn('trial-signup: Brevo request failed:', path, e)
    return null
  } finally {
    clearTimeout(t)
  }
}

function welcomeHtml(firstName: string, ccp: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="background:#0d1f3c;padding:22px 32px">
          <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.04em">CASE CLARITY</span>
        </td></tr>
        <tr><td style="padding:30px 32px 8px">
          <p style="font-size:16px;color:#1a1a1a;margin:0 0 14px">Hi ${firstName},</p>
          <p style="font-size:15px;color:#333;line-height:1.55;margin:0 0 14px">Your <strong>7-day Case Clarity trial is active.</strong></p>
          <p style="font-size:15px;color:#333;line-height:1.55;margin:0 0 14px">A separate email with your <strong>secure sign-in link</strong> is on its way — click it and you're in. No password, no PIN. Any time you return, request a fresh link from the sign-in page.</p>
          <p style="font-size:15px;color:#333;line-height:1.55;margin:0 0 14px">Your case continuity code is <strong>${ccp}</strong>. Keep it handy if you contact support.</p>
          <p style="font-size:15px;color:#333;line-height:1.55;margin:0 0 22px">Over the next 7 days, run a real matter through the platform — that's the fastest way to see what it does for your case timelines and medical record review.</p>
          <p style="font-size:15px;color:#333;line-height:1.55;margin:0 0 6px">Questions? Just reply to this email.</p>
          <p style="font-size:15px;color:#333;margin:0 0 28px">— The Case Clarity Team</p>
        </td></tr>
        <tr><td style="background:#f0f1f3;padding:16px 32px">
          <p style="font-size:12px;color:#777;margin:0">Case Clarity · Reconcile CARE Medical-Legal Systems</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

async function sendBrevoTrialWelcome(inserted: Record<string, unknown>): Promise<void> {
  const apiKey = (Deno.env.get('BREVO_API_KEY') || '').trim()
  const senderEmail = (Deno.env.get('BREVO_SENDER_EMAIL') || '').trim()
  if (!apiKey || !senderEmail) {
    console.warn('trial-signup: Brevo welcome skipped — set BREVO_API_KEY and BREVO_SENDER_EMAIL in Edge Function secrets')
    return
  }
  const senderName = (Deno.env.get('BREVO_SENDER_NAME') || 'Case Clarity').trim()
  const templateId = parseInt(Deno.env.get('BREVO_TRIAL_TEMPLATE_ID') || '', 10)
  const listId = parseInt(Deno.env.get('BREVO_TRIAL_LIST_ID') || '', 10)
  const email = String(inserted.email)
  const firstName = String(inserted.full_name || 'there')
  const ccp = String(inserted.ccp || '')

  // 1) Transactional welcome email
  const emailPayload: Record<string, unknown> = Number.isFinite(templateId)
    ? {
        to: [{ email, name: firstName }],
        templateId,
        params: { FIRSTNAME: firstName, CCP: ccp, TRIAL_START: inserted.trial_start_at },
      }
    : {
        sender: { email: senderEmail, name: senderName },
        to: [{ email, name: firstName }],
        subject: 'Your Case Clarity trial is active',
        htmlContent: welcomeHtml(firstName, ccp),
        replyTo: { email: senderEmail, name: senderName },
      }
  const emailRes = await brevoPost('/smtp/email', emailPayload, apiKey)
  if (emailRes && !emailRes.ok) {
    console.warn('trial-signup: Brevo email non-OK', emailRes.status, (await emailRes.text()).slice(0, 500))
  }

  // 2) Contact upsert so follow-up automations can run
  const contactPayload: Record<string, unknown> = {
    email,
    updateEnabled: true,
    attributes: {
      FIRSTNAME: firstName,
      TITLE: inserted.title,
      CCP: ccp,
      TRIAL_START: inserted.trial_start_at,
      TRIAL_USER_ID: inserted.id,
      SOURCE: 'case_clarity_trial',
    },
  }
  if (Number.isFinite(listId)) contactPayload.listIds = [listId]
  const contactRes = await brevoPost('/contacts', contactPayload, apiKey)
  if (contactRes && !contactRes.ok && contactRes.status !== 400) {
    // 400 with "Contact already exist" is fine when updateEnabled upserts
    console.warn('trial-signup: Brevo contact non-OK', contactRes.status, (await contactRes.text()).slice(0, 500))
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
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return new Response(JSON.stringify({ error: 'Enter a valid email address.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (isPersonalDomain(emailRaw)) {
    return new Response(JSON.stringify({ error: 'Please use your business email address to request trial access.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!role) {
    return new Response(JSON.stringify({ error: 'Role is required.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Check if already enrolled
  const { data: existing, error: selErr } = await admin
    .from('trial_users')
    .select('*')
    .eq('email', emailRaw)
    .maybeSingle()

  if (selErr) {
    console.error('trial-signup select:', selErr)
    return new Response(JSON.stringify({ error: 'Could not verify enrollment. Try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (existing) {
    const row = existing as Record<string, unknown>
    const days = trialDaysElapsed(String(row.trial_start_at))
    const expired = row.status === 'trial_expired' || (row.status === 'trial_active' && days >= 7)

    if (expired) {
      if (row.status === 'trial_active' && days >= 7) {
        await admin.from('trial_users').update({ status: 'trial_expired' }).eq('id', row.id as string)
      }
      return new Response(JSON.stringify({ error: 'trial_expired' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update name/role and return — magic link is sent separately by the browser
    await admin.from('trial_users').update({ full_name: firstName, title: role }).eq('id', row.id as string)
    return new Response(JSON.stringify({ action: 'existing_updated', email: emailRaw }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Create new trial record — CCP for case continuity, no PIN (magic link is the access method)
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
        law_firm: '\u2014',
        phone: null,
        ccp,
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
    if (error?.code === '23505' && dupMsg.includes('ccp')) continue
    if (error?.code === '23505') {
      return new Response(JSON.stringify({ error: 'Could not complete signup. If you already have a trial, request a new access link.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.error('trial-signup insert:', error)
    return new Response(JSON.stringify({ error: 'Registration failed. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!inserted) {
    return new Response(JSON.stringify({ error: 'Registration failed (could not assign a unique record).' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await sendBrevoTrialWelcome(inserted)

  return new Response(JSON.stringify({
    action: 'created',
    user: {
      full_name: inserted.full_name,
      title: inserted.title,
      email: inserted.email,
      ccp: inserted.ccp,
      trial_start_at: inserted.trial_start_at,
      id: inserted.id,
    },
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
