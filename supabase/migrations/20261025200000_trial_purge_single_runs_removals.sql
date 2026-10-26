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
