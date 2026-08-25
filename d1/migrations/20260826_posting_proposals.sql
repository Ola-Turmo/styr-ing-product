-- Controlled bridge from approved source documents to the general ledger.
-- The proposal must be reviewed and approved before a voucher is posted.
CREATE TABLE IF NOT EXISTS posting_proposals (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('sales_invoice','supplier_invoice')),
  source_id TEXT NOT NULL,
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
  UNIQUE(board_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_posting_proposals_board ON posting_proposals(board_id,status,period,created_at);
