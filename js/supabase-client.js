/**
 * Browser Supabase client. Load after: @supabase/supabase-js
 */
var SUPABASE_URL = 'https://zmjxyspizdqhrtdcgkwk.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptanh5c3BpemRxaHJ0ZGNna3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MjQ1NDcsImV4cCI6MjA4NTE4NDU0N30.szuVr87xdq1aqYpaM6p390f48ozj4CENU4ksg8vumhM';

if (typeof supabase === 'undefined' || !supabase.createClient) {
  console.error('supabase-client.js: load @supabase/supabase-js before this file.');
} else {
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
