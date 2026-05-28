-- Multi-Tenant Composite Indexes
-- All indexes include company_id as the first column for tenant isolation
-- This ensures efficient queries within a single tenant's data

-- Organizational Tables
CREATE INDEX IF NOT EXISTS idx_branches_company ON branches(company_id);
CREATE INDEX IF NOT EXISTS idx_teams_company_branch ON teams(company_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company_id);

-- Deal Tables
CREATE INDEX IF NOT EXISTS idx_deals_company_status ON deals(company_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_company_period ON deals(company_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_deals_company_created_by ON deals(company_id, created_by);
CREATE INDEX IF NOT EXISTS idx_deal_participants_company_employee ON deal_participants(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_deal_commissions_company_employee ON deal_commissions(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_deal_table_rows_company_year_month ON deal_table_rows(company_id, year, month);

-- Financial Tables
CREATE INDEX IF NOT EXISTS idx_transactions_company_type ON transactions(company_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_company_date ON transactions(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commission_rules_company ON commission_rules(company_id);

-- Supporting Tables
CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_company_user ON notifications(company_id, user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_service_requests_company_status ON service_requests(company_id, status);

-- Index Strategy:
-- 1. company_id is always the first column for partition pruning
-- 2. Second column is the most common filter (status, type, date, etc.)
-- 3. Third column (if present) is for additional filtering or sorting
-- 4. These indexes support both equality and range queries within a tenant
