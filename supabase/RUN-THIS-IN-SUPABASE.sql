-- C.A.S.E. Clarity setup (Oct 25, part 3). Safe to run more than once.

-- ===== 20261025200000_trial_purge_single_runs_removals =====
-- C.A.S.E. Clarity: trial data deletion, Single Client Review run limits, client removal log.
-- Safe to run more than once.

-- ── Who currently has access ───────────────────────────────────────────────
-- Trial: 30 days from trial_start_at. Monthly plan: active subscription.
-- Single Client Review: until single_review_expires_at.
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
        t.trial_start_at + INTERVAL '30 days' > NOW()
        OR (t.subscription_status IN ('active', 'trialing', 'past_due') AND t.subscription_tier IN ('foundation', 'professional', 'enterprise'))
        OR (t.subscription_tier = 'single' AND t.single_review_expires_at > NOW())
      )
  );
$$;
REVOKE ALL ON FUNCTION public.cc_access_ok (uuid) FROM PUBLIC;

-- No saving to an account whose trial (or Single Client Review) has ended.
CREATE OR REPLACE FUNCTION public.trial_workspace_save (p_id uuid, p_ccp text, p_data jsonb)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_ts timestamptz := NOW();
BEGIN
  IF NOT trial_workspace_owner_ok(p_id, p_ccp) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT cc_access_ok(p_id) THEN
    RAISE EXCEPTION 'access ended';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'invalid workspace';
  END IF;
  IF octet_length(p_data::text) > 5000000 THEN
    RAISE EXCEPTION 'workspace too large';
  END IF;
  INSERT INTO trial_workspace (trial_user_id, data, updated_at)
    VALUES (p_id, p_data, v_ts)
  ON CONFLICT (trial_user_id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  RETURN v_ts;
END;
$$;
REVOKE ALL ON FUNCTION public.trial_workspace_save (uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trial_workspace_save (uuid, text, jsonb) TO anon, authenticated;

-- ── Trial data deletion ────────────────────────────────────────────────────
-- Deletes all saved case information, answers, and reports for accounts whose
-- trial (or Single Client Review) has ended without an active monthly plan.
-- Accounts that ever had a monthly subscription are not touched here.
CREATE OR REPLACE FUNCTION public.cc_purge_expired_trials ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM trial_workspace w
  USING trial_users t
  WHERE w.trial_user_id = t.id
    AND t.stripe_subscription_id IS NULL
    AND NOT cc_access_ok(t.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cc_purge_expired_trials () FROM PUBLIC;

-- Run it every hour.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cc-purge-expired-trials';
  PERFORM cron.schedule('cc-purge-expired-trials', '7 * * * *', 'SELECT public.cc_purge_expired_trials();');
END $$;

-- ── Single Client Review: each tool runs once ──────────────────────────────
-- single_runs: {"1": "2026-10-25T…", "2": …} — the date each tool was run.
-- single_replacement_tool: type a tool number (1–6) in the Table Editor to allow
-- ONE replacement run of that tool (e.g. after a technical failure). It clears itself.
ALTER TABLE public.trial_users
  ADD COLUMN IF NOT EXISTS single_runs JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS single_replacement_tool INTEGER;

CREATE OR REPLACE FUNCTION public.single_status (p_id uuid, p_ccp text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  r trial_users%ROWTYPE;
BEGIN
  IF NOT trial_workspace_owner_ok(p_id, p_ccp) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT * INTO r FROM trial_users WHERE id = p_id;
  RETURN jsonb_build_object('runs', COALESCE(r.single_runs, '{}'::jsonb), 'replacement_tool', r.single_replacement_tool);
END;
$$;

CREATE OR REPLACE FUNCTION public.single_claim_run (p_id uuid, p_ccp text, p_tool integer)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  r trial_users%ROWTYPE;
  k text := p_tool::text;
BEGIN
  IF NOT trial_workspace_owner_ok(p_id, p_ccp) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF p_tool < 1 OR p_tool > 6 THEN
    RAISE EXCEPTION 'invalid tool';
  END IF;
  SELECT * INTO r FROM trial_users WHERE id = p_id FOR UPDATE;
  -- Only Single Client Review accounts are limited.
  IF r.subscription_tier IS DISTINCT FROM 'single'
     OR (r.subscription_status IN ('active', 'trialing', 'past_due') AND r.subscription_tier IN ('foundation', 'professional', 'enterprise')) THEN
    RETURN jsonb_build_object('ok', true, 'limited', false);
  END IF;
  IF r.single_review_expires_at IS NULL OR r.single_review_expires_at <= NOW() THEN
    RETURN jsonb_build_object('ok', false, 'limited', true, 'reason', 'expired');
  END IF;
  IF COALESCE(r.single_runs, '{}'::jsonb) ? k THEN
    IF r.single_replacement_tool = p_tool THEN
      UPDATE trial_users
        SET single_runs = jsonb_set(COALESCE(single_runs, '{}'::jsonb), ARRAY[k], to_jsonb(NOW())),
            single_replacement_tool = NULL
        WHERE id = p_id;
      RETURN jsonb_build_object('ok', true, 'limited', true, 'replacement', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'limited', true, 'reason', 'used', 'used_at', r.single_runs -> k);
  END IF;
  UPDATE trial_users
    SET single_runs = jsonb_set(COALESCE(single_runs, '{}'::jsonb), ARRAY[k], to_jsonb(NOW()))
    WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'limited', true);
END;
$$;

REVOKE ALL ON FUNCTION public.single_status (uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.single_claim_run (uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.single_status (uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.single_claim_run (uuid, text, integer) TO anon, authenticated;

-- ── Client removal confirmations (monthly plans) ───────────────────────────
-- A dated record that the attorney confirmed (checkbox + CCP number) that a
-- client's information would be permanently deleted. Only the record is kept.
CREATE TABLE IF NOT EXISTS public.client_removals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_user_id UUID NOT NULL REFERENCES public.trial_users (id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  confirmed_ccp TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delete_on TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.client_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_removals FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_client_removal (p_id uuid, p_ccp text, p_client text, p_delete_on timestamptz)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v uuid;
BEGIN
  IF NOT trial_workspace_owner_ok(p_id, p_ccp) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO client_removals (trial_user_id, client_name, confirmed_ccp, delete_on)
    VALUES (p_id, left(COALESCE(p_client, ''), 200), p_ccp, p_delete_on)
    RETURNING id INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.log_client_removal (uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_removal (uuid, text, text, timestamptz) TO anon, authenticated;

-- ===== 20261025210000_trial_users_column_lock =====
-- Signed-in attorneys may only change the few account fields the dashboard updates.
-- Plan, subscription, trial dates, Single Client Review runs, and the replacement-run
-- field can only be changed by the Stripe function (service role) or by RCMS in the
-- Table Editor.
REVOKE UPDATE ON public.trial_users FROM anon, authenticated;
GRANT UPDATE (completed_tools, status, auth_user_id, portal_access_count, last_portal_login)
  ON public.trial_users TO authenticated;

-- ===== 20261025220000_portal_import =====
-- Moving trial cases into the paid portal (done once, by the attorney's first portal sign-in).
-- case_cases.trial_case_key: which trial case a portal case came from, so a case is never copied twice.
ALTER TABLE public.case_cases ADD COLUMN IF NOT EXISTS trial_case_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS case_cases_trial_case_key_uidx
  ON public.case_cases (attorney_user_id, trial_case_key)
  WHERE trial_case_key IS NOT NULL;

-- When the trial cases were moved.
ALTER TABLE public.trial_users ADD COLUMN IF NOT EXISTS portal_import_done_at TIMESTAMPTZ;

-- The signed-in attorney marks their own move as done (only that one field).
CREATE OR REPLACE FUNCTION public.cc_mark_portal_import ()
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v timestamptz := NOW();
BEGIN
  UPDATE trial_users
    SET portal_import_done_at = v
    WHERE auth_user_id = auth.uid()
       OR (auth_user_id IS NULL AND lower(trim(email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', ''))));
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.cc_mark_portal_import () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_mark_portal_import () TO authenticated;

-- ===== 20261025230000_portal_client_limits =====
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

-- ===== 20261025240000_trial_end_1159pm_central =====
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
