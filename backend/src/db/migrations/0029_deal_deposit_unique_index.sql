-- Prevent duplicate deposit transactions per deal
CREATE UNIQUE INDEX IF NOT EXISTS "ux_transactions_deal_deposit_income"
ON "transactions" USING btree ("deal_id" asc nulls last)
WHERE (("category" = 'deal_deposit'::text) AND ("type" = 'income'::text));
