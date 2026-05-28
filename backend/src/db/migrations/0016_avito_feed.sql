-- ============================================================================
-- Migration: 0016_avito_feed.sql
-- Purpose: Add feed token to avito_credentials + feed flag to properties
-- Date: 2026-05-01
-- ============================================================================

-- Token for authenticating the public XML feed URL
ALTER TABLE avito_credentials ADD COLUMN IF NOT EXISTS feed_token VARCHAR(64);

-- Flag: include this property in the Avito XML feed
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_feed_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_properties_avito_feed ON properties(avito_feed_enabled) WHERE avito_feed_enabled = TRUE;
