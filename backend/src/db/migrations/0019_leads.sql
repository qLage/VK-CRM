-- Migration 0019: Leads (Лиды)
-- Две папки: newbuilding (Новостройки), secondary (Вторичка)
-- Добавлять могут все, редактировать/удалять только Директор (access_level >= 100)

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id UUID NOT NULL REFERENCES companies(id),
    category TEXT NOT NULL CHECK (category IN ('newbuilding', 'secondary')),
    full_name TEXT NOT NULL,
    phone TEXT,
    birthday TEXT,
    mortgage BOOLEAN DEFAULT false,
    mortgage_type TEXT CHECK (mortgage_type IN ('base', 'family', 'it', 'installment') OR mortgage_type IS NULL),
    mortgage_approved BOOLEAN DEFAULT false,
    residential_complex TEXT,
    result TEXT,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_by TEXT REFERENCES profiles(id),
    branch_id TEXT,
    team_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(company_id, category);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(company_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);

CREATE TABLE IF NOT EXISTS lead_touches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_by TEXT REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_touches_lead ON lead_touches(lead_id);

-- Grant permissions
GRANT ALL ON leads TO crm_user;
GRANT ALL ON lead_touches TO crm_user;
