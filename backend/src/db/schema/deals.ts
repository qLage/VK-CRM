import { pgTable, index, text, integer, real, timestamp, numeric, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const deals = pgTable("deals", {
  id: text().primaryKey().notNull(),
  propertyObject: text("property_object"),
  documentType: text("document_type"),
  documentDate: text("document_date"),
  sellerName: text("seller_name"),
  sellerPhone: text("seller_phone"),
  buyerName: text("buyer_name"),
  buyerPhone: text("buyer_phone"),
  depositDate: text("deposit_date"),
  dealDate: text("deal_date"),
  receiptDate: text("receipt_date"),
  serviceType: text("service_type"),
  hasMortgage: integer("has_mortgage").default(0),
  mortgageAmount: real("mortgage_amount").default(0),
  status: text().default('draft'),
  periodMonth: integer("period_month"),
  periodYear: integer("period_year"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxDealsCompanyCreatedBy: index("idx_deals_company_created_by").using("btree", table.companyId.asc().nullsLast(), table.createdBy.asc().nullsLast()),
    idxDealsCompanyPeriod: index("idx_deals_company_period").using("btree", table.companyId.asc().nullsLast(), table.periodYear.asc().nullsLast(), table.periodMonth.asc().nullsLast()),
    idxDealsCompanyStatus: index("idx_deals_company_status").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
  }
});

export const dealCommissions = pgTable("deal_commissions", {
  id: text().primaryKey().notNull(),
  dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  commissionSellerPlan: numeric("commission_seller_plan", { precision: 15, scale: 2 }),
  commissionBuyerPlan: numeric("commission_buyer_plan", { precision: 15, scale: 2 }),
  commissionSellerFact: numeric("commission_seller_fact", { precision: 15, scale: 2 }),
  commissionBuyerFact: numeric("commission_buyer_fact", { precision: 15, scale: 2 }),
  agentPercentSeller: numeric("agent_percent_seller", { precision: 5, scale: 2 }),
  agentPercentBuyer: numeric("agent_percent_buyer", { precision: 5, scale: 2 }),
  ropPercent: numeric("rop_percent", { precision: 5, scale: 2 }),
  mortgageExpense: numeric("mortgage_expense", { precision: 15, scale: 2 }),
  otherExpenses: numeric("other_expenses", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
});

export const dealParticipants = pgTable("deal_participants", {
  id: text().primaryKey().notNull(),
  dealId: text("deal_id").notNull(),
  employeeId: text("employee_id").notNull(),
  role: text().notNull(),
  side: text(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxDealParticipantsCompanyEmployee: index("idx_deal_participants_company_employee").using("btree", table.companyId.asc().nullsLast(), table.employeeId.asc().nullsLast()),
  }
});

export const dealDocuments = pgTable("deal_documents", {
  id: text().primaryKey().notNull(),
  dealId: text("deal_id").notNull(),
  documentName: text("document_name").notNull(),
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
});

export const dealActivities = pgTable("deal_activities", {
  id: text().primaryKey().notNull(),
  dealId: text("deal_id").notNull(),
  userId: text("user_id").notNull(),
  activityType: text("activity_type").notNull(),
  description: text(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
});

export const dealTableRows = pgTable("deal_table_rows", {
  id: uuid().primaryKey().notNull(),
  month: integer().notNull(),
  year: integer().notNull(),
  depositDate: text("deposit_date"),
  dealDate: text("deal_date"),
  paymentDate: text("payment_date"),
  propertyName: text("property_name").notNull(),
  documentType: text("document_type").notNull(),
  documentLink: text("document_link"),
  seller: text(),
  buyer: text(),
  service: text(),
  information: text(),
  agentName: text("agent_name"),
  mopName: text("mop_name"),
  ropName: text("rop_name"),
  teamId: uuid("team_id"),
  branchId: uuid("branch_id"),
  comment: text(),
  commissionSellerPlan: numeric("commission_seller_plan", { precision: 12, scale: 2 }).default('0'),
  commissionBuyerPlan: numeric("commission_buyer_plan", { precision: 12, scale: 2 }).default('0'),
  commissionSellerFact: numeric("commission_seller_fact", { precision: 12, scale: 2 }).default('0'),
  commissionBuyerFact: numeric("commission_buyer_fact", { precision: 12, scale: 2 }).default('0'),
  agentPercent: numeric("agent_percent", { precision: 12, scale: 2 }).default('0'),
  ropPercent: numeric("rop_percent", { precision: 12, scale: 2 }).default('0'),
  agentPercentSeller: numeric("agent_percent_seller", { precision: 12, scale: 2 }).default('0'),
  agentPercentBuyer: numeric("agent_percent_buyer", { precision: 12, scale: 2 }).default('0'),
  mopPercent: numeric("mop_percent", { precision: 12, scale: 2 }).default('0'),
  agentManualBonus: numeric("agent_manual_bonus", { precision: 12, scale: 2 }).default('0'),
  ropManualBonus: numeric("rop_manual_bonus", { precision: 12, scale: 2 }).default('0'),
  otherExpenses: numeric("other_expenses", { precision: 12, scale: 2 }).default('0'),
  mortgageDeduction: numeric("mortgage_deduction", { precision: 12, scale: 2 }).default('0'),

  payoutDate: text("payout_date"),
  payoutMopNote: text("payout_mop_note"),
  payoutRopNote: text("payout_rop_note"),
  commissionTotalFact: numeric("commission_total_fact", { precision: 12, scale: 2 }).default('0'),
  agentIncome: numeric("agent_income", { precision: 12, scale: 2 }).default('0'),
  ropPayout: numeric("rop_payout", { precision: 12, scale: 2 }).default('0'),
  mopRevenue: numeric("mop_revenue", { precision: 12, scale: 2 }).default('0'),
  companyRevenue: numeric("company_revenue", { precision: 12, scale: 2 }).default('0'),
  planCompletion: numeric("plan_completion", { precision: 12, scale: 2 }).default('0'),
  marginality: numeric({ precision: 12, scale: 2 }).default('0'),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  status: text().default('active'),
  dealAmount: numeric("deal_amount", { precision: 12, scale: 2 }).default('0'),
  agentId: uuid("agent_id"),
  mopId: uuid("mop_id"),
  ropId: uuid("rop_id"),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxDealTableAgent: index("idx_deal_table_agent").using("btree", table.agentName.asc().nullsLast()),
    idxDealTableAmount: index("idx_deal_table_amount").using("btree", table.dealAmount.asc().nullsLast()),
    idxDealTableDocumentType: index("idx_deal_table_document_type").using("btree", table.documentType.asc().nullsLast()),
    idxDealTableMop: index("idx_deal_table_mop").using("btree", table.mopName.asc().nullsLast()),
    idxDealTableRop: index("idx_deal_table_rop").using("btree", table.ropName.asc().nullsLast()),
    idxDealTableRowsCompanyYearMonth: index("idx_deal_table_rows_company_year_month").using("btree", table.companyId.asc().nullsLast(), table.year.asc().nullsLast(), table.month.asc().nullsLast()),
    idxDealTableStatus: index("idx_deal_table_status").using("btree", table.status.asc().nullsLast()),
    idxDealTableTeam: index("idx_deal_table_team").using("btree", table.teamId.asc().nullsLast()),
    idxDealTableYearMonth: index("idx_deal_table_year_month").using("btree", table.year.asc().nullsLast(), table.month.asc().nullsLast()),
  }
});
