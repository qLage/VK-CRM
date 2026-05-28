-- Add self-employed tax percent to company payroll settings
ALTER TABLE company_payroll_settings
ADD COLUMN IF NOT EXISTS self_employed_tax_percent REAL NOT NULL DEFAULT 6;

-- Update existing rows to have the default value
UPDATE company_payroll_settings
SET self_employed_tax_percent = 6
WHERE self_employed_tax_percent IS NULL;

-- Add self_employed_tax_paid tracking to payroll monthly state
ALTER TABLE payroll_monthly_state
ADD COLUMN IF NOT EXISTS self_employed_tax_paid REAL NOT NULL DEFAULT 0;

-- Extend CHECK constraint on payroll_payout_actions to include self_employed_tax
ALTER TABLE payroll_payout_actions
DROP CONSTRAINT IF EXISTS payroll_payout_actions_kind_check;

ALTER TABLE payroll_payout_actions
ADD CONSTRAINT payroll_payout_actions_kind_check CHECK (
    action_kind IN (
        'advance',
        'ndfl_budget_1',
        'remainder',
        'ndfl_budget_2',
        'insurance_contributions',
        'self_employed_tax'
    )
);
