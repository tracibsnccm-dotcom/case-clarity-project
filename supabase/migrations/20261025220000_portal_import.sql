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
