-- ============================================================================
-- Migration: 0015_extended_property_fields.sql
-- Purpose: Avito-specific extra fields per category (apartments, etc.)
-- Date: 2026-04-29
-- ============================================================================

ALTER TABLE properties ADD COLUMN IF NOT EXISTS house_type        VARCHAR(50);     -- panel, brick, monolith, etc.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built        INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS renovation        VARCHAR(50);     -- without, cosmetic, designer, euro
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bathroom          VARCHAR(50);     -- combined, separate, multiple
ALTER TABLE properties ADD COLUMN IF NOT EXISTS balcony           VARCHAR(50);     -- balcony, loggia, both, none
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ceiling_height    NUMERIC(4,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parking           VARCHAR(50);     -- street, courtyard, underground, garage
ALTER TABLE properties ADD COLUMN IF NOT EXISTS view_from_window  VARCHAR(50);     -- yard, street, both
ALTER TABLE properties ADD COLUMN IF NOT EXISTS elevator          VARCHAR(50);     -- none, passenger, freight, both

-- Land plot specific
ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_area         NUMERIC(10,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_status       VARCHAR(50);     -- IZHS, SNT, etc.

-- Commercial specific
ALTER TABLE properties ADD COLUMN IF NOT EXISTS commercial_type   VARCHAR(50);     -- office, warehouse, retail, free
