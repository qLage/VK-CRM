-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "push_subscriptions_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "push_subscriptions_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "push_subscriptions_endpoint_not_null" CHECK (NOT NULL endpoint),
	CONSTRAINT "push_subscriptions_p256dh_not_null" CHECK (NOT NULL p256dh),
	CONSTRAINT "push_subscriptions_auth_not_null" CHECK (NOT NULL auth),
	CONSTRAINT "push_subscriptions_created_at_not_null" CHECK (NOT NULL created_at),
	CONSTRAINT "push_subscriptions_updated_at_not_null" CHECK (NOT NULL updated_at)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period_month" text NOT NULL,
	"target_revenue" numeric(15, 2) DEFAULT '0',
	"target_deals" integer DEFAULT 0,
	"target_deposits" integer DEFAULT 0,
	"target_objects" integer DEFAULT 0,
	"target_newbuildings" integer DEFAULT 0,
	"target_attendance" integer DEFAULT 0,
	"target_mortgage" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"target_calls" integer DEFAULT 0,
	"target_meetings" integer DEFAULT 0,
	"target_showings" integer DEFAULT 0,
	CONSTRAINT "user_plans_user_id_period_month_key" UNIQUE("user_id","period_month"),
	CONSTRAINT "user_plans_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "user_plans_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "user_plans_period_month_not_null" CHECK (NOT NULL period_month)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"avatar_url" text,
	"position_id" text,
	"branch_id" text,
	"team_id" text,
	"has_salary" integer DEFAULT 1,
	"salary_amount" real DEFAULT 0,
	"commission_percent" real DEFAULT 0,
	"personal_kpi_current" real,
	"management_kpi_current" real,
	"kpi_last_updated" timestamp,
	"is_active" integer DEFAULT 1,
	"is_kpi_enabled" integer DEFAULT 1,
	"is_new_building" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"custom_total_deals" integer DEFAULT 0,
	"custom_total_objects" integer DEFAULT 0,
	"custom_total_revenue" numeric(15, 2) DEFAULT '0',
	"registration_date" timestamp,
	"realtor_type" varchar(50),
	"company_id" uuid NOT NULL,
	CONSTRAINT "profiles_email_key" UNIQUE("email"),
	CONSTRAINT "profiles_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "profiles_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_commissions" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text,
	"commission_seller_plan" numeric(15, 2),
	"commission_buyer_plan" numeric(15, 2),
	"commission_seller_fact" numeric(15, 2),
	"commission_buyer_fact" numeric(15, 2),
	"agent_percent_seller" numeric(5, 2),
	"agent_percent_buyer" numeric(5, 2),
	"rop_percent" numeric(5, 2),
	"mortgage_expense" numeric(15, 2),
	"other_expenses" numeric(15, 2),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "deal_commissions_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "deal_commissions_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_salary" real DEFAULT 0,
	"commission_percent" real DEFAULT 0,
	"default_personal_kpi_min" real DEFAULT 40,
	"default_personal_kpi_max" real DEFAULT 60,
	"default_management_kpi_min" real DEFAULT 0,
	"default_management_kpi_max" real DEFAULT 0,
	"management_base_salary" real DEFAULT 0,
	"participates_in_rating" integer DEFAULT 1,
	"is_salary_enabled" integer DEFAULT 1,
	"is_kpi_enabled" integer DEFAULT 1,
	"is_new_building" integer DEFAULT 0,
	"is_system" integer DEFAULT 0,
	"sort_order" integer DEFAULT 100,
	"access_level" integer DEFAULT 0,
	"can_view_finances" integer DEFAULT 0,
	"can_manage_finances" integer DEFAULT 0,
	"can_manage_branches" integer DEFAULT 0,
	"can_manage_users" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "positions_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "positions_name_not_null" CHECK (NOT NULL name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"encrypted_password" text NOT NULL,
	"email_confirmed_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "auth_users_email_key" UNIQUE("email"),
	CONSTRAINT "auth_users_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "auth_users_encrypted_password_not_null" CHECK (NOT NULL encrypted_password)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"check_in" text,
	"check_out" text,
	"date" text NOT NULL,
	"is_in_fields" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "attendance_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "attendance_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "attendance_date_not_null" CHECK (NOT NULL date)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"fields" text NOT NULL,
	"is_active" integer DEFAULT 1,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "report_templates_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "report_templates_title_not_null" CHECK (NOT NULL title),
	CONSTRAINT "report_templates_fields_not_null" CHECK (NOT NULL fields)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_request_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "service_request_attachments_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "service_request_attachments_request_id_not_null" CHECK (NOT NULL request_id),
	CONSTRAINT "service_request_attachments_file_name_not_null" CHECK (NOT NULL file_name),
	CONSTRAINT "service_request_attachments_file_url_not_null" CHECK (NOT NULL file_url)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "system_settings_key_not_null" CHECK (NOT NULL key),
	CONSTRAINT "system_settings_value_not_null" CHECK (NOT NULL value)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"property_object" text,
	"document_type" text,
	"document_date" text,
	"seller_name" text,
	"seller_phone" text,
	"buyer_name" text,
	"buyer_phone" text,
	"deposit_date" text,
	"deal_date" text,
	"receipt_date" text,
	"service_type" text,
	"has_mortgage" integer DEFAULT 0,
	"mortgage_amount" real DEFAULT 0,
	"status" text DEFAULT 'draft',
	"period_month" integer,
	"period_year" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "deals_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "deals_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text,
	"phone" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "branches_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "branches_name_not_null" CHECK (NOT NULL name),
	CONSTRAINT "branches_city_not_null" CHECK (NOT NULL city),
	CONSTRAINT "branches_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" text,
	"leader_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "teams_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "teams_name_not_null" CHECK (NOT NULL name),
	CONSTRAINT "teams_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"type" text DEFAULT 'info',
	"is_read" integer DEFAULT 0,
	"created_by" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "notifications_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "notifications_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "notifications_title_not_null" CHECK (NOT NULL title),
	CONSTRAINT "notifications_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"amount" real NOT NULL,
	"description" text,
	"user_id" text,
	"account_type" text DEFAULT 'cash',
	"agent_commission_percent" real,
	"rop_commission_percent" real,
	"deal_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "transactions_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "transactions_type_not_null" CHECK (NOT NULL type),
	CONSTRAINT "transactions_category_not_null" CHECK (NOT NULL category),
	CONSTRAINT "transactions_amount_not_null" CHECK (NOT NULL amount),
	CONSTRAINT "transactions_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"source" text,
	"status" text DEFAULT 'new',
	"assigned_to" text,
	"notes" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "leads_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "leads_name_not_null" CHECK (NOT NULL name),
	CONSTRAINT "leads_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"template_id" text,
	"status" text DEFAULT 'pending',
	"title" text,
	"description" text,
	"amount" real,
	"deal_date" text,
	"client_name" text,
	"client_phone" text,
	"property_address" text,
	"content" text,
	"approved_by" text,
	"approved_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "reports_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "reports_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "reports_type_not_null" CHECK (NOT NULL type)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"position_id" text,
	"rule_type" text NOT NULL,
	"percentage" real DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "commission_rules_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "commission_rules_rule_type_not_null" CHECK (NOT NULL rule_type),
	CONSTRAINT "commission_rules_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_roles_user_id_role_key" UNIQUE("user_id","role"),
	CONSTRAINT "user_roles_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "user_roles_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "user_roles_role_not_null" CHECK (NOT NULL role)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_type" text NOT NULL,
	"status" text NOT NULL,
	"task_name" text,
	"task_description" text,
	"progress_percent" integer DEFAULT 0,
	"error_message" text,
	"metadata" text,
	"user_id" uuid,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"completed_at" timestamp,
	CONSTRAINT "agent_instances_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "agent_instances_agent_type_not_null" CHECK (NOT NULL agent_type),
	CONSTRAINT "agent_instances_status_not_null" CHECK (NOT NULL status)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"old_status" text,
	"new_status" text,
	"data" text,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "agent_events_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "agent_events_agent_id_not_null" CHECK (NOT NULL agent_id),
	CONSTRAINT "agent_events_event_type_not_null" CHECK (NOT NULL event_type)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quarterly_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"period_year" integer NOT NULL,
	"period_quarter" integer NOT NULL,
	"target_revenue" numeric(15, 2) DEFAULT '0',
	"target_deals" integer DEFAULT 0,
	"target_deposits" integer DEFAULT 0,
	"target_objects" integer DEFAULT 0,
	"target_newbuildings" integer DEFAULT 0,
	"target_attendance" integer DEFAULT 0,
	"target_mortgage" integer DEFAULT 0,
	"target_calls" integer DEFAULT 0,
	"target_meetings" integer DEFAULT 0,
	"target_showings" integer DEFAULT 0,
	"created_by" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "quarterly_plans_period_year_period_quarter_key" UNIQUE("period_year","period_quarter"),
	CONSTRAINT "quarterly_plans_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "quarterly_plans_period_year_not_null" CHECK (NOT NULL period_year),
	CONSTRAINT "quarterly_plans_period_quarter_not_null" CHECK (NOT NULL period_quarter)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"domain" varchar(255),
	"is_active" boolean DEFAULT true,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "companies_slug_key" UNIQUE("slug"),
	CONSTRAINT "companies_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "companies_name_not_null" CHECK (NOT NULL name),
	CONSTRAINT "companies_slug_not_null" CHECK (NOT NULL slug)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"role" text NOT NULL,
	"side" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "deal_participants_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "deal_participants_deal_id_not_null" CHECK (NOT NULL deal_id),
	CONSTRAINT "deal_participants_employee_id_not_null" CHECK (NOT NULL employee_id),
	CONSTRAINT "deal_participants_role_not_null" CHECK (NOT NULL role),
	CONSTRAINT "deal_participants_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"document_name" text NOT NULL,
	"document_url" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "deal_documents_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "deal_documents_deal_id_not_null" CHECK (NOT NULL deal_id),
	CONSTRAINT "deal_documents_document_name_not_null" CHECK (NOT NULL document_name),
	CONSTRAINT "deal_documents_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "deal_activities_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "deal_activities_deal_id_not_null" CHECK (NOT NULL deal_id),
	CONSTRAINT "deal_activities_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "deal_activities_activity_type_not_null" CHECK (NOT NULL activity_type),
	CONSTRAINT "deal_activities_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_table_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"deposit_date" text,
	"deal_date" text,
	"payment_date" text,
	"property_name" text NOT NULL,
	"document_type" text NOT NULL,
	"document_link" text,
	"seller" text,
	"buyer" text,
	"service" text,
	"information" text,
	"agent_name" text,
	"mop_name" text,
	"rop_name" text,
	"team_id" uuid,
	"branch_id" uuid,
	"comment" text,
	"commission_seller_plan" numeric(12, 2) DEFAULT '0',
	"commission_buyer_plan" numeric(12, 2) DEFAULT '0',
	"commission_seller_fact" numeric(12, 2) DEFAULT '0',
	"commission_buyer_fact" numeric(12, 2) DEFAULT '0',
	"agent_percent" numeric(12, 2) DEFAULT '0',
	"rop_percent" numeric(12, 2) DEFAULT '0',
	"agent_percent_seller" numeric(12, 2) DEFAULT '0',
	"agent_percent_buyer" numeric(12, 2) DEFAULT '0',
	"mop_percent" numeric(12, 2) DEFAULT '0',
	"agent_manual_bonus" numeric(12, 2) DEFAULT '0',
	"rop_manual_bonus" numeric(12, 2) DEFAULT '0',
	"other_expenses" numeric(12, 2) DEFAULT '0',
	"mortgage_deduction" numeric(12, 2) DEFAULT '0',
	"payout_date" text,
	"payout_mop_note" text,
	"payout_rop_note" text,
	"commission_total_fact" numeric(12, 2) DEFAULT '0',
	"agent_income" numeric(12, 2) DEFAULT '0',
	"rop_payout" numeric(12, 2) DEFAULT '0',
	"mop_revenue" numeric(12, 2) DEFAULT '0',
	"company_revenue" numeric(12, 2) DEFAULT '0',
	"plan_completion" numeric(12, 2) DEFAULT '0',
	"marginality" numeric(12, 2) DEFAULT '0',
	"created_by" uuid,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"status" text DEFAULT 'active',
	"deal_amount" numeric(12, 2) DEFAULT '0',
	"company_id" uuid NOT NULL,
	CONSTRAINT "deal_table_rows_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "deal_table_rows_month_not_null" CHECK (NOT NULL month),
	CONSTRAINT "deal_table_rows_year_not_null" CHECK (NOT NULL year),
	CONSTRAINT "deal_table_rows_property_name_not_null" CHECK (NOT NULL property_name),
	CONSTRAINT "deal_table_rows_document_type_not_null" CHECK (NOT NULL document_type),
	CONSTRAINT "deal_table_rows_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'normal',
	"status" text DEFAULT 'pending',
	"data" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"company_id" uuid NOT NULL,
	CONSTRAINT "service_requests_id_not_null" CHECK (NOT NULL id),
	CONSTRAINT "service_requests_user_id_not_null" CHECK (NOT NULL user_id),
	CONSTRAINT "service_requests_type_not_null" CHECK (NOT NULL type),
	CONSTRAINT "service_requests_title_not_null" CHECK (NOT NULL title),
	CONSTRAINT "service_requests_company_id_not_null" CHECK (NOT NULL company_id)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_commissions" ADD CONSTRAINT "deal_commissions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_commissions" ADD CONSTRAINT "deal_commissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quarterly_plans" ADD CONSTRAINT "quarterly_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_participants" ADD CONSTRAINT "deal_participants_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_table_rows" ADD CONSTRAINT "deal_table_rows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_push_subscriptions_endpoint" ON "push_subscriptions" USING btree ("endpoint" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_push_subscriptions_user" ON "push_subscriptions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_push_subscriptions_user_endpoint" ON "push_subscriptions" USING btree ("user_id" text_ops,"endpoint" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_plans_period" ON "user_plans" USING btree ("period_month" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_plans_user_period" ON "user_plans" USING btree ("user_id" text_ops,"period_month" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profiles_active" ON "profiles" USING btree ("is_active" int4_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profiles_branch" ON "profiles" USING btree ("branch_id" int4_ops,"is_active" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profiles_company" ON "profiles" USING btree ("company_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profiles_team" ON "profiles" USING btree ("team_id" text_ops,"is_active" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profiles_team_branch" ON "profiles" USING btree ("team_id" text_ops,"branch_id" int4_ops,"is_active" int4_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deals_company_created_by" ON "deals" USING btree ("company_id" text_ops,"created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deals_company_period" ON "deals" USING btree ("company_id" uuid_ops,"period_year" int4_ops,"period_month" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deals_company_status" ON "deals" USING btree ("company_id" uuid_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_company" ON "branches" USING btree ("company_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_teams_company_branch" ON "teams" USING btree ("company_id" text_ops,"branch_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_company_user" ON "notifications" USING btree ("company_id" int4_ops,"user_id" uuid_ops,"is_read" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_company_date" ON "transactions" USING btree ("company_id" timestamp_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_company_type" ON "transactions" USING btree ("company_id" text_ops,"type" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_transactions_deal_commission_income" ON "transactions" USING btree ("deal_id" text_ops) WHERE ((category = 'deal_commission'::text) AND (type = 'income'::text));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_company_status" ON "leads" USING btree ("company_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reports_date_status" ON "reports" USING btree ("created_at" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reports_deal_date" ON "reports" USING btree ("deal_date" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reports_user_date_type_status" ON "reports" USING btree ("user_id" text_ops,"created_at" text_ops,"type" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commission_rules_company" ON "commission_rules" USING btree ("company_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_instances_status" ON "agent_instances" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_instances_type" ON "agent_instances" USING btree ("agent_type" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_instances_user_id" ON "agent_instances" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_events_agent_id" ON "agent_events" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_events_timestamp" ON "agent_events" USING btree ("timestamp" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_events_type" ON "agent_events" USING btree ("event_type" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_companies_domain" ON "companies" USING btree ("domain" text_ops) WHERE (domain IS NOT NULL);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_companies_slug" ON "companies" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_participants_company_employee" ON "deal_participants" USING btree ("company_id" text_ops,"employee_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_agent" ON "deal_table_rows" USING btree ("agent_name" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_amount" ON "deal_table_rows" USING btree ("deal_amount" numeric_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_document_type" ON "deal_table_rows" USING btree ("document_type" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_mop" ON "deal_table_rows" USING btree ("mop_name" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_rop" ON "deal_table_rows" USING btree ("rop_name" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_rows_company_year_month" ON "deal_table_rows" USING btree ("company_id" int4_ops,"year" int4_ops,"month" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_status" ON "deal_table_rows" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_team" ON "deal_table_rows" USING btree ("team_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_table_year_month" ON "deal_table_rows" USING btree ("year" int4_ops,"month" int4_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_requests_company_status" ON "service_requests" USING btree ("company_id" text_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_requests_date_status" ON "service_requests" USING btree ("created_at" text_ops,"status" text_ops,"type" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_requests_user_date_status" ON "service_requests" USING btree ("user_id" text_ops,"created_at" text_ops,"status" text_ops,"type" timestamp_ops);
*/