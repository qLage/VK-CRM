var c=require('pg');
var fs=require('fs');
var path=require('path');
var p = new c.Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});

var migrations = [
  // 0012
  `CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    branch_id TEXT,
    team_id TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'secondary',
    city VARCHAR(255),
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    price NUMERIC(14,2) NOT NULL DEFAULT 0,
    area_total NUMERIC(8,2),
    area_living NUMERIC(8,2),
    area_kitchen NUMERIC(8,2),
    rooms INTEGER,
    floor INTEGER,
    floors_total INTEGER,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    rejection_reason TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    avito_status VARCHAR(30),
    avito_item_id VARCHAR(100),
    avito_published_at TIMESTAMPTZ,
    avito_approved_by TEXT,
    archived_at TIMESTAMPTZ,
    archive_approved_by TEXT,
    auto_delete_at TIMESTAMPTZ,
    deal_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS property_photos (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS property_transfers (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );
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
  CREATE INDEX IF NOT EXISTS idx_property_transfers_to ON property_transfers(to_user_id, status);`,

  // 0013
  `CREATE TABLE IF NOT EXISTS avito_credentials (
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
  CREATE INDEX IF NOT EXISTS idx_avito_credentials_company ON avito_credentials(company_id);`,

  // 0014
  `ALTER TABLE deals ADD COLUMN IF NOT EXISTS property_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_deals_property ON deals(property_id);`,

  // 0015
  `ALTER TABLE properties ADD COLUMN IF NOT EXISTS house_type VARCHAR(50);
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
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS commercial_type VARCHAR(50);`,

  // 0016
  `ALTER TABLE avito_credentials ADD COLUMN IF NOT EXISTS feed_token VARCHAR(64);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS avito_feed_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE INDEX IF NOT EXISTS idx_properties_avito_feed ON properties(avito_feed_enabled) WHERE avito_feed_enabled = TRUE;`,

  // 0017 - Avito-like rent fields + infrastructure
  `ALTER TABLE properties ADD COLUMN IF NOT EXISTS furniture VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS appliances VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS internet VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS conditioner VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS washing_machine VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS dishwasher VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS fridge VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS tv VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS pets_allowed VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS children_allowed VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS prepayment VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS deposit_amount VARCHAR(100);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS lease_term VARCHAR(50);
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenant_requirements TEXT;
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS infrastructure TEXT;
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS transport_accessibility TEXT;`
];

p.connect().then(function(){
  console.log('Connected to DB');
  var chain = Promise.resolve();
  migrations.forEach(function(sql, i){
    chain = chain.then(function(){
      console.log('Running migration ' + (i+12) + '...');
      return p.query(sql);
    }).then(function(){
      console.log('Migration ' + (i+12) + ' OK');
    });
  });
  return chain;
}).then(function(){
  console.log('ALL DONE');
  p.end();
}).catch(function(e){
  console.error('FAILED: ' + e.message);
  p.end();
  process.exit(1);
});
