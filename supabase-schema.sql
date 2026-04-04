-- ═══════════════════════════════════════════════════════════════════════════
-- Case Clarity — trial_users (run in Supabase SQL Editor)
-- After deploy: ensure RLS policies match your security model (see comments).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trial_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    title TEXT NOT NULL,
    email TEXT NOT NULL,
    law_firm TEXT NOT NULL,
    phone TEXT,
    ccp TEXT NOT NULL,
    pin TEXT NOT NULL,
    trial_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'trial_active',
    completed_tools JSONB NOT NULL DEFAULT '{}'::jsonb,
    trial_still_active_email_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT trial_users_email_unique UNIQUE (email),
    CONSTRAINT trial_users_ccp_unique UNIQUE (ccp)
);

CREATE INDEX IF NOT EXISTS idx_trial_users_ccp ON trial_users(ccp);
CREATE INDEX IF NOT EXISTS idx_trial_users_email ON trial_users(email);
CREATE INDEX IF NOT EXISTS idx_trial_users_status ON trial_users(status);

ALTER TABLE trial_users ENABLE ROW LEVEL SECURITY;

-- Anonymous signup + login validation (tighten for production, e.g. Edge Function + service role)
DROP POLICY IF EXISTS "trial_users_select_login" ON trial_users;
DROP POLICY IF EXISTS "trial_users_insert_signup" ON trial_users;
DROP POLICY IF EXISTS "trial_users_update_progress" ON trial_users;

CREATE POLICY "trial_users_select_login"
    ON trial_users FOR SELECT
    USING (true);

CREATE POLICY "trial_users_insert_signup"
    ON trial_users FOR INSERT
    WITH CHECK (true);

CREATE POLICY "trial_users_update_progress"
    ON trial_users FOR UPDATE
    USING (true);

COMMENT ON TABLE trial_users IS 'Trial signups: CCP#/PIN auth, tool completion JSONB, status lifecycle';
COMMENT ON COLUMN trial_users.completed_tools IS 'e.g. {"CCI":{"completed":true,"completed_at":"..."}, ...}';
