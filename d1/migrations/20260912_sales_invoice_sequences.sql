CREATE TABLE IF NOT EXISTS sales_invoice_sequences (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  invoice_year INTEGER NOT NULL CHECK(invoice_year BETWEEN 2000 AND 2100),
  next_number INTEGER NOT NULL DEFAULT 1 CHECK(next_number > 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(board_id,invoice_year)
);
