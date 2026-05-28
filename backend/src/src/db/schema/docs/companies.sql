-- Companies Table
-- Multi-tenant foundation table for isolating data by company/organization

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    domain VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL;

-- Seed company for development/testing
INSERT INTO companies (id, name, slug, domain, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Demo Company',
    'demo',
    'demo.example.com',
    true
)
ON CONFLICT (slug) DO NOTHING;

-- Column descriptions:
-- id: Unique identifier for the company
-- name: Display name of the company
-- slug: URL-safe unique identifier (used for subdomain routing)
-- domain: Custom domain for the company (optional)
-- is_active: Whether the company account is active
-- settings: JSON object for company-specific configuration
-- created_at: Timestamp when company was created
-- updated_at: Timestamp when company was last updated
