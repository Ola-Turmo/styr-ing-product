-- Additive migration for cryptographic accounting-period seals.
ALTER TABLE accounting_periods ADD COLUMN seal_checksum TEXT;
