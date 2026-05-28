export interface Deal {
  id: string;
  property_object?: string;
  document_type?: string;
  document_date?: string;
  seller_name?: string;
  seller_phone?: string;
  buyer_name?: string;
  buyer_phone?: string;
  deposit_date?: string;
  deal_date?: string;
  receipt_date?: string;
  service_type?: string;
  has_mortgage?: number;
  mortgage_amount?: number;
  status?: string;
  period_month?: number;
  period_year?: number;
  created_by?: string;
  company_id?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface DealParticipant {
  id: string;
  deal_id: string;
  employee_id: string;
  role: string;
  side?: string;
  company_id?: string;
  created_at?: Date | string;
}

export interface DealCommission {
  id: string;
  deal_id: string;
  commission_type?: string;
  amount?: number;
  percentage?: number;
  commission_seller_plan?: number;
  commission_buyer_plan?: number;
  commission_seller_fact?: number;
  commission_buyer_fact?: number;
  agent_percent_seller?: number;
  agent_percent_buyer?: number;
  rop_percent?: number;
  mortgage_expense?: number;
  other_expenses?: number;
  employee_id?: string;
  company_id?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface DealDocument {
  id: string;
  deal_id: string;
  document_type?: string;
  file_name?: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  uploaded_by?: string;
  notes?: string;
  company_id?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  user_id?: string;
  activity_type: string;
  description?: string;
  performed_by?: string;
  metadata?: any;
  company_id?: string;
  created_at?: Date | string;
}

export interface CommissionRule {
  id: string;
  document_type?: string;
  property_type?: string;
  agent_percent_default?: number;
  rop_percent_default?: number;
  priority?: number;
  is_active?: boolean;
  position_id?: string;
  rule_type?: string;
  percentage?: number;
  company_id?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface Payment {
  id: string;
  deal_id: string;
  amount: number;
  payment_date?: string;
  payment_type?: string;
  payment_method?: string;
  reference_number?: string;
  payer_name?: string;
  notes?: string;
  recorded_by?: string;
  description?: string;
  company_id?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface DealTableRow {
  id: string;
  month: number;
  year: number;
  deposit_date?: string;
  deal_date?: string;
  payment_date?: string;
  property_name: string;
  document_type: string;
  document_link?: string;
  seller?: string;
  buyer?: string;
  service?: string;
  information?: string;
  agent_name?: string;
  mop_name?: string;
  rop_name?: string;
  team_id?: string;
  branch_id?: string;
  comment?: string;
  commission_seller_plan?: number;
  commission_buyer_plan?: number;
  commission_seller_fact?: number;
  commission_buyer_fact?: number;
  agent_percent?: number;
  rop_percent?: number;
  agent_percent_seller?: number;
  agent_percent_buyer?: number;
  mop_percent?: number;
  agent_manual_bonus?: number;
  rop_manual_bonus?: number;
  other_expenses?: number;
  mortgage_deduction?: number;
  payout_date?: string;
  payout_mop_note?: string;
  payout_rop_note?: string;
  commission_total_fact?: number;
  agent_income?: number;
  rop_payout?: number;
  mop_revenue?: number;
  company_revenue?: number;
  plan_completion?: number;
  marginality?: number;
  status?: string;
  rejection_reason?: string;
  deal_amount?: number;
  mortgage?: number;
  agent_id?: string;
  mop_id?: string;
  rop_id?: string;
  company_id?: string;
  created_by?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DealFilters {
  status?: string;
  period_month?: number;
  period_year?: number;
  employee_id?: string;
  team_id?: string;
  created_by?: string;
}

export interface DealListResult {
  deals: Deal[];
  pagination: PaginationResult;
}
