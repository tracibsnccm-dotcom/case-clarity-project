-- Tighten trial_users RLS: auth-scoped direct access; anon table access removed.
-- Legacy CCP + dashboard path uses SECURITY DEFINER RPCs (id + ccp from browser after PIN login).
-- New / returning magic-link signup uses Edge Function trial-signup (service role).

ALTER TABLE trial_users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trial_users_auth_user_id_uidx
  ON trial_users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Normalized email from the caller JWT (magic link / session).
CREATE OR REPLACE FUNCTION public.trial_current_jwt_email ()
  RETURNS text
  LANGUAGE sql
  STABLE
  AS $$
  SELECT
    lower(trim(COALESCE((auth.jwt() ->> 'email'), '')));

$$;

-- CCP + PIN login (replaces anon SELECT ... WHERE ccp AND pin).
CREATE OR REPLACE FUNCTION public.trial_ccp_login (p_ccp text, p_pin text)
  RETURNS SETOF trial_users
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT
    *
  FROM
    trial_users t
  WHERE
    t.ccp = p_ccp
    AND t.pin = p_pin;

$$;

REVOKE ALL ON FUNCTION public.trial_ccp_login (text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.trial_ccp_login (text, text) TO anon;

GRANT EXECUTE ON FUNCTION public.trial_ccp_login (text, text) TO authenticated;

-- Legacy dashboard: row fetch when browser holds id + ccp (after CCP/PIN login).
CREATE OR REPLACE FUNCTION public.trial_legacy_get (p_id uuid, p_ccp text)
  RETURNS SETOF trial_users
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT
    *
  FROM
    trial_users t
  WHERE
    t.id = p_id
    AND t.ccp = p_ccp;

$$;

REVOKE ALL ON FUNCTION public.trial_legacy_get (uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.trial_legacy_get (uuid, text) TO anon;

GRANT EXECUTE ON FUNCTION public.trial_legacy_get (uuid, text) TO authenticated;

-- Legacy dashboard: bounded updates (completed_tools, status, portal counters).
CREATE OR REPLACE FUNCTION public.trial_legacy_update (
  p_id uuid,
  p_ccp text,
  p_completed_tools jsonb DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_increment_portal boolean DEFAULT FALSE
)
  RETURNS SETOF trial_users
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT
      1
    FROM
      trial_users
    WHERE
      id = p_id
      AND ccp = p_ccp) THEN
    RETURN;
  END IF;
  UPDATE
    trial_users
  SET
    completed_tools = CASE WHEN p_completed_tools IS NOT NULL THEN
      p_completed_tools
    ELSE
      completed_tools
    END,
    status = CASE WHEN p_status IS NOT NULL THEN
      p_status
    ELSE
      status
    END,
    portal_access_count = CASE WHEN p_increment_portal THEN
      COALESCE(portal_access_count, 0) + 1
    ELSE
      portal_access_count
    END,
    last_portal_login = CASE WHEN p_increment_portal THEN
      now()
    ELSE
      last_portal_login
    END
  WHERE
    id = p_id
    AND ccp = p_ccp;
  RETURN QUERY
  SELECT
    *
  FROM
    trial_users
  WHERE
    id = p_id
    AND ccp = p_ccp;
END;

$$;

REVOKE ALL ON FUNCTION public.trial_legacy_update (uuid, text, jsonb, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.trial_legacy_update (uuid, text, jsonb, text, boolean) TO anon;

GRANT EXECUTE ON FUNCTION public.trial_legacy_update (uuid, text, jsonb, text, boolean) TO authenticated;

-- Replace open policies
DROP POLICY IF EXISTS "trial_users_select_login" ON trial_users;

DROP POLICY IF EXISTS "trial_users_insert_signup" ON trial_users;

DROP POLICY IF EXISTS "trial_users_update_progress" ON trial_users;

DROP POLICY IF EXISTS trial_users_select_own ON trial_users;

DROP POLICY IF EXISTS trial_users_update_own ON trial_users;

-- Authenticated magic-link users: own row by linked uid or matching signup email until linked.
CREATE POLICY trial_users_select_own ON trial_users FOR SELECT TO authenticated
  USING ((auth_user_id = auth.uid())
    OR (auth_user_id IS NULL
      AND length(trial_current_jwt_email()) > 0
      AND lower(trim(email)) = trial_current_jwt_email()));

CREATE POLICY trial_users_update_own ON trial_users FOR UPDATE TO authenticated
  USING ((auth_user_id = auth.uid())
    OR (auth_user_id IS NULL
      AND length(trial_current_jwt_email()) > 0
      AND lower(trim(email)) = trial_current_jwt_email()))
  WITH CHECK ((auth_user_id IS NULL
      OR auth_user_id = auth.uid())
    AND length(trial_current_jwt_email()) > 0
    AND lower(trim(email)) = trial_current_jwt_email());

-- No INSERT/DELETE for anon/authenticated on table (signup via Edge Function + service role).

COMMENT ON COLUMN trial_users.auth_user_id IS 'Supabase Auth user id; set on first dashboard session to tighten row ownership.';

COMMENT ON FUNCTION public.trial_ccp_login (text, text) IS 'CCP/PIN portal login; replaces broad anon SELECT.';

COMMENT ON FUNCTION public.trial_legacy_get (uuid, text) IS 'Legacy dashboard read when session is not Supabase Auth; requires id+ccp pair.';

COMMENT ON FUNCTION public.trial_legacy_update (uuid, text, jsonb, text, boolean) IS 'Legacy dashboard writes; requires id+ccp pair; whitelisted columns only.';
