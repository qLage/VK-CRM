-- Dashboard stats cache (plan, revenue, KPI) — avoids recalculation on every page load
CREATE TABLE IF NOT EXISTS dashboard_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cache_key TEXT NOT NULL, -- e.g. 'kpi_stats_month', 'kpi_stats_quarter'
  data JSONB NOT NULL DEFAULT '{}',
  period TEXT, -- 'month' or 'quarter'
  branch_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_user_key ON dashboard_cache(user_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_expires ON dashboard_cache(expires_at);

-- Employee computed stats (cached columns updated on data change)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cached_stats JSONB DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stats_updated_at TIMESTAMPTZ;

-- Performance indexes for heavy pages
CREATE INDEX IF NOT EXISTS idx_reports_owner_date ON reports(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_branch_date ON reports(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_deals_created ON deals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_branch ON deals(branch_id);
CREATE INDEX IF NOT EXISTS idx_deals_responsible ON deals(responsible_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_created ON service_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_user ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date DESC);
