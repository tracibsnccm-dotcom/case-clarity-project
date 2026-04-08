-- case_tool_drafts: autosaved partial tool answers (paid portal)
-- One row per (case, attorney, tool); upsert on save.

CREATE TABLE IF NOT EXISTS case_tool_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES case_cases (id) ON DELETE CASCADE,
    attorney_user_id UUID NOT NULL,
    tool_key TEXT NOT NULL,
    draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT case_tool_drafts_case_attorney_tool_unique UNIQUE (case_id, attorney_user_id, tool_key)
);

CREATE INDEX IF NOT EXISTS idx_case_tool_drafts_case_tool
    ON case_tool_drafts (case_id, tool_key);

COMMENT ON TABLE case_tool_drafts IS 'Partial in-progress answers for portal tools; deleted when a run completes.';

ALTER TABLE case_tool_drafts ENABLE ROW LEVEL SECURITY;

-- Attorneys may manage drafts only for their own cases (defense against guessed case UUIDs).
DROP POLICY IF EXISTS "case_tool_drafts_select_own" ON case_tool_drafts;
DROP POLICY IF EXISTS "case_tool_drafts_insert_own" ON case_tool_drafts;
DROP POLICY IF EXISTS "case_tool_drafts_update_own" ON case_tool_drafts;
DROP POLICY IF EXISTS "case_tool_drafts_delete_own" ON case_tool_drafts;

CREATE POLICY "case_tool_drafts_select_own"
    ON case_tool_drafts FOR SELECT
    USING (
        attorney_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM case_cases c
            WHERE c.id = case_tool_drafts.case_id
              AND c.attorney_user_id = auth.uid()
        )
    );

CREATE POLICY "case_tool_drafts_insert_own"
    ON case_tool_drafts FOR INSERT
    WITH CHECK (
        attorney_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM case_cases c
            WHERE c.id = case_tool_drafts.case_id
              AND c.attorney_user_id = auth.uid()
        )
    );

CREATE POLICY "case_tool_drafts_update_own"
    ON case_tool_drafts FOR UPDATE
    USING (
        attorney_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM case_cases c
            WHERE c.id = case_tool_drafts.case_id
              AND c.attorney_user_id = auth.uid()
        )
    )
    WITH CHECK (
        attorney_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM case_cases c
            WHERE c.id = case_tool_drafts.case_id
              AND c.attorney_user_id = auth.uid()
        )
    );

CREATE POLICY "case_tool_drafts_delete_own"
    ON case_tool_drafts FOR DELETE
    USING (
        attorney_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM case_cases c
            WHERE c.id = case_tool_drafts.case_id
              AND c.attorney_user_id = auth.uid()
        )
    );
