/*
 * C.A.S.E. Clarity — Supabase browser client
 * Uses implicit flow for reliable magic-link sign-in across all browsers and devices.
 */

const SUPABASE_URL = 'https://zmjxyspizdqhrtdcgkwk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptanh5c3BpemRxaHJ0ZGNna3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MjQ1NDcsImV4cCI6MjA4NTE4NDU0N30.szuVr87xdq1aqYpaM6p390f48ozj4CENU4ksg8vumhM';

window.CASE_CLARITY_SUPABASE_URL = SUPABASE_URL;
window.CASE_CLARITY_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
  },
});

window.caseClarityGetAuthCallbackUrl = function caseClarityGetAuthCallbackUrl() {
  if (typeof window === 'undefined' || !window.location) return '';
  return new URL('auth-callback.html', window.location.href).href;
};
