-- Controlled classification for ordinary bank transactions that do not match
-- an invoice or card transaction. The selected ledger account is always human
-- supplied and final posting remains a separate action.
ALTER TABLE bank_transactions ADD COLUMN manual_counter_account_id TEXT;
ALTER TABLE bank_transactions ADD COLUMN classification_note TEXT;

