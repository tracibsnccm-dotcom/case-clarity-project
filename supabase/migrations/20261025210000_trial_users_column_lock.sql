-- Signed-in attorneys may only change the few account fields the dashboard updates.
-- Plan, subscription, trial dates, Single Client Review runs, and the replacement-run
-- field can only be changed by the Stripe function (service role) or by RCMS in the
-- Table Editor.
REVOKE UPDATE ON public.trial_users FROM anon, authenticated;
GRANT UPDATE (completed_tools, status, auth_user_id, portal_access_count, last_portal_login)
  ON public.trial_users TO authenticated;
