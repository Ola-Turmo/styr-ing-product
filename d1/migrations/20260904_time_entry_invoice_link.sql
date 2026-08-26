ALTER TABLE time_entries ADD COLUMN invoice_draft_id TEXT;
CREATE INDEX IF NOT EXISTS idx_time_entries_invoice_draft ON time_entries(board_id,invoice_draft_id,status);
