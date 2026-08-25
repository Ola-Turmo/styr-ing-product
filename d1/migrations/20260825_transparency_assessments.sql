CREATE TABLE IF NOT EXISTS transparency_vendor_assessments (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL, report_year TEXT NOT NULL, risk_level TEXT NOT NULL DEFAULT 'medium' CHECK(risk_level IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','review','approved','rejected')),
  source_count INTEGER NOT NULL DEFAULT 0, assessment_notes TEXT, evidence_ref TEXT,
  created_by TEXT, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id,supplier_name,report_year)
);
CREATE INDEX IF NOT EXISTS idx_transparency_vendor_assessments_board ON transparency_vendor_assessments(board_id,report_year,status,risk_level);
CREATE TABLE IF NOT EXISTS transparency_reports (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  report_year TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','review','approved','published')),
  row_count INTEGER NOT NULL DEFAULT 0, payload_hash TEXT NOT NULL, payload TEXT NOT NULL,
  external_status TEXT NOT NULL DEFAULT 'not_configured' CHECK(external_status IN ('not_configured','ready','published')),
  created_by TEXT, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id,report_year,status)
);
CREATE INDEX IF NOT EXISTS idx_transparency_reports_board ON transparency_reports(board_id,report_year,status);
