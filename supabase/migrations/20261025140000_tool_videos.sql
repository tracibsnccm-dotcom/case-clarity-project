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
