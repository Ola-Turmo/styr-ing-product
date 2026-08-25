CREATE TABLE IF NOT EXISTS resolution_dissents (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  resolution_id TEXT NOT NULL REFERENCES resolutions(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES board_members(id) ON DELETE CASCADE,
  statement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','rejected')),
  signature_status TEXT NOT NULL DEFAULT 'not_configured' CHECK(signature_status IN ('not_configured','pending','complete')),
  approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT,
  UNIQUE(resolution_id,member_id)
);
CREATE INDEX IF NOT EXISTS idx_resolution_dissents_board ON resolution_dissents(board_id,status,created_at);
