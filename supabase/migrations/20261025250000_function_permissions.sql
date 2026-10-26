-- Internal functions: no one calls these from a browser (Supabase grants new functions to
-- anon/authenticated by default, so they are revoked explicitly here).
REVOKE EXECUTE ON FUNCTION public.cc_access_ok (uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cc_purge_expired_trials () FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cc_purge_removed_clients () FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cc_account_for (uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cc_client_limit_for (uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cc_case_limit_check () FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cc_run_removal_check () FROM anon, authenticated;
-- Signed-in attorneys only.
REVOKE EXECUTE ON FUNCTION public.cc_portal_client_limit () FROM anon;
REVOKE EXECUTE ON FUNCTION public.cc_mark_portal_import () FROM anon;
REVOKE EXECUTE ON FUNCTION public.cc_schedule_client_removal (uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cc_cancel_client_removal (uuid) FROM anon;
