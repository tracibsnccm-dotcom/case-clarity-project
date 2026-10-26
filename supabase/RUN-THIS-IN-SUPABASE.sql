-- Trial cases brought into the portal count toward the plan's client limit like any other
-- client (the attorney chooses which ones come over when they have more than the plan allows).
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
  lim := cc_client_limit_for(NEW.attorney_user_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM case_cases c WHERE c.attorney_user_id = NEW.attorney_user_id;
  IF used >= lim THEN
    RAISE EXCEPTION 'CLIENT_LIMIT: your plan includes % clients', lim USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cc_case_limit_check () FROM PUBLIC, anon, authenticated;
