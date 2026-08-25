CREATE TABLE IF NOT EXISTS equity_filing_packages (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  filing_type TEXT NOT NULL CHECK(filing_type IN ('shareholder_register','rf_1086')),
  period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','review','approved','submitted','rejected')),
  row_count INTEGER NOT NULL DEFAULT 0, payload_hash TEXT NOT NULL, payload TEXT NOT NULL,
  external_status TEXT NOT NULL DEFAULT 'not_configured' CHECK(external_status IN ('not_configured','ready','submitted')),
  created_by TEXT, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id,filing_type,period,status)
);
CREATE INDEX IF NOT EXISTS idx_equity_filing_packages_board ON equity_filing_packages(board_id,filing_type,period,status);
