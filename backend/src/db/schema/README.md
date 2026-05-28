# CRM Database Schema Documentation

## Overview

This CRM system uses PostgreSQL with a **multi-tenant architecture**. All tenant-scoped tables include a `company_id` column for data isolation.

## Multi-Tenant Architecture

### Tenant Isolation Strategy

- **company_id column**: All tenant-scoped tables have a `company_id UUID NOT NULL` column
- **Foreign keys**: All company_id columns reference `companies(id)` with `ON DELETE CASCADE`
- **Composite indexes**: All indexes include `company_id` as the first column for efficient tenant-scoped queries
- **JWT context**: User JWT tokens include `company_id` for request-level tenant context
- **RLS policies**: Row-Level Security policies will be added in Plan 01-02

### Demo Company

For development and testing, a seed company is created:
- ID: `00000000-0000-0000-0000-000000000001`
- Name: Demo Company
- Slug: demo

## Table Categories

### 1. Multi-Tenant Foundation

#### companies
Core table for tenant isolation. Each company represents a separate organization using the CRM.

**Columns:**
- `id` (UUID, PK): Unique identifier
- `name` (VARCHAR): Company display name
- `slug` (VARCHAR, UNIQUE): URL-safe identifier
- `domain` (VARCHAR): Custom domain (optional)
- `is_active` (BOOLEAN): Account status
- `settings` (JSONB): Company-specific configuration
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_companies_slug`: Fast lookup by slug
- `idx_companies_domain`: Fast lookup by custom domain

---

### 2. Organizational Tables (Tenant-Scoped)

#### branches
Physical office locations for a company.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `name`, `city`, `address`, `phone` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_branches_company`: Tenant-scoped queries

#### teams
Sales teams within branches.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `name` (TEXT)
- `branch_id` (TEXT, FK → branches)
- `leader_id` (TEXT, FK → profiles)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_teams_company_branch`: Tenant-scoped queries with branch filter

#### profiles
User profiles (employees) within a company.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK, FK → auth_users)
- `company_id` (UUID, FK → companies)
- `email`, `full_name`, `first_name`, `last_name`, `phone` (TEXT)
- `avatar_url` (TEXT)
- `position_id` (TEXT, FK → positions)
- `branch_id`, `team_id` (TEXT)
- `has_salary`, `salary_amount`, `commission_percent` (NUMERIC)
- `personal_kpi_current`, `management_kpi_current` (NUMERIC)
- `is_active`, `is_kpi_enabled`, `is_new_building` (INTEGER/BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_profiles_company`: Tenant-scoped queries

---

### 3. Deal Tables (Tenant-Scoped)

#### deals
Real estate transactions.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `property_object`, `document_type`, `document_date` (TEXT)
- `seller_name`, `seller_phone`, `buyer_name`, `buyer_phone` (TEXT)
- `deposit_date`, `deal_date`, `receipt_date` (TEXT)
- `service_type` (TEXT)
- `has_mortgage` (INTEGER), `mortgage_amount` (REAL)
- `status` (TEXT): draft, active, completed, cancelled
- `period_month`, `period_year` (INTEGER)
- `created_by` (TEXT, FK → profiles)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_deals_company_status`: Filter by status within tenant
- `idx_deals_company_period`: Filter by period within tenant
- `idx_deals_company_created_by`: Filter by creator within tenant

#### deal_participants
Employees involved in a deal (agents, managers).

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `deal_id` (TEXT, FK → deals)
- `employee_id` (TEXT, FK → profiles)
- `role` (TEXT): agent, mop, rop
- `side` (TEXT): seller, buyer
- `created_at` (TIMESTAMP)

**Indexes:**
- `idx_deal_participants_company_employee`: Find deals by employee within tenant

#### deal_commissions
Commission calculations for deals.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `deal_id` (TEXT, FK → deals)
- `commission_type` (TEXT)
- `amount`, `percentage` (REAL)
- `created_at` (TIMESTAMP)

**Indexes:**
- `idx_deal_commissions_company_employee`: Commission queries within tenant

#### deal_documents
Documents attached to deals.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `deal_id` (TEXT, FK → deals)
- `document_name`, `document_url` (TEXT)
- `created_at` (TIMESTAMP)

#### deal_activities
Activity log for deals.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `deal_id` (TEXT, FK → deals)
- `user_id` (TEXT, FK → profiles)
- `activity_type`, `description` (TEXT)
- `created_at` (TIMESTAMP)

#### deal_table_rows
Denormalized reporting table for financial analysis.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (UUID/TEXT, PK)
- `company_id` (UUID, FK → companies)
- `month`, `year` (INTEGER)
- `deposit_date`, `deal_date`, `payment_date` (TEXT)
- `property_name`, `document_type`, `document_link` (TEXT)
- `seller`, `buyer`, `service`, `information` (TEXT)
- `agent_name`, `mop_name`, `rop_name` (TEXT)
- `team_id`, `branch_id` (UUID/TEXT)
- `comment` (TEXT)
- Commission and financial columns (NUMERIC)
- `created_by` (UUID/TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_deal_table_rows_company_year_month`: Period-based reporting within tenant

---

### 4. Financial Tables (Tenant-Scoped)

