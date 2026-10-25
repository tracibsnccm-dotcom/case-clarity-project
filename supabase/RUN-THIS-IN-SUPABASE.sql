-- Billing fields on trial_users, written by the stripe-webhook function.
-- Paying attorneys keep the same account (and CCP number) they used for the trial.
ALTER TABLE public.trial_users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS single_review_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_month_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trial_users_stripe_sub ON public.trial_users (stripe_subscription_id);
