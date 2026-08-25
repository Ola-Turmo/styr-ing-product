ALTER TABLE sales_invoices ADD COLUMN paid_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_invoices ADD COLUMN paid_minor INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','supplier_invoice')),
  entity_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'NOK', payment_reference TEXT NOT NULL,
  bank_transaction_id TEXT REFERENCES bank_transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','posted','reversed')),
  recorded_by TEXT, recorded_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(bank_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_entity ON invoice_payments(board_id,entity_type,entity_id,recorded_at);
CREATE TABLE IF NOT EXISTS sales_credit_notes (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  sales_invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  credit_note_number TEXT NOT NULL, issue_date TEXT NOT NULL, description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), vat_minor INTEGER NOT NULL DEFAULT 0 CHECK(vat_minor >= 0),
  total_minor INTEGER NOT NULL CHECK(total_minor > 0), status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','posted','cancelled')),
  approved_by TEXT, approved_at TEXT, posted_voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(board_id,credit_note_number)
);
CREATE INDEX IF NOT EXISTS idx_sales_credit_notes_board ON sales_credit_notes(board_id,status,issue_date);
