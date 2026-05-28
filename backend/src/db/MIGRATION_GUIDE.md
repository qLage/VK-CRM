# Database Migration Guide

## Overview

We use Drizzle ORM for type-safe database queries and Drizzle Kit for migration management.

## Migration Workflow

### 1. Make Schema Changes

Edit schema files in `backend/src/db/schema/`:

```typescript
// backend/src/db/schema/deals.ts
export const deals = pgTable('deals', {
  // ... existing columns ...
  newColumn: text('new_column'), // Add new column
});
```

### 2. Generate Migration

```bash
npm run db:generate
```

This creates a new migration file in `backend/src/db/migrations/` with SQL statements.

### 3. Review Migration

Open the generated migration file and verify the SQL is correct. Check for:
- Correct column types and constraints
- Proper handling of NOT NULL constraints (add column as nullable first, backfill, then add NOT NULL)
- Index creation statements
- Foreign key relationships

### 4. Apply Migration

```bash
npm run migrate:drizzle
```

This applies pending migrations to the database using the Drizzle migrate function.

### 5. Commit Changes

```bash
git add backend/src/db/schema/ backend/src/db/migrations/
git commit -m "Add new_column to deals table"
```

## Common Operations

### Add a New Table

1. Create schema file: `backend/src/db/schema/new_table.ts`
2. Define table using `pgTable()` with columns and indexes
3. Export from `backend/src/db/schema/index.ts`
4. Run `npm run db:generate`
5. Review and apply migration

### Add a Column

1. Edit schema file to add column definition
2. Run `npm run db:generate`
3. Review migration (check for NOT NULL constraints)
4. If adding NOT NULL column to existing table:
   - First migration: Add column as nullable
   - Backfill data manually or via script
   - Second migration: Add NOT NULL constraint
5. Apply migration

### Add an Index

1. Add index to schema table definition in the return object
2. Run `npm run db:generate`
3. Review generated CREATE INDEX statement
4. Apply migration

Example:
```typescript
export const deals = pgTable('deals', {
  // columns...
}, (table) => {
  return {
    idxDealsNewColumn: index('idx_deals_new_column').using('btree', table.newColumn.asc().nullsLast()),
  }
});
```

### Rollback Migration

Drizzle Kit doesn't have built-in rollback. To rollback:

1. Manually write DOWN migration SQL
2. Execute SQL directly: `psql $DATABASE_URL < rollback.sql`
3. Remove migration entry from `__drizzle_migrations` table:
   ```sql
   DELETE FROM __drizzle_migrations WHERE created_at = <timestamp>;
   ```
4. Delete the migration file from `backend/src/db/migrations/`

## Migration Best Practices

- **Always review generated migrations** before applying - Drizzle Kit generates SQL but may not handle all edge cases
- **Test migrations on staging** before production deployment
- **Keep migrations small and focused** - one logical change per migration
- **Add NOT NULL constraints carefully** - use three-step process (add nullable, backfill, add constraint)
- **Use transactions for complex migrations** - wrap multiple statements in BEGIN/COMMIT
- **Document breaking changes** in migration comments
- **Never edit applied migrations** - create a new migration to fix issues
- **Backup database** before running migrations in production

## Drizzle Studio

View and edit database data with Drizzle Studio:

```bash
npm run db:studio
```

Opens web UI at http://localhost:4983

Features:
- Browse all tables and data
- Edit records directly
- View table schemas
- Execute custom queries

## Using Drizzle ORM in Code

### Import Drizzle Client

```typescript
import { drizzle, schema } from '../db';
import { deals } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
```

### Basic Queries

```typescript
// SELECT
const result = await drizzle
  .select()
  .from(deals)
  .where(eq(deals.id, dealId));

// INSERT
const newDeal = await drizzle
  .insert(deals)
  .values({ /* data */ })
  .returning();

// UPDATE
const updated = await drizzle
  .update(deals)
  .set({ status: 'completed' })
  .where(eq(deals.id, dealId))
  .returning();

// DELETE
await drizzle
  .delete(deals)
  .where(eq(deals.id, dealId));
```

### Type Safety

Drizzle provides full TypeScript type safety:

```typescript
// TypeScript knows all column names and types
const deal = await drizzle.select().from(deals).where(eq(deals.id, '123'));
// deal[0].propertyObject is typed as string | null
// deal[0].invalidColumn would be a TypeScript error
```

## Incremental Migration Strategy

The codebase supports both legacy query functions and Drizzle ORM during transition:

### Legacy Queries (Current)

```typescript
import { query } from '../db';

const result = await query('SELECT * FROM deals WHERE id = $1', [dealId]);
```

### Drizzle Queries (New)

```typescript
import { drizzle } from '../db';
import { deals } from '../db/schema';
import { eq } from 'drizzle-orm';

const result = await drizzle.select().from(deals).where(eq(deals.id, dealId));
```

### Migration Approach

1. **Keep legacy code working** - don't break existing functionality
2. **Create Drizzle versions** - add `.drizzle.ts` files alongside existing models
3. **Use feature flags** - control which implementation is active
4. **Migrate route by route** - gradual transition reduces risk
5. **Test both implementations** - ensure feature parity

Example:
```typescript
// models/Deal.ts - legacy implementation
// models/Deal.drizzle.ts - new Drizzle implementation

// In route:
import { USE_DRIZZLE } from '../config/features';
import DealModel from '../models/Deal';
import DealDrizzle from '../models/Deal.drizzle';

const Deal = USE_DRIZZLE ? DealDrizzle : DealModel;
```

## Troubleshooting

### Migration fails with "column already exists"

**Cause**: Migration was partially applied or run multiple times

**Solution**:
1. Check database state: `psql $DATABASE_URL -c "\d table_name"`
2. If column exists, remove it: `ALTER TABLE table_name DROP COLUMN column_name;`
3. Remove failed migration from `__drizzle_migrations` table
4. Re-run migration

### Schema drift detected

**Cause**: Database schema doesn't match Drizzle schema files

**Solution**:
1. Run `npm run db:introspect` to see current database schema
2. Compare with schema files in `backend/src/db/schema/`
3. Generate migration to sync: `npm run db:generate`
4. Review and apply migration

### Type errors after schema change

**Cause**: TypeScript cache is stale

**Solution**:
1. Restart TypeScript server in IDE
2. Run `npm run typecheck` to verify
3. If errors persist, check schema file syntax

### Migration hangs or times out

**Cause**: Table locks or long-running operations

**Solution**:
1. Check for active queries: `SELECT * FROM pg_stat_activity;`
2. Kill blocking queries if safe
3. For large tables, consider:
   - Running migration during low-traffic period
   - Creating indexes CONCURRENTLY
   - Using batched updates for data migrations

### Drizzle Studio won't start

**Cause**: Port 4983 already in use

**Solution**:
1. Check what's using the port: `lsof -i :4983` (Mac/Linux) or `netstat -ano | findstr :4983` (Windows)
2. Kill the process or use different port
3. Configure custom port in drizzle.config.ts if needed

## Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
