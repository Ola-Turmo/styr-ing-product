-- Controlled bridge from an approved payroll compliance check to the general ledger.
-- This is intentionally separate from invoice proposals so existing production rows
-- and their source-type constraint remain unchanged.
CREATE TABLE IF NOT EXISTS payroll_posting_proposals (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  voucher_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  lines_json TEXT NOT NULL,
  source_snapshot TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','posted','rejected')),
  voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL,
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  posted_by TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(board_id,payroll_run_id)
);
CREATE INDEX IF NOT EXISTS idx_payroll_posting_proposals_board ON payroll_posting_proposals(board_id,status,period,created_at);
