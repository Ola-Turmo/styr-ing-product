-- Explicit bridge fields for approved bank matches. Account choices remain human supplied.
ALTER TABLE bank_accounts ADD COLUMN ledger_account_id TEXT;
ALTER TABLE bank_transactions ADD COLUMN posted_voucher_id TEXT;
