-- Per-employee payroll scheme: false = lump «оклад» (category salary), true = sequential official payroll steps.
-- Default false («flat») keeps existing behaviour until admins enable «официально».

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS uses_official_payroll BOOLEAN NOT NULL DEFAULT FALSE;
