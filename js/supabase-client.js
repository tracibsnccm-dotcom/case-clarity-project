/*
 * C.A.S.E. Clarity Paid Portal
 * Supabase browser client (CDN global: window.supabase)
 */

const SUPABASE_URL = 'https://zmjxyspizdqhrtdcgkwk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptanh5c3BpemRxaHJ0ZGNna3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MjQ1NDcsImV4cCI6MjA4NTE4NDU0N30.szuVr87xdq1aqYpaM6p390f48ozj4CENU4ksg8vumhM';

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
