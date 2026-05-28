-- Performance indexes for CRM database
-- These indexes dramatically speed up KPI calculations

-- Service requests indexes (used heavily in KPI calculations)
CREATE INDEX IF NOT EXISTS idx_service_requests_user_date_status
ON service_requests(user_id, created_at, status, type);

CREATE INDEX IF NOT EXISTS idx_service_requests_date_status
ON service_requests(created_at, status, type);

-- Reports indexes
CREATE INDEX IF NOT EXISTS idx_reports_user_date_type_status
ON reports(user_id, created_at, type, status);

CREATE INDEX IF NOT EXISTS idx_reports_date_status
ON reports(created_at, status);

CREATE INDEX IF NOT EXISTS idx_reports_deal_date
ON reports(deal_date, status);

-- User plans indexes
CREATE INDEX IF NOT EXISTS idx_user_plans_user_period
ON user_plans(user_id, period_month);

CREATE INDEX IF NOT EXISTS idx_user_plans_period
ON user_plans(period_month);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_team
ON profiles(team_id, is_active);

CREATE INDEX IF NOT EXISTS idx_profiles_branch
ON profiles(branch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_profiles_active
ON profiles(is_active);

-- Composite index for JOIN operations
CREATE INDEX IF NOT EXISTS idx_profiles_team_branch
ON profiles(team_id, branch_id, is_active);

-- Analyze tables to update statistics
ANALYZE service_requests;
ANALYZE reports;
ANALYZE user_plans;
ANALYZE profiles;
