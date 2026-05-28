import { pgTable, index, unique, text, integer, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { authUsers } from "./auth";
import { branches } from "./organizational";

export const leads = pgTable("leads", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  phone: text(),
  email: text(),
  source: text(),
  status: text().default('new'),
  assignedTo: text("assigned_to"),
  notes: text(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxLeadsCompanyStatus: index("idx_leads_company_status").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
  }
});

export const notifications = pgTable("notifications", {
  id: text().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  title: text().notNull(),
  message: text(),
  type: text().default('info'),
  isRead: integer("is_read").default(0),
  isForced: integer("is_forced").default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxNotificationsCompanyUser: index("idx_notifications_company_user").using("btree", table.companyId.asc().nullsLast(), table.userId.asc().nullsLast(), table.isRead.asc().nullsLast()),
  }
});

export const serviceRequests = pgTable("service_requests", {
  id: text().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  type: text().notNull(),
  title: text().notNull(),
  description: text(),
  priority: text().default('normal'),
  status: text().default('pending'),
  data: text(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxServiceRequestsCompanyStatus: index("idx_service_requests_company_status").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
    idxServiceRequestsDateStatus: index("idx_service_requests_date_status").using("btree", table.createdAt.asc().nullsLast(), table.status.asc().nullsLast(), table.type.asc().nullsLast()),
    idxServiceRequestsUserDateStatus: index("idx_service_requests_user_date_status").using("btree", table.userId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.status.asc().nullsLast(), table.type.asc().nullsLast()),
  }
});

export const serviceRequestAttachments = pgTable("service_request_attachments", {
  id: text().primaryKey().notNull(),
  requestId: text("request_id").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const reportTemplates = pgTable("report_templates", {
  id: text().primaryKey().notNull(),
  title: text().notNull(),
  description: text(),
  fields: text().notNull(),
  isActive: integer("is_active").default(1),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const reports = pgTable("reports", {
  id: text().primaryKey().notNull(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  type: text().notNull(),
  templateId: text("template_id").references(() => reportTemplates.id),
  status: text().default('pending'),
  title: text(),
  description: text(),
  amount: real(),
  dealDate: text("deal_date"),
  clientName: text("client_name"),
  clientPhone: text("client_phone"),
  propertyAddress: text("property_address"),
  content: text(),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
}, (table) => {
  return {
    idxReportsDateStatus: index("idx_reports_date_status").using("btree", table.createdAt.asc().nullsLast(), table.status.asc().nullsLast()),
    idxReportsDealDate: index("idx_reports_deal_date").using("btree", table.dealDate.asc().nullsLast(), table.status.asc().nullsLast()),
    idxReportsUserDateTypeStatus: index("idx_reports_user_date_type_status").using("btree", table.userId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.type.asc().nullsLast(), table.status.asc().nullsLast()),
  }
});

export const systemSettings = pgTable("system_settings", {
  key: text().primaryKey().notNull(),
  value: text().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const quarterlyPlans = pgTable("quarterly_plans", {
  id: text().primaryKey().notNull(),
  periodYear: integer("period_year").notNull(),
  periodQuarter: integer("period_quarter").notNull(),
  branchId: text("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
  targetRevenue: text("target_revenue"),
  targetDeals: integer("target_deals").default(0),
  targetDeposits: integer("target_deposits").default(0),
  targetObjects: integer("target_objects").default(0),
  targetNewbuildings: integer("target_newbuildings").default(0),
  targetAttendance: integer("target_attendance").default(0),
  targetMortgage: integer("target_mortgage").default(0),
  targetCalls: integer("target_calls").default(0),
  targetMeetings: integer("target_meetings").default(0),
  targetShowings: integer("target_showings").default(0),
  createdBy: text("created_by").references(() => authUsers.id),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => {
  return {
    quarterlyPlansPeriodYearQuarterBranchKey: unique("quarterly_plans_period_year_quarter_branch_key").on(table.periodYear, table.periodQuarter, table.branchId),
  }
});

export const agentInstances = pgTable("agent_instances", {
  id: uuid().primaryKey().notNull(),
  agentType: text("agent_type").notNull(),
  status: text().notNull(),
  taskName: text("task_name"),
  taskDescription: text("task_description"),
  progressPercent: integer("progress_percent").default(0),
  errorMessage: text("error_message"),
  metadata: text(),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => {
  return {
    idxAgentInstancesStatus: index("idx_agent_instances_status").using("btree", table.status.asc().nullsLast()),
    idxAgentInstancesType: index("idx_agent_instances_type").using("btree", table.agentType.asc().nullsLast()),
    idxAgentInstancesUserId: index("idx_agent_instances_user_id").using("btree", table.userId.asc().nullsLast()),
  }
});

export const agentEvents = pgTable("agent_events", {
  id: uuid().primaryKey().notNull(),
  agentId: uuid("agent_id").notNull(),
  eventType: text("event_type").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  data: text(),
  timestamp: timestamp({ mode: 'string' }).defaultNow(),
}, (table) => {
  return {
    idxAgentEventsAgentId: index("idx_agent_events_agent_id").using("btree", table.agentId.asc().nullsLast()),
    idxAgentEventsTimestamp: index("idx_agent_events_timestamp").using("btree", table.timestamp.asc().nullsLast()),
    idxAgentEventsType: index("idx_agent_events_type").using("btree", table.eventType.asc().nullsLast()),
  }
});
