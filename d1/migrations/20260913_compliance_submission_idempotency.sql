-- Ensure only one active statutory submission package exists per board, report type and period.
-- This closes the concurrent-tab race; the API returns a safe idempotent response for retries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_submissions_active_unique
ON compliance_submissions(board_id, submission_type, period)
WHERE status IN ('prepared','review','approved','submitted');
