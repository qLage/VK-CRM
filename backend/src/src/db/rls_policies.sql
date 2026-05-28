-- Row-Level Security Policies for Multi-Tenant Isolation
-- These policies enforce tenant isolation at the database level
-- Session variable app.current_tenant_id must be set before queries

-- Enable Row-Level Security on all tenant-scoped tables

-- Organizational tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Deal tables
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_table_rows ENABLE ROW LEVEL SECURITY;

-- Financial tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;

-- Supporting tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies
-- Policy pattern: USING clause filters rows based on session variable

DROP POLICY IF EXISTS tenant_isolation_branches ON branches;
CREATE POLICY tenant_isolation_branches ON branches
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_teams ON teams;
CREATE POLICY tenant_isolation_teams ON teams
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_profiles ON profiles;
CREATE POLICY tenant_isolation_profiles ON profiles
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_deals ON deals;
CREATE POLICY tenant_isolation_deals ON deals
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_deal_participants ON deal_participants;
CREATE POLICY tenant_isolation_deal_participants ON deal_participants
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_deal_commissions ON deal_commissions;
CREATE POLICY tenant_isolation_deal_commissions ON deal_commissions
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_deal_documents ON deal_documents;
CREATE POLICY tenant_isolation_deal_documents ON deal_documents
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_deal_activities ON deal_activities;
CREATE POLICY tenant_isolation_deal_activities ON deal_activities
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_deal_table_rows ON deal_table_rows;
CREATE POLICY tenant_isolation_deal_table_rows ON deal_table_rows
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_transactions ON transactions;
CREATE POLICY tenant_isolation_transactions ON transactions
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_commission_rules ON commission_rules;
CREATE POLICY tenant_isolation_commission_rules ON commission_rules
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_leads ON leads;
CREATE POLICY tenant_isolation_leads ON leads
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  USING (company_id = current_setting('app.current_tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_service_requests ON service_requests;
CREATE POLICY tenant_isolation_service_requests ON service_requests
  USING (company_id = current_setting('app.current_tenant_id')::uuid);
