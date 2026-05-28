-- ============================================================================
-- Migration: 0020_house_utilities_avito.sql
-- Purpose: Add utility details JSONB field for Avito house listings
-- Date: 2026-05-18
-- ============================================================================

-- JSONB field for detailed utility types (Avito-specific)
-- Stores: { water_supply_type, sewerage_type, gas_supply_type, heating_type, electricity }
ALTER TABLE properties ADD COLUMN IF NOT EXISTS utility_details JSONB DEFAULT '{}';
