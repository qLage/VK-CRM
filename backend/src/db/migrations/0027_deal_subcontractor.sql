-- Add subcontractor (сдельщик) support to deal_table_rows
ALTER TABLE deal_table_rows
  ADD COLUMN IF NOT EXISTS subcontractor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcontractor_amount NUMERIC(12,2) DEFAULT 0;

-- Index for quick lookups by subcontractor
CREATE INDEX IF NOT EXISTS idx_deal_table_subcontractor ON deal_table_rows(subcontractor_id);
