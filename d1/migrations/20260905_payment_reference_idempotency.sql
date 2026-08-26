-- Manual payment references are idempotency keys per invoice. Reversed entries may be reused.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_payments_manual_reference
  ON invoice_payments(board_id,entity_type,entity_id,payment_reference)
  WHERE bank_transaction_id IS NULL AND status <> 'reversed';
