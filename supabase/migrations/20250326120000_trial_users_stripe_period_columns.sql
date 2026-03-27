-- Stripe customer id + subscription billing period (stripe-webhook checkout.session.completed)
ALTER TABLE trial_users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

COMMENT ON COLUMN trial_users.stripe_customer_id IS 'Stripe Customer id (cus_...) when known';
COMMENT ON COLUMN trial_users.subscription_current_period_start IS 'Current subscription period start from Stripe';
COMMENT ON COLUMN trial_users.subscription_current_period_end IS 'Current subscription period end from Stripe';
