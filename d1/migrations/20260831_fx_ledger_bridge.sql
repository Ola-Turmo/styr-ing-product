-- Approved FX revaluations can be posted through the controlled GL path.
ALTER TABLE fx_revaluations ADD COLUMN posted_voucher_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fx_revaluations_board_external_reference
  ON fx_revaluations(board_id, reference)
  WHERE reference IS NOT NULL AND trim(reference) <> '';