#### transactions
Financial transactions (income, expenses).

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `type` (TEXT): income, expense
- `category` (TEXT)
- `amount` (REAL)
- `description` (TEXT)
- `user_id` (TEXT, FK → profiles)
- `account_type` (TEXT): cash, card, bank
- `agent_commission_percent`, `rop_commission_percent` (REAL)
- `deal_id` (TEXT, FK → deals)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_transactions_company_type`: Filter by type within tenant
- `idx_transactions_company_date`: Date-based queries within tenant

#### commission_rules
Commission calculation rules.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `position_id` (TEXT, FK → positions)
- `rule_type` (TEXT)
- `percentage` (REAL)
- `created_at` (TIMESTAMP)

**Indexes:**
- `idx_commission_rules_company`: Rules lookup within tenant

---

### 5. Supporting Tables (Tenant-Scoped)

#### leads
Sales leads.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `name`, `phone`, `email` (TEXT)
- `source`, `status` (TEXT)
- `assigned_to` (TEXT, FK → profiles)
- `notes` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_leads_company_status`: Status-based queries within tenant

#### notifications
User notifications.

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `user_id` (TEXT, FK → profiles)
- `title`, `message` (TEXT)
- `type` (TEXT): info, warning, error, success
- `is_read` (INTEGER/BOOLEAN)
- `created_by` (TEXT, FK → profiles)
- `created_at` (TIMESTAMP)

**Indexes:**
- `idx_notifications_company_user`: User notifications within tenant

#### service_requests
Internal service requests (IT, HR, etc.).

**Tenant Isolation:** `company_id UUID NOT NULL`

**Columns:**
- `id` (TEXT, PK)
- `company_id` (UUID, FK → companies)
- `user_id` (TEXT, FK → profiles)
- `type`, `title`, `description` (TEXT)
- `priority` (TEXT): low, normal, high, urgent
- `status` (TEXT): pending, in_progress, completed, cancelled
- `data` (TEXT/JSONB)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_service_requests_company_status`: Status-based queries within tenant

---

### 6. Shared Tables (Not Tenant-Scoped)

These tables are shared across all companies and do NOT have company_id.

#### auth_users
Authentication credentials (shared).

**Columns:**
- `id` (TEXT, PK)
- `email` (TEXT, UNIQUE)
- `encrypted_password` (TEXT)
- `email_confirmed_at` (TIMESTAMP)
- `created_at`, `updated_at` (TIMESTAMP)

#### positions
Job positions/roles (shared).

**Columns:**
- `id` (TEXT, PK)
- `name`, `description` (TEXT)
- `base_salary`, `commission_percent` (REAL)
- KPI and salary configuration columns
- Permission columns: `access_level`, `can_view_finances`, `can_manage_finances`, etc.
- `is_system` (INTEGER): System-defined positions
- `created_at`, `updated_at` (TIMESTAMP)

#### system_settings
Global system configuration (shared).

**Columns:**
- `key` (TEXT, PK)
- `value` (TEXT)
- `updated_at` (TIMESTAMP)

#### push_subscriptions
Web push notification subscriptions (inherits company from user's profile).

**Columns:**
- `id` (TEXT, PK)
- `user_id` (TEXT, FK → profiles)
- `endpoint`, `p256dh`, `auth` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

---

## Index Strategy

All tenant-scoped tables follow this indexing pattern:

1. **company_id first**: Enables partition pruning and efficient tenant isolation
2. **Common filter second**: Most frequently filtered column (status, type, date)
3. **Additional filters third**: For complex queries

Example:
```sql
CREATE INDEX idx_deals_company_status ON deals(company_id, status);
```

This supports queries like:
```sql
SELECT * FROM deals WHERE company_id = ? AND status = 'active';
```

---

## Migration Strategy

All schema changes are managed through `backend/src/db/consolidated_migrations.js`:

1. **Idempotent operations**: All migrations use `IF NOT EXISTS` or `ON CONFLICT DO NOTHING`
2. **Backfill strategy**: Add column → backfill data → set NOT NULL
3. **Index creation**: Always use `IF NOT EXISTS` for safety
4. **Foreign keys**: Include `ON DELETE CASCADE` for tenant cleanup

---

## Security Considerations

1. **JWT tokens include company_id**: All authenticated requests carry tenant context
2. **Middleware validation**: `authenticateToken` validates company_id presence
3. **RLS policies (Plan 01-02)**: Will enforce tenant isolation at database level
4. **Foreign key cascades**: Deleting a company removes all associated data

---

## Performance Optimization

1. **Connection pooling**: Configured with max: 20, min: 5, idle: 30s
2. **Composite indexes**: All tenant queries use company_id-first indexes
3. **Denormalized tables**: deal_table_rows for fast reporting
4. **JSONB columns**: For flexible configuration (companies.settings)

---

## Future Enhancements (Plan 01-02)

1. **Row-Level Security (RLS)**: Enforce tenant isolation at database level
2. **Tenant context function**: PostgreSQL function to get current company_id
3. **RLS policies**: Automatic filtering on all tenant-scoped tables
4. **Performance monitoring**: Query performance tracking per tenant

---

## References

- Companies table: `schema/docs/companies.sql`
- Composite indexes: `schema/docs/indexes.sql`
- Migration script: `../consolidated_migrations.js`
