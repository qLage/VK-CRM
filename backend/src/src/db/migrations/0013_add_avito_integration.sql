-- ============================================================================
-- Migration: 0013_add_avito_integration.sql
-- Purpose: Avito OAuth credentials per company + extended publication fields
-- Date: 2026-04-29
-- ============================================================================

CREATE TABLE IF NOT EXISTS avito_credentials (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL UNIQUE,
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    user_id VARCHAR(100),                  -- Avito user ID
    access_token TEXT,                     -- current OAuth token (encrypted at rest in production)
    token_expires_at TIMESTAMPTZ,
    refresh_token TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extra fields on properties for Avito publication
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_last_error TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_avito_credentials_company ON avito_credentials(company_id);
