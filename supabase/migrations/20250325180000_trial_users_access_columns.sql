-- CASE Clarity subscription fields (updated by stripe-webhook on checkout.session.completed)
ALTER TABLE trial_users
  ADD COLUMN IF NOT EXISTS access_type TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT;

COMMENT ON COLUMN trial_users.access_type IS 'e.g. subscription, single_report';
COMMENT ON COLUMN trial_users.subscription_status IS 'e.g. active, canceled (CASE Clarity subscriptions)';
COMMENT ON COLUMN trial_users.tier IS 'foundation | professional | enterprise when access_type is subscription';
