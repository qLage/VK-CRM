-- Add source_type to properties (client / lead / external)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'client';

-- Add index for fast filtering in leaderboard
CREATE INDEX IF NOT EXISTS idx_properties_source_type ON properties(source_type);
