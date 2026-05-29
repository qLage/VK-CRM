-- Add lead_id and external_name support for properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_name TEXT;

CREATE INDEX IF NOT EXISTS idx_properties_lead_id ON properties(lead_id);
