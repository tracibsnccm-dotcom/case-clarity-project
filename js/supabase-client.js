/*
 * C.A.S.E. Clarity — Supabase browser client (CDN global: window.supabase)
 * Configured for PKCE + magic-link callback handling.
 */

const SUPABASE_URL = 'https://zmjxyspizdqhrtdcgkwk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptanh5c3BpemRxaHJ0ZGNna3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MjQ1NDcsImV4cCI6MjA4NTE4NDU0N30.szuVr87xdq1aqYpaM6p390f48ozj4CENU4ksg8vumhM';

/** Exposed for Edge Function calls (e.g. trial-signup) from static HTML. */
window.CASE_CLARITY_SUPABASE_URL = SUPABASE_URL;
window.CASE_CLARITY_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

/**
 * Absolute URL for Supabase Auth redirect (magic link, OAuth).
 * Add this URL in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
 */
window.caseClarityGetAuthCallbackUrl = function caseClarityGetAuthCallbackUrl() {
  if (typeof window === 'undefined' || !window.location) return '';
  return new URL('auth-callback.html', window.location.href).href;
};
