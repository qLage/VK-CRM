import { pgTable, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const branches = pgTable("branches", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  city: text().notNull(),
  address: text(),
  phone: text(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxBranchesCompany: index("idx_branches_company").using("btree", table.companyId.asc().nullsLast()),
  }
});

export const teams = pgTable("teams", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  branchId: text("branch_id"),
  leaderId: text("leader_id"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxTeamsCompanyBranch: index("idx_teams_company_branch").using("btree", table.companyId.asc().nullsLast(), table.branchId.asc().nullsLast()),
  }
});
