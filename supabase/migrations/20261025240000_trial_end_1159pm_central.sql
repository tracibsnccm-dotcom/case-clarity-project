-- The trial ends at 11:59 PM Central time on day 30 (the signup day is day 1).
-- Access, saving, and deletion all use this same moment.
CREATE OR REPLACE FUNCTION public.cc_trial_end (p_start timestamptz)
  RETURNS timestamptz
  LANGUAGE sql
  IMMUTABLE
  AS $$
  SELECT (((p_start AT TIME ZONE 'America/Chicago')::date + 29)::timestamp + TIME '23:59') AT TIME ZONE 'America/Chicago';
$$;

CREATE OR REPLACE FUNCTION public.cc_access_ok (p_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM trial_users t
    WHERE t.id = p_id
      AND (
        cc_trial_end(t.trial_start_at) > NOW()
        OR (t.subscription_status IN ('active', 'trialing', 'past_due') AND t.subscription_tier IN ('foundation', 'professional', 'enterprise'))
        OR (t.subscription_tier = 'single' AND t.single_review_expires_at > NOW())
      )
  );
$$;
REVOKE ALL ON FUNCTION public.cc_access_ok (uuid) FROM PUBLIC;

-- Delete right at 11:59 PM Central (04:59 UTC in daylight time, 05:59 UTC in standard time),
-- plus the hourly run as a backstop.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cc-purge-trials-1159pm';
  PERFORM cron.schedule('cc-purge-trials-1159pm', '59 4,5 * * *', 'SELECT public.cc_purge_expired_trials();');
END $$;
