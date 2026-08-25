-- Approved card transactions can be posted through the same controlled GL path
-- as bank matches. The provider remains optional; the ledger bridge is local.
ALTER TABLE card_transactions ADD COLUMN posted_voucher_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_transactions_board_external_reference
  ON card_transactions(board_id, external_reference)
  WHERE external_reference IS NOT NULL AND trim(external_reference) <> '';
