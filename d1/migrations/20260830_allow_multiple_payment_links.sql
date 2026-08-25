ALTER TABLE payment_links RENAME TO payment_links_old;
CREATE TABLE payment_links (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  bank_transaction_id TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','supplier_invoice')),
  entity_id TEXT NOT NULL, amount_minor INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'linked' CHECK(status IN ('linked','posted','rejected')),
  linked_by TEXT, linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL, posted_by TEXT, posted_at TEXT,
  UNIQUE(bank_transaction_id)
);
INSERT INTO payment_links (id,board_id,bank_transaction_id,entity_type,entity_id,amount_minor,status,linked_by,linked_at,posted_voucher_id,posted_by,posted_at)
SELECT id,board_id,bank_transaction_id,entity_type,entity_id,amount_minor,status,linked_by,linked_at,posted_voucher_id,posted_by,posted_at FROM payment_links_old;
DROP TABLE payment_links_old;
CREATE INDEX IF NOT EXISTS idx_payment_links_board ON payment_links(board_id,status,entity_type);
