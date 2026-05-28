-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id),
    full_name TEXT NOT NULL,
    phone TEXT,
    birthday DATE,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_by TEXT REFERENCES profiles(id),
    branch_id TEXT REFERENCES branches(id),
    team_id TEXT REFERENCES teams(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(full_name);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(company_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);

-- Link properties to clients
ALTER TABLE properties ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES clients(id);
CREATE INDEX IF NOT EXISTS idx_properties_client ON properties(client_id);

-- Per-user restriction: hide clients section
CREATE TABLE IF NOT EXISTS client_access_restrictions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id),
    restricted_by TEXT NOT NULL REFERENCES profiles(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, company_id)
);
