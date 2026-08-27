-- Prevent duplicate audit records when an authorized user retries the same
-- SAF-T export from a slow browser tab or two concurrent tabs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_saf_t_exports_content
  ON saf_t_exports(board_id, period_from, period_to, checksum);
