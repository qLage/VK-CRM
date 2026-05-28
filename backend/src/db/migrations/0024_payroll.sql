-- Payroll org defaults, accrued monthly snapshots, idempotent payout actions (Postgres).

CREATE TABLE IF NOT EXISTS company_payroll_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  ndfl_percent REAL NOT NULL DEFAULT 13,
  advance_percent REAL NOT NULL DEFAULT 40,
  insurance_percent REAL NOT NULL DEFAULT 30,
  base_salary_sales_manager REAL NOT NULL DEFAULT 0,
  base_salary_head_sales REAL NOT NULL DEFAULT 0,
  base_salary_commercial REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_monthly_state (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payroll_year INTEGER NOT NULL,
  payroll_month INTEGER NOT NULL,
  advance_gross_paid REAL NOT NULL DEFAULT 0,
  ndfl_from_advance REAL NOT NULL DEFAULT 0,
  ndfl_from_remainder REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, profile_id, payroll_year, payroll_month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_state_lookup
  ON payroll_monthly_state(company_id, profile_id, payroll_year, payroll_month);

CREATE TABLE IF NOT EXISTS payroll_payout_actions (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accrual_year INTEGER NOT NULL,
  accrual_month INTEGER NOT NULL,
  action_kind TEXT NOT NULL,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_payout_actions_kind_check CHECK (action_kind IN (
    'advance', 'remainder', 'ndfl_budget_1', 'ndfl_budget_2', 'insurance_contributions'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_payout_once
  ON payroll_payout_actions(company_id, profile_id, accrual_year, accrual_month, action_kind);
