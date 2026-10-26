-- C.A.S.E. Clarity portal: client limits by plan, and removing a client on the renewal date.
--   Foundation 4 clients · Professional 12 · Enterprise unlimited. Portal admins have no limit.
--   Cases brought over from the trial (trial_case_key) are always allowed in.
--   Removing a client needs the attorney's CCP number; the client stays (reports can be
--   downloaded, no new runs) until the renewal date, then all of its data is deleted.
-- Safe to run more than once.

ALTER TABLE public.case_cases ADD COLUMN IF NOT EXISTS removal_on TIMESTAMPTZ;

-- The account (trial_users row) for a portal user.
CREATE OR REPLACE FUNCTION public.cc_account_for (p_uid uuid)
  RETURNS public.trial_users
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT t.* FROM trial_users t
  WHERE t.auth_user_id = p_uid
     OR (t.auth_user_id IS NULL AND lower(trim(t.email)) = (SELECT lower(trim(u.email)) FROM auth.users u WHERE u.id = p_uid))
  ORDER BY (t.auth_user_id = p_uid) DESC NULLS LAST
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.cc_account_for (uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cc_client_limit_for (p_uid uuid)
  RETURNS integer   -- NULL = no limit
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  a trial_users;
BEGIN
  IF EXISTS (SELECT 1 FROM case_attorney_profiles p WHERE p.user_id = p_uid AND p.is_portal_admin = TRUE) THEN
    RETURN NULL;
  END IF;
  a := cc_account_for(p_uid);
  IF a.id IS NULL THEN RETURN 0; END IF;
  IF a.subscription_status IN ('active', 'trialing', 'past_due') THEN
    IF a.subscription_tier = 'foundation' THEN RETURN 4; END IF;
    IF a.subscription_tier = 'professional' THEN RETURN 12; END IF;
    IF a.subscription_tier = 'enterprise' THEN RETURN NULL; END IF;
  END IF;
  RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.cc_client_limit_for (uuid) FROM PUBLIC;

-- Signed-in attorney: their plan, limit, and how many clients they have.
CREATE OR REPLACE FUNCTION public.cc_portal_client_limit ()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  a trial_users;
BEGIN
  a := cc_account_for(auth.uid());
  RETURN jsonb_build_object(
    'plan', a.subscription_tier,
    'limit', cc_client_limit_for(auth.uid()),
    'used', (SELECT count(*) FROM case_cases c WHERE c.attorney_user_id = auth.uid()),
    'renewal_on', a.subscription_current_period_end
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cc_portal_client_limit () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_portal_client_limit () TO authenticated;

-- New cases beyond the plan's limit are refused (trial cases being brought over are allowed).
CREATE OR REPLACE FUNCTION public.cc_case_limit_check ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  lim integer;
  used integer;
BEGIN
  IF NEW.trial_case_key IS NOT NULL THEN RETURN NEW; END IF;
  lim := cc_client_limit_for(NEW.attorney_user_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM case_cases c WHERE c.attorney_user_id = NEW.attorney_user_id;
  IF used >= lim THEN
    RAISE EXCEPTION 'CLIENT_LIMIT: your plan includes % clients', lim USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cc_case_limit_check ON public.case_cases;
CREATE TRIGGER cc_case_limit_check BEFORE INSERT ON public.case_cases
  FOR EACH ROW EXECUTE FUNCTION public.cc_case_limit_check();

-- Remove a client on the renewal date. The CCP number is checked here, on the server.
CREATE OR REPLACE FUNCTION public.cc_schedule_client_removal (p_case_id uuid, p_ccp text)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  a trial_users;
  c case_cases;
  v_on timestamptz;
BEGIN
  SELECT * INTO c FROM case_cases WHERE id = p_case_id AND attorney_user_id = auth.uid();
  IF c.id IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  a := cc_account_for(auth.uid());
  IF a.id IS NULL OR upper(trim(COALESCE(p_ccp, ''))) <> upper(trim(COALESCE(a.ccp, ''))) THEN
    RAISE EXCEPTION 'CCP_MISMATCH';
  END IF;
  v_on := COALESCE(a.subscription_current_period_end, NOW() + INTERVAL '30 days');
  IF v_on < NOW() THEN v_on := NOW() + INTERVAL '30 days'; END IF;
  UPDATE case_cases SET removal_on = v_on WHERE id = p_case_id;
  INSERT INTO client_removals (trial_user_id, client_name, confirmed_ccp, delete_on)
    VALUES (a.id, left(COALESCE(c.client_name, c.case_title, ''), 200), a.ccp, v_on);
  RETURN v_on;
END;
$$;
REVOKE ALL ON FUNCTION public.cc_schedule_client_removal (uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_schedule_client_removal (uuid, text) TO authenticated;

-- Keep the client after all (before the renewal date).
CREATE OR REPLACE FUNCTION public.cc_cancel_client_removal (p_case_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  UPDATE case_cases SET removal_on = NULL
    WHERE id = p_case_id AND attorney_user_id = auth.uid() AND removal_on > NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.cc_cancel_client_removal (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_cancel_client_removal (uuid) TO authenticated;

-- No new runs on a client being removed.
CREATE OR REPLACE FUNCTION public.cc_run_removal_check ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM case_cases c WHERE c.id = NEW.case_id AND c.removal_on IS NOT NULL) THEN
    RAISE EXCEPTION 'CLIENT_BEING_REMOVED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cc_run_removal_check ON public.case_tool_runs;
CREATE TRIGGER cc_run_removal_check BEFORE INSERT ON public.case_tool_runs
  FOR EACH ROW EXECUTE FUNCTION public.cc_run_removal_check();

-- On the renewal date, delete removed clients and everything saved for them.
CREATE OR REPLACE FUNCTION public.cc_purge_removed_clients ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT array_agg(id) INTO ids FROM case_cases WHERE removal_on IS NOT NULL AND removal_on <= NOW();
  IF ids IS NULL THEN RETURN 0; END IF;
  DELETE FROM case_tool_runs WHERE case_id = ANY (ids);
  DELETE FROM case_tool_drafts WHERE case_id = ANY (ids);
  IF to_regclass('public.case_note_sentinel_events') IS NOT NULL THEN
    EXECUTE 'DELETE FROM case_note_sentinel_events WHERE original_case_id = ANY ($1)' USING ids;
  END IF;
  IF to_regclass('public.case_notes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM case_notes WHERE case_id = ANY ($1)' USING ids;
  END IF;
  DELETE FROM case_cases WHERE id = ANY (ids);
  RETURN array_length(ids, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.cc_purge_removed_clients () FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cc-purge-removed-clients';
  PERFORM cron.schedule('cc-purge-removed-clients', '17 * * * *', 'SELECT public.cc_purge_removed_clients();');
END $$;
