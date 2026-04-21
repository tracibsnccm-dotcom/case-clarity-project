-- Trial portal visit tracking (optional; dashboard updates these when present)
ALTER TABLE trial_users ADD COLUMN IF NOT EXISTS portal_access_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trial_users ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMPTZ;
