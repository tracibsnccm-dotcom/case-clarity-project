-- C.A.S.E. Clarity setup: account saving + tool videos. Safe to run more than once.

-- Trial workspace: saves each trial attorney's case information, tool answers and
-- reports to their account, so work survives logout, cleared browsers, and a
-- different device. One row per trial user.
--
-- Access is only through the two SECURITY DEFINER functions below, which check
-- that the caller owns the trial row (signed-in user, or the id + CCP pair the
-- dashboard already uses). No direct table access is granted.

CREATE TABLE IF NOT EXISTS public.trial_workspace (
  trial_user_id UUID PRIMARY KEY REFERENCES public.trial_users (id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.trial_workspace ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trial_workspace FROM anon, authenticated;

-- True when the caller owns trial row p_id.
CREATE OR REPLACE FUNCTION public.trial_workspace_owner_ok (p_id uuid, p_ccp text)
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
        (p_ccp IS NOT NULL AND p_ccp <> '' AND t.ccp = p_ccp)
        OR (auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid())
        OR (trial_current_jwt_email() <> '' AND lower(trim(t.email)) = trial_current_jwt_email())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.trial_workspace_owner_ok (uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trial_workspace_get (p_id uuid, p_ccp text)
  RETURNS TABLE (data jsonb, updated_at timestamptz)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF NOT trial_workspace_owner_ok(p_id, p_ccp) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT w.data, w.updated_at FROM trial_workspace w WHERE w.trial_user_id = p_id;
END;
$$;

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

REVOKE ALL ON FUNCTION public.trial_workspace_get (uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trial_workspace_save (uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trial_workspace_get (uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_workspace_save (uuid, text, jsonb) TO anon, authenticated;


-- Tool videos: the YouTube videos shown in each tool under "Learn more".
--
-- To add a video: Supabase → Table Editor → tool_videos → Insert row.
--   tool        CCI, CSA, CAF, HSI, FCI, RRF, or ALL (shows in every tool)
--   title       the video title as it should appear
--   url         the YouTube link (youtube.com or youtu.be)
--   description optional one line about what the video covers
--   sort_order  lower numbers show first (optional)
--   active      uncheck to hide a video without deleting it
-- A video that belongs to two tools gets one row per tool.
-- Changes show in the tools right away; no code change or redeploy.

CREATE TABLE IF NOT EXISTS public.tool_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool TEXT NOT NULL CHECK (tool IN ('CCI', 'CSA', 'CAF', 'HSI', 'FCI', 'RRF', 'ALL')),
  title TEXT NOT NULL,
  url TEXT NOT NULL CHECK (url ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/'),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_videos_tool_idx ON public.tool_videos (tool, sort_order);

ALTER TABLE public.tool_videos ENABLE ROW LEVEL SECURITY;

-- Anyone using the tools may read active videos. Only you (Table Editor) can add or change them.
REVOKE ALL ON public.tool_videos FROM anon, authenticated;
GRANT SELECT ON public.tool_videos TO anon, authenticated;

DROP POLICY IF EXISTS tool_videos_read_active ON public.tool_videos;
CREATE POLICY tool_videos_read_active ON public.tool_videos
  FOR SELECT TO anon, authenticated
  USING (active);
