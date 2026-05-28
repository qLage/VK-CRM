-- ============================================================================
-- Migration: 0012_add_properties.sql
-- Purpose: Create tables for property listings (Объекты) feature
-- Date: 2026-04-28
-- ============================================================================

-- Properties main table
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    branch_id TEXT,
    team_id TEXT,

    -- Classification
    category VARCHAR(50) NOT NULL DEFAULT 'secondary',
    
    -- Address
    city VARCHAR(255),
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,

    -- Property details
    price NUMERIC(14,2) NOT NULL DEFAULT 0,
    area_total NUMERIC(8,2),
    area_living NUMERIC(8,2),
    area_kitchen NUMERIC(8,2),
    rooms INTEGER,
    floor INTEGER,
    floors_total INTEGER,
    description TEXT,

    -- Workflow
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    rejection_reason TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,

    -- Avito
    avito_status VARCHAR(30),
    avito_item_id VARCHAR(100),
    avito_published_at TIMESTAMPTZ,
    avito_approved_by TEXT,

    -- Archive
    archived_at TIMESTAMPTZ,
    archive_approved_by TEXT,
    auto_delete_at TIMESTAMPTZ,

    -- Related deal
    deal_id TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Property photos (up to 20 per property)
CREATE TABLE IF NOT EXISTS property_photos (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Property transfers
CREATE TABLE IF NOT EXISTS property_transfers (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_properties_company ON properties(company_id);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_branch ON properties(branch_id);
CREATE INDEX IF NOT EXISTS idx_properties_team ON properties(team_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_category ON properties(category);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_created ON properties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_photos_property ON property_photos(property_id);
CREATE INDEX IF NOT EXISTS idx_property_transfers_property ON property_transfers(property_id);
CREATE INDEX IF NOT EXISTS idx_property_transfers_to ON property_transfers(to_user_id, status);
