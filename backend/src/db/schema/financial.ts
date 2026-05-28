import { pgTable, index, uniqueIndex, text, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";

export const transactions = pgTable("transactions", {
  id: text().primaryKey().notNull(),
  type: text().notNull(),
  category: text().notNull(),
  amount: real().notNull(),
  description: text(),
  userId: text("user_id"),
  accountType: text("account_type").default('cash'),
  agentCommissionPercent: real("agent_commission_percent"),
  ropCommissionPercent: real("rop_commission_percent"),
  dealId: text("deal_id"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxTransactionsCompanyDate: index("idx_transactions_company_date").using("btree", table.companyId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
    idxTransactionsCompanyType: index("idx_transactions_company_type").using("btree", table.companyId.asc().nullsLast(), table.type.asc().nullsLast()),
    uxTransactionsDealCommissionIncome: uniqueIndex("ux_transactions_deal_commission_income").using("btree", table.dealId.asc().nullsLast()).where(sql`((category = 'deal_commission'::text) AND (type = 'income'::text))`),
  }
});

export const commissionRules = pgTable("commission_rules", {
  id: text().primaryKey().notNull(),
  positionId: text("position_id"),
  ruleType: text("rule_type").notNull(),
  percentage: real().default(0),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxCommissionRulesCompany: index("idx_commission_rules_company").using("btree", table.companyId.asc().nullsLast()),
  }
});
