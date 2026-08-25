-- Additive MVA-period control model. This stores an explainable calculation snapshot;
-- it never claims that an external Altinn/Skatteetaten submission was sent.
CREATE TABLE IF NOT EXISTS vat_periods (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','calculated','approved','prepared')),
  basis_minor INTEGER NOT NULL DEFAULT 0,
  output_vat_minor INTEGER NOT NULL DEFAULT 0,
  input_vat_minor INTEGER NOT NULL DEFAULT 0,
  net_vat_minor INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  unmapped_count INTEGER NOT NULL DEFAULT 0,
  source_snapshot TEXT,
  source_hash TEXT,
  submission_id TEXT REFERENCES compliance_submissions(id) ON DELETE SET NULL,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id, period)
);
CREATE INDEX IF NOT EXISTS idx_vat_periods_board ON vat_periods(board_id, period, status);
