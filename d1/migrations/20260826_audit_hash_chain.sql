-- Additive audit-chain fields. Existing rows remain readable as legacy events;
-- new writes include a deterministic SHA-256 event hash and previous pointer.
ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_log ADD COLUMN event_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_log_event_hash ON audit_log(board_id,event_hash);
