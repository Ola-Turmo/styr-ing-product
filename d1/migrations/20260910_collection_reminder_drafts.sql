-- Controlled Norwegian payment-reminder drafts. Delivery, fees and interest
-- remain disabled until a reviewed legal/provider adapter is configured.
CREATE TABLE IF NOT EXISTS collection_reminder_drafts (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  collection_case_id TEXT NOT NULL REFERENCES collection_cases(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT,
  due_date TEXT NOT NULL,
  outstanding_minor INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review' CHECK(status IN ('draft','review','approved','void')),
  checksum TEXT NOT NULL,
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id,collection_case_id,version),
  UNIQUE(board_id,checksum)
);
CREATE INDEX IF NOT EXISTS idx_collection_reminder_drafts_board ON collection_reminder_drafts(board_id,status,created_at);
