/**
 * Browser Supabase client for the paid portal.
 * Load after: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 */

// TODO: Replace with your Supabase project URL (Settings → API → Project URL).
// TODO: For production, inject from environment or a server-rendered config instead of hardcoding.
var SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';

// TODO: Replace with your Supabase anon public key (Settings → API → anon public).
// TODO: Never use the service_role key in browser code.
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

if (typeof supabase === 'undefined' || !supabase.createClient) {
  console.error('supabase-client.js: load @supabase/supabase-js before this file.');
} else {
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
