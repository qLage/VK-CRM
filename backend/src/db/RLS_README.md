# Row-Level Security (RLS) Implementation

## Overview

PostgreSQL Row-Level Security enforces tenant isolation at the database level. Even if application code has bugs, RLS prevents cross-tenant data access.

## How It Works

1. Session variable is set on every request: `SET LOCAL app.current_tenant_id = '<company-uuid>'`
2. RLS policies filter all queries: `WHERE company_id = current_setting('app.current_tenant_id')::uuid`
3. Queries automatically return only tenant-scoped data

## Middleware Flow

```
Request → authenticateToken → setTenantContext → Route Handler → Database Query (RLS applied)
```

## Tables with RLS

All tenant-scoped tables have RLS enabled:
- **Organizational**: branches, teams, profiles
- **Deals**: deals, deal_participants, deal_commissions, deal_documents, deal_activities, deal_table_rows
- **Financial**: transactions, commission_rules
- **Supporting**: leads, notifications, service_requests

## Admin Operations

To bypass RLS for admin operations (e.g., super admin viewing all companies):

```javascript
import { withoutRLS } from '../db/index.js';

const allDeals = await withoutRLS(async (client) => {
  const result = await client.query('SELECT * FROM deals');
  return result.rows;
});
```

## Testing RLS

Run integration tests:
```bash
npm test -- tenant-isolation.test.js
```

## Performance Impact

RLS adds ~5-10% query overhead. This is acceptable for the security benefit.

**Mitigation strategies**:
- Composite indexes with company_id as first column
- Connection pooling to reuse session variables
- Query optimization

## Troubleshooting

### Error: "unrecognized configuration parameter app.current_tenant_id"
- **Cause**: Session variable not set
- **Fix**: Ensure setTenantContext middleware is applied before route handlers

### Error: "permission denied for table"
- **Cause**: RLS policy blocking access
- **Fix**: Verify company_id in JWT matches data being accessed

### Empty results when data exists
- **Cause**: Tenant context not set or incorrect company_id
- **Fix**: Check JWT payload and session variable value

## Implementation Details

### Session Variable Scope

We use `SET LOCAL` instead of `SET` so the variable is automatically cleared at transaction end. This prevents session variable leakage between requests.

### Policy Design

All policies use the same pattern:
```sql
CREATE POLICY tenant_isolation_<table> ON <table>
  USING (company_id = current_setting('app.current_tenant_id')::uuid);
```

We use only the `USING` clause (not `WITH CHECK`) because INSERT/UPDATE validation is handled in application code.

### Shared Tables

The following tables do NOT have RLS because they are shared across all tenants:
- `companies` - tenant registry
- `auth_users` - authentication layer
- `positions` - job titles/roles
- `system_settings` - global configuration

## Security Benefits

1. **Defense in depth**: Even if application code forgets to filter by company_id, RLS prevents data leaks
2. **Centralized enforcement**: Security logic is in one place (database) rather than scattered across application code
3. **Audit trail**: RLS policies are version-controlled and reviewable
4. **Zero-trust architecture**: Database doesn't trust application layer to filter correctly

## Rollback Plan

If RLS causes issues:

1. Disable RLS on all tables:
```sql
ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
```

2. Drop policies:
```sql
DROP POLICY tenant_isolation_<table> ON <table>;
```

3. Remove setTenantContext middleware from server.js

4. Application-level filtering still works (company_id in WHERE clauses)

Note: Keep RLS policies in version control for future re-enablement.
