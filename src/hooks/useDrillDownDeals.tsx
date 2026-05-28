import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

export interface DrillDownFilters {
  year?: number;
  month?: number | null;
  branch_id?: string;
  team_id?: string;
  agent_name?: string;
  agent_id?: string;
  dealStatus?: string;
  minAmount?: number;
  maxAmount?: number;
  isMyDealsOnly?: boolean;
}

export interface GroupData {
  agent_name?: string;
  team_name?: string;
  team_id?: string;
  branch_name?: string;
  branch_id?: string;
  deal_count: string | number;
  total_commission_seller_plan: string | number;
  total_commission_buyer_plan: string | number;
  total_commission_seller_fact: string | number;
  total_commission_buyer_fact: string | number;
  total_commission_fact: string | number;
  total_agent_income: string | number;
  total_company_revenue: string | number;
  pending_count?: string | number;
  total_mop_revenue?: string | number;
  total_rop_payout?: string | number;
  total_mortgage_deduction?: string | number;
  total_other_expenses?: string | number;
}

export interface Totals {
  deal_count: number;
  total_commission_seller_plan: number;
  total_commission_buyer_plan: number;
  total_commission_seller_fact: number;
  total_commission_buyer_fact: number;
  total_commission_fact: number;
  total_agent_income: number;
  total_mop_revenue: number;
  total_rop_payout: number;
  total_mortgage_deduction: number;
  total_other_expenses: number;
  total_company_revenue: number;
}

interface GroupedDealsResponse {
  groups: GroupData[];
  totals: Totals;
}

type DrillDownLevel = 'company' | 'branch' | 'team' | 'employee';

/**
 * Hook for drill-down navigation through hierarchy
 * Supports fetching data at any level with specific filters
 * Note: 'branch' level requires access_level >= 90 (РОП/Commercial Director)
 */
export function useDrillDownDeals(
  level: DrillDownLevel,
  filters: DrillDownFilters = {}
) {
  // Determine endpoint based on level
  const getEndpoint = () => {
    switch (level) {
      case 'company':
        return '/deal-table/company-deals-grouped';
      case 'branch':
        return '/deal-table/branch-deals-grouped'; // Requires access_level >= 90
      case 'team':
        return '/deal-table/team-deals-grouped'; // Requires access_level >= 50
      case 'employee':
        return '/deal-table/my-deals'; // Individual deals
      default:
        return null;
    }
  };

  const getTotalsEndpoint = () => {
    switch (level) {
      case 'company':
        return '/deal-table/company-deals-totals';
      case 'branch':
        return '/deal-table/branch-deals-totals';
      case 'team':
        return '/deal-table/team-deals-totals';
      case 'employee':
        return '/deal-table/my-deals-totals';
      default:
        return null;
    }
  };

  const endpoint = getEndpoint();
  const totalsEndpoint = getTotalsEndpoint();

  // Fetch grouped data (for company/branch/team levels)
  const groupedQuery = useQuery<GroupedDealsResponse>({
    queryKey: ['drill-down-grouped', level, filters],
    queryFn: async () => {
      if (!endpoint) {
        throw new Error('Invalid level');
      }

      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year.toString());
      if (filters.month) params.append('month', filters.month.toString());
      if (filters.branch_id) params.append('branch_id', filters.branch_id);
      if (filters.team_id) params.append('team_id', filters.team_id);
      if (filters.dealStatus) params.append('dealStatus', filters.dealStatus);
      if (filters.minAmount !== undefined) params.append('minAmount', filters.minAmount.toString());
      if (filters.maxAmount !== undefined) params.append('maxAmount', filters.maxAmount.toString());
      if (filters.isMyDealsOnly !== undefined) params.append('isMyDealsOnly', filters.isMyDealsOnly.toString());

      const { data, error } = await localAPI.request(`${endpoint}?${params}`);
      if (error) throw error;
      return data;
    },
    enabled: level !== 'employee' && !!endpoint,
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  // Fetch detailed deals (for employee level)
  const detailedQuery = useQuery({
    queryKey: ['drill-down-detailed', level, { ...filters, compact: true }],
    queryFn: async () => {
      if (!endpoint) {
        throw new Error('Invalid level');
      }

      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year.toString());
      if (filters.month) params.append('month', filters.month.toString());
      if (filters.agent_id) params.append('agent_id', filters.agent_id);
      if (filters.agent_name) params.append('agent_name', filters.agent_name);
      if (filters.dealStatus) params.append('dealStatus', filters.dealStatus);
      if (filters.minAmount !== undefined) params.append('minAmount', filters.minAmount.toString());
      if (filters.maxAmount !== undefined) params.append('maxAmount', filters.maxAmount.toString());
      if (filters.isMyDealsOnly !== undefined) params.append('isMyDealsOnly', filters.isMyDealsOnly.toString());

      // Drill-down detailed list mostly needs numeric fields + identifiers; keep it compact
      params.append('compact', '1');

      const { data, error } = await localAPI.request(`${endpoint}?${params}`);
      if (error) throw error;
      return data;
    },
    enabled: level === 'employee' && !!endpoint,
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  // Fetch totals
  const totalsQuery = useQuery({
    queryKey: ['drill-down-totals', level, filters],
    queryFn: async () => {
      if (!totalsEndpoint) {
        throw new Error('Invalid level');
      }

      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year.toString());
      if (filters.month) params.append('month', filters.month.toString());
      if (filters.branch_id) params.append('branch_id', filters.branch_id);
      if (filters.team_id) params.append('team_id', filters.team_id);
      if (filters.agent_id) params.append('agent_id', filters.agent_id);
      if (filters.agent_name) params.append('agent_name', filters.agent_name);
      if (filters.dealStatus) params.append('dealStatus', filters.dealStatus);
      if (filters.minAmount !== undefined) params.append('minAmount', filters.minAmount.toString());
      if (filters.maxAmount !== undefined) params.append('maxAmount', filters.maxAmount.toString());
      if (filters.isMyDealsOnly !== undefined) params.append('isMyDealsOnly', filters.isMyDealsOnly.toString());

      const { data, error } = await localAPI.request(`${totalsEndpoint}?${params}`);
      if (error) throw error;
      return data;
    },
    enabled: !!totalsEndpoint,
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  const isGroupedLevel = level !== 'employee';

  return {
    // Grouped data
    groups: isGroupedLevel ? (groupedQuery.data?.groups || []) : [],
    // Detailed data
    deals: !isGroupedLevel ? (detailedQuery.data?.rows || []) : [],
    // Totals
    totals: totalsQuery.data || {
      deal_count: 0,
      total_commission_seller_plan: 0,
      total_commission_buyer_plan: 0,
      total_commission_seller_fact: 0,
      total_commission_buyer_fact: 0,
      total_commission_fact: 0,
      total_agent_income: 0,
      total_mop_revenue: 0,
      total_rop_payout: 0,
      total_mortgage_deduction: 0,
      total_other_expenses: 0,
      total_company_revenue: 0,
      avg_check: 0
    },
    level,
    isLoading: isGroupedLevel
      ? (groupedQuery.isLoading || totalsQuery.isLoading)
      : (detailedQuery.isLoading || totalsQuery.isLoading),
    isError: isGroupedLevel
      ? (groupedQuery.isError || totalsQuery.isError)
      : (detailedQuery.isError || totalsQuery.isError),
    refetch: () => {
      if (isGroupedLevel) {
        groupedQuery.refetch();
      } else {
        detailedQuery.refetch();
      }
      totalsQuery.refetch();
    }
  };
}
