-- Additive sequence table for atomic, per-board voucher numbering.
CREATE TABLE IF NOT EXISTS voucher_sequences (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1 CHECK(next_number >= 1),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO voucher_sequences (board_id, next_number)
SELECT b.id, COALESCE((SELECT MAX(v.voucher_number) + 1 FROM vouchers v WHERE v.board_id = b.id), 1)
FROM boards b
WHERE NOT EXISTS (SELECT 1 FROM voucher_sequences s WHERE s.board_id = b.id);
CREATE INDEX IF NOT EXISTS idx_voucher_sequences_board ON voucher_sequences(board_id);
