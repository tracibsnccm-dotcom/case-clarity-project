-- Webhook maps Stripe metadata tier → subscription_tier (distinct from legacy tier column if present)
ALTER TABLE trial_users
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT;

UPDATE trial_users
SET subscription_tier = tier
WHERE subscription_tier IS NULL AND tier IS NOT NULL;

COMMENT ON COLUMN trial_users.subscription_tier IS 'foundation | professional | enterprise (Case Clarity checkout)';
