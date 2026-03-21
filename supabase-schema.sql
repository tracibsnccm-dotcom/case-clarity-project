-- Case Clarity Project: Trial Users Table Schema
-- Run this in your Supabase SQL Editor to create the trial_users table

CREATE TABLE IF NOT EXISTS trial_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    title TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    law_firm TEXT NOT NULL,
    phone TEXT,
    ccp TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL,
    trial_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'trial_active' CHECK (status IN ('trial_active', 'trial_expired', 'subscribed', 'cancelled')),
    completed_tools JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on ccp for fast lookups
CREATE INDEX IF NOT EXISTS idx_trial_users_ccp ON trial_users(ccp);
CREATE INDEX IF NOT EXISTS idx_trial_users_email ON trial_users(email);
CREATE INDEX IF NOT EXISTS idx_trial_users_status ON trial_users(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_trial_users_updated_at BEFORE UPDATE ON trial_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE trial_users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous reads for login validation
-- Note: Adjust this based on your security requirements
-- For production, you may want to restrict this further
CREATE POLICY "Allow anonymous read for login" ON trial_users
    FOR SELECT USING (true);

-- Create policy to allow anonymous inserts for signup
CREATE POLICY "Allow anonymous insert for signup" ON trial_users
    FOR INSERT WITH CHECK (true);

-- Create policy to allow updates for authenticated users (via service role or authenticated users)
-- Note: In production, you may want to restrict updates to the user's own record
CREATE POLICY "Allow updates for users" ON trial_users
    FOR UPDATE USING (true);

-- Comments for documentation
COMMENT ON TABLE trial_users IS 'Stores trial user accounts with CCP# and PIN authentication';
COMMENT ON COLUMN trial_users.ccp IS 'Case Clarity Project number (format: CCP-XXXXXX)';
COMMENT ON COLUMN trial_users.pin IS '6-digit PIN for authentication';
COMMENT ON COLUMN trial_users.completed_tools IS 'JSONB object tracking which tools have been completed: {"CCI": {"completed": true, "completed_at": "..."}, ...}';
COMMENT ON COLUMN trial_users.status IS 'Account status: trial_active, trial_expired, subscribed, cancelled';
