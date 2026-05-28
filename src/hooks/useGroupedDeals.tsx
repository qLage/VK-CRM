import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';

interface DealsFilters {
  year?: number;
  month?: number | null;
}

interface GroupData {
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
  total_mop_revenue?: string | number;
  total_rop_payout?: string | number;
  total_mortgage_deduction?: string | number;
  total_other_expenses?: string | number;
}

interface Totals {
  deal_count: number;
  total_commission_seller_plan: number;
  total_commission_buyer_plan: number;
  total_commission_seller_fact: number;
  total_commission_buyer_fact: number;
  total_commission_fact: number;
  total_agent_income: number;
  total_company_revenue: number;
}

interface GroupedDealsResponse {
  groups: GroupData[];
  totals: Totals;
}

/**
 * Hook for fetching grouped deals based on user role
 * - МОП (50+): Groups by employee (team view)
 * - РОП/Commercial Director (90+): Groups by team (branch view) or by branch (company view)
 */
export function useGroupedDeals(filters: DealsFilters = {}) {
  const { user, accessLevel } = useAuth();

  // Determine endpoint based on access level (position-based)
  const getEndpoint = () => {
    // Director level (90+): company-wide view (grouped by branch)
    if (accessLevel >= 90) {
      return '/deal-table/company-deals-grouped';
    }

    // МОП level (50+): team view (grouped by employee)
    if (accessLevel >= 50) {
      return '/deal-table/team-deals-grouped';
    }

    // Team lead level (30-49): team view
    if (accessLevel >= 30) {
      return '/deal-table/team-deals-grouped';
    }

    // Individual contributors don't have grouped view
    return null;
  };

  const getLevel = () => {
    if (accessLevel >= 90) return 'company';
    if (accessLevel >= 50) return 'team';
    if (accessLevel >= 30) return 'team';
    return null;
  };

  const endpoint = getEndpoint();
  const level = getLevel();

  const query = useQuery<GroupedDealsResponse>({
    queryKey: ['grouped-deals', accessLevel, user?.role, filters],
    queryFn: async () => {
      if (!endpoint) {
        throw new Error('No grouped endpoint for this role');
      }

      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year.toString());
      if (filters.month) params.append('month', filters.month.toString());

      const { data, error } = await localAPI.request(`${endpoint}?${params}`);
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!endpoint,
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  return {
    groups: query.data?.groups || [],
    totals: query.data?.totals || {
      deal_count: 0,
      total_commission_seller_plan: 0,
      total_commission_buyer_plan: 0,
      total_commission_seller_fact: 0,
      total_commission_buyer_fact: 0,
      total_commission_fact: 0,
      total_agent_income: 0,
      total_company_revenue: 0
    },
    level,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch
  };
}
