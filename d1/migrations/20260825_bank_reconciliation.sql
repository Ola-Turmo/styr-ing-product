-- Additive bank statement import and reconciliation tables.
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL, account_last_four TEXT, currency TEXT NOT NULL DEFAULT 'NOK',
  provider TEXT, status TEXT NOT NULL DEFAULT 'manual' CHECK(status IN ('manual','not_configured','connected','paused')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  transaction_date TEXT NOT NULL, value_date TEXT, description TEXT NOT NULL,
  counterparty TEXT, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'NOK',
  external_reference TEXT, status TEXT NOT NULL DEFAULT 'imported' CHECK(status IN ('imported','suggested','approved','rejected')),
  match_entity_type TEXT CHECK(match_entity_type IN ('sales_invoice','supplier_invoice','card_transaction')),
  match_entity_id TEXT, match_confidence TEXT CHECK(match_confidence IN ('exact','strong','weak')),
  reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bank_account_id,external_reference)
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_board ON bank_accounts(board_id,status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_board ON bank_transactions(board_id,status,transaction_date);
