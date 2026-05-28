const{Client}=require('pg');
const c=new Client(process.env.DATABASE_URL);
c.connect()
.then(()=>c.query(`
-- 0013: avito_credentials + avito fields on properties
CREATE TABLE IF NOT EXISTS avito_credentials (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL UNIQUE,
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    user_id VARCHAR(100),
    access_token TEXT,
    token_expires_at TIMESTAMPTZ,
    refresh_token TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_last_error TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_last_attempt_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_avito_credentials_company ON avito_credentials(company_id);

-- 0015: extended property fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS house_type VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS renovation VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bathroom VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS balcony VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ceiling_height NUMERIC(4,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parking VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS view_from_window VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS elevator VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_area NUMERIC(10,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_status VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS commercial_type VARCHAR(50);

-- 0016: feed
ALTER TABLE avito_credentials ADD COLUMN IF NOT EXISTS feed_token VARCHAR(64);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_feed_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_properties_avito_feed ON properties(avito_feed_enabled) WHERE avito_feed_enabled = TRUE;
`))
.then(()=>{console.log('ALL MIGRATIONS OK');c.end()})
.catch(e=>{console.error(e.message);c.end();process.exit(1)});
