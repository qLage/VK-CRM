import { pgTable, index, unique, varchar, uuid, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const companies = pgTable("companies", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: varchar({ length: 255 }).notNull(),
  slug: varchar({ length: 100 }).notNull(),
  domain: varchar({ length: 255 }),
  isActive: boolean("is_active").default(true),
  settings: jsonb().default({}),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => {
  return {
    idxCompaniesDomain: index("idx_companies_domain").using("btree", table.domain.asc().nullsLast()).where(sql`(domain IS NOT NULL)`),
    idxCompaniesSlug: index("idx_companies_slug").using("btree", table.slug.asc().nullsLast()),
    companiesSlugKey: unique("companies_slug_key").on(table.slug),
  }
});
