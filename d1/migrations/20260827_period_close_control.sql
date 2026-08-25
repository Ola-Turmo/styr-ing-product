-- Controlled period close for the accounting-first SMB workflow.
-- A period can only be locked after its latest checks have been approved.
CREATE TABLE IF NOT EXISTS accounting_period_closures (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','locked','rejected')),
  checks_json TEXT NOT NULL DEFAULT '{}',
  source_hash TEXT NOT NULL,
  prepared_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  locked_by TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id,period)
);
CREATE INDEX IF NOT EXISTS idx_accounting_period_closures_board ON accounting_period_closures(board_id,period,status);
