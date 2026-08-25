-- A bank statement line or controlled posting proposal must map to one voucher.
-- This protects the gapless sequence when a browser retry races a successful post.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_board_external_reference
  ON vouchers(board_id, external_reference)
  WHERE external_reference IS NOT NULL AND trim(external_reference) <> '';
