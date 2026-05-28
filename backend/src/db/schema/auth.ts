import { pgTable, index, foreignKey, unique, text, timestamp, integer, real, numeric, varchar, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const authUsers = pgTable("auth_users", {
  id: text().primaryKey().notNull(),
  email: text(),
  encryptedPassword: text("encrypted_password").notNull(),
  emailConfirmedAt: timestamp("email_confirmed_at", { mode: 'string' }),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => {
  return {
    authUsersEmailKey: unique("auth_users_email_key").on(table.email),
  }
});

export const positions = pgTable("positions", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  description: text(),
  baseSalary: real("base_salary").default(0),
  commissionPercent: real("commission_percent").default(0),
  defaultPersonalKpiMin: real("default_personal_kpi_min").default(40),
  defaultPersonalKpiMax: real("default_personal_kpi_max").default(60),
  defaultManagementKpiMin: real("default_management_kpi_min").default(0),
  defaultManagementKpiMax: real("default_management_kpi_max").default(0),
  managementBaseSalary: real("management_base_salary").default(0),
  participatesInRating: integer("participates_in_rating").default(1),
  isSalaryEnabled: integer("is_salary_enabled").default(1),
  isKpiEnabled: integer("is_kpi_enabled").default(1),
  isNewBuilding: integer("is_new_building").default(0),
  isSystem: integer("is_system").default(0),
  sortOrder: integer("sort_order").default(100),
  accessLevel: integer("access_level").default(0),
  canViewFinances: integer("can_view_finances").default(0),
  canManageFinances: integer("can_manage_finances").default(0),
  canManageBranches: integer("can_manage_branches").default(0),
  canManageUsers: integer("can_manage_users").default(0),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: text().primaryKey().notNull(),
  email: text(),
  fullName: text("full_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text(),
  avatarUrl: text("avatar_url"),
  positionId: text("position_id").references(() => positions.id),
  branchId: text("branch_id"),
  teamId: text("team_id"),
  hasSalary: integer("has_salary").default(1),
  salaryAmount: real("salary_amount").default(0),
  commissionPercent: real("commission_percent").default(0),
  personalKpiCurrent: real("personal_kpi_current"),
  managementKpiCurrent: real("management_kpi_current"),
  kpiLastUpdated: timestamp("kpi_last_updated", { mode: 'string' }),
  isActive: integer("is_active").default(1),
  isKpiEnabled: integer("is_kpi_enabled").default(1),
  isNewBuilding: integer("is_new_building").default(0),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  customTotalDeals: integer("custom_total_deals").default(0),
  customTotalObjects: integer("custom_total_objects").default(0),
  customTotalRevenue: numeric("custom_total_revenue", { precision: 15, scale: 2 }).default('0'),
  registrationDate: timestamp("registration_date", { mode: 'string' }),
  realtorType: varchar("realtor_type", { length: 50 }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    idxProfilesActive: index("idx_profiles_active").using("btree", table.isActive.asc().nullsLast()),
    idxProfilesBranch: index("idx_profiles_branch").using("btree", table.branchId.asc().nullsLast(), table.isActive.asc().nullsLast()),
    idxProfilesCompany: index("idx_profiles_company").using("btree", table.companyId.asc().nullsLast()),
    idxProfilesTeam: index("idx_profiles_team").using("btree", table.teamId.asc().nullsLast(), table.isActive.asc().nullsLast()),
    idxProfilesTeamBranch: index("idx_profiles_team_branch").using("btree", table.teamId.asc().nullsLast(), table.branchId.asc().nullsLast(), table.isActive.asc().nullsLast()),
    profilesIdFkey: foreignKey({
      columns: [table.id],
      foreignColumns: [authUsers.id],
      name: "profiles_id_fkey"
    }).onDelete("cascade"),
    profilesEmailKey: unique("profiles_email_key").on(table.email),
  }
});

export const userRoles = pgTable("user_roles", {
  id: text().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  role: text().notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => {
  return {
    userRolesUserIdRoleKey: unique("user_roles_user_id_role_key").on(table.userId, table.role),
  }
});

export const userPlans = pgTable("user_plans", {
  id: text().primaryKey().notNull(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  periodMonth: text("period_month").notNull(),
  targetRevenue: numeric("target_revenue", { precision: 15, scale: 2 }).default('0'),
  targetDeals: integer("target_deals").default(0),
  targetDeposits: integer("target_deposits").default(0),
  targetObjects: integer("target_objects").default(0),
  targetNewbuildings: integer("target_newbuildings").default(0),
  targetAttendance: integer("target_attendance").default(0),
  targetMortgage: integer("target_mortgage").default(0),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
  targetCalls: integer("target_calls").default(0),
  targetMeetings: integer("target_meetings").default(0),
  targetShowings: integer("target_showings").default(0),
}, (table) => {
  return {
    idxUserPlansPeriod: index("idx_user_plans_period").using("btree", table.periodMonth.asc().nullsLast()),
    idxUserPlansUserPeriod: index("idx_user_plans_user_period").using("btree", table.userId.asc().nullsLast(), table.periodMonth.asc().nullsLast()),
    userPlansUserIdPeriodMonthKey: unique("user_plans_user_id_period_month_key").on(table.userId, table.periodMonth),
  }
});

export const attendance = pgTable("attendance", {
  id: text().primaryKey().notNull(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  checkIn: text("check_in"),
  checkOut: text("check_out"),
  date: text().notNull(),
  isInFields: integer("is_in_fields").default(0),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  endpoint: text().notNull(),
  p256Dh: text("p256dh").notNull(),
  auth: text().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => {
  return {
    ixPushSubscriptionsEndpoint: index("ix_push_subscriptions_endpoint").using("btree", table.endpoint.asc().nullsLast()),
    ixPushSubscriptionsUser: index("ix_push_subscriptions_user").using("btree", table.userId.asc().nullsLast()),
    uxPushSubscriptionsUserEndpoint: index("ux_push_subscriptions_user_endpoint").using("btree", table.userId.asc().nullsLast(), table.endpoint.asc().nullsLast()),
  }
});
