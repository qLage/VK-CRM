-- ============================================================================
-- Migration: 0014_link_properties_to_deals.sql
-- Purpose: Link properties to deals + auto-archive on closed deal
-- Date: 2026-04-29
-- ============================================================================

-- Add property_id reference to deal tables (already have free-text property_name/object)
ALTER TABLE deal_table_rows ADD COLUMN IF NOT EXISTS property_id TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS property_id TEXT;

CREATE INDEX IF NOT EXISTS idx_deal_table_rows_property ON deal_table_rows(property_id);
CREATE INDEX IF NOT EXISTS idx_deals_property ON deals(property_id);

-- Add reverse pointer: properties.deal_id already exists from 0012
-- Add 'sold' status semantics by using existing status workflow.
-- Track when property was attached to a deal.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sold_in_deal_id TEXT;

CREATE INDEX IF NOT EXISTS idx_properties_deal ON properties(deal_id);
