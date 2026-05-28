-- Employee profile: passport, extra phone, emergency contacts, addresses
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS passport_series_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extra_phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contacts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS passport_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS residential_address TEXT;

UPDATE profiles
SET emergency_contacts = '[]'::jsonb
WHERE emergency_contacts IS NULL;
