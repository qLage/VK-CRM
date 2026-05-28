-- Who is credited for mortgage work on a deal (МОП, РОП, or dedicated broker). Separate from mop_id (team leader for МОП %).
ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS mortgage_credited_id UUID;

CREATE INDEX IF NOT EXISTS idx_deal_table_rows_mortgage_credited
  ON deal_table_rows (mortgage_credited_id)
  WHERE mortgage_credited_id IS NOT NULL;
