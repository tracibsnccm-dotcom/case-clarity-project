-- GHL: notify when all six active trial tools are completed while trial is still active (idempotent flag)
ALTER TABLE trial_users
  ADD COLUMN IF NOT EXISTS trial_still_active_email_sent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN trial_users.trial_still_active_email_sent IS 'Set after GHL webhook fires for “all active tools complete during trial”';
