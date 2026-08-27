CREATE TABLE IF NOT EXISTS procurement_approval_policies (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  require_four_eyes_from_minor INTEGER NOT NULL DEFAULT 0 CHECK(require_four_eyes_from_minor >= 0),
  owner_override_allowed INTEGER NOT NULL DEFAULT 1 CHECK(owner_override_allowed IN (0,1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO procurement_approval_policies (board_id)
SELECT id FROM boards;
