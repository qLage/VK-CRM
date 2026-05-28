#!/bin/sh
PGPASSWORD=fMYnGIEdYNW2 psql -h master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru -U admin_crm -d crm <<'SQL'
\d deal_table_rows
SELECT column_name FROM information_schema.columns WHERE table_name='deal_payouts' LIMIT 5;
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='deal_payouts');
SELECT id, status, mop_percent, rop_percent, mop_revenue, rop_payout, agent_percent_seller, agent_percent_buyer FROM deal_table_rows ORDER BY created_at DESC LIMIT 3;
SQL
