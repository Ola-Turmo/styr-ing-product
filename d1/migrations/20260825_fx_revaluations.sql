CREATE TABLE IF NOT EXISTS fx_revaluations (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  reference TEXT NOT NULL, currency TEXT NOT NULL, period TEXT NOT NULL,
  foreign_amount_minor INTEGER NOT NULL DEFAULT 0, booked_rate REAL NOT NULL,
  closing_rate REAL NOT NULL, booked_nok_minor INTEGER NOT NULL DEFAULT 0,
  closing_nok_minor INTEGER NOT NULL DEFAULT 0, gain_loss_minor INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','norges_bank')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','rejected')),
  approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_fx_revaluations_board ON fx_revaluations(board_id,period,status);
