import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';

export type DealViewMode = 'personal' | 'team' | 'branch' | 'company';

interface DealsFilters {
  year?: number;
  month?: number | null;
  page?: number;
  limit?: number;
  viewMode?: DealViewMode;
}

/**
 * Smart hook that fetches deals based on user role and selected view mode
 * - Realtor: Personal deals only
 * - МОП (50+): Can toggle between Personal and Team deals
 * - РОП/Director (90+): Can view Personal, Team, or Branch deals
 */
export function useRoleBasedDeals(filters: DealsFilters = {}) {
  const { user, accessLevel, profile } = useAuth();
  const viewMode = filters.viewMode || 'personal';

  // Check if user is part of a team/branch
  const hasTeam = !!(profile?.team_id || user?.team_id);
  const hasBranch = !!(profile?.branch_id || user?.branch_id);

  // Determine endpoint based on view mode and access level
  const getEndpoint = () => {
    switch (viewMode) {
      case 'company':
        if (accessLevel >= 90) return '/deal-table/company-deals';
        break;
      case 'branch':
        if (accessLevel >= 90) return '/deal-table/branch-deals';
        break;
      case 'team':
        if (accessLevel >= 50) return '/deal-table/team-deals';
        break;
      case 'personal':
      default:
        return '/deal-table/my-deals';
    }
    // Fallback to personal if access denied
    return '/deal-table/my-deals';
  };

  const getTotalsEndpoint = () => {
    switch (viewMode) {
      case 'company':
        if (accessLevel >= 90) return '/deal-table/company-deals-totals';
        break;
      case 'branch':
        if (accessLevel >= 90) return '/deal-table/branch-deals-totals';
        break;
      case 'team':
        if (accessLevel >= 50) return '/deal-table/team-deals-totals';
        break;
      case 'personal':
      default:
        return '/deal-table/my-deals-totals';
    }
    return '/deal-table/my-deals-totals';
  };

  // Fetch deals
  const dealsQuery = useQuery({
    queryKey: ['role-based-deals', accessLevel, viewMode, { ...filters, compact: true }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year.toString());
      if (filters.month) params.append('month', filters.month.toString());
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());

      // DealTable only needs a subset of columns; ask backend for compact rows
      params.append('compact', '1');

      const endpoint = getEndpoint();
      const { data, error } = await localAPI.request(`${endpoint}?${params}`);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  // Fetch totals
  const totalsQuery = useQuery({
    queryKey: ['role-based-totals', accessLevel, viewMode, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year.toString());
      if (filters.month) params.append('month', filters.month.toString());

      const endpoint = getTotalsEndpoint();
      const { data, error } = await localAPI.request(`${endpoint}?${params}`);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  // Get display title based on view mode
  const getTitle = () => {
    switch (viewMode) {
      case 'company':
        return 'Сделки компании';
      case 'branch':
        return 'Сделки филиала';
      case 'team':
        return 'Сделки команды';
      case 'personal':
      default:
        return 'Мои сделки';
    }
  };

  // Get available view modes based on access level AND team/branch membership
  const getAvailableViewModes = (): DealViewMode[] => {
    const modes: DealViewMode[] = ['personal'];

    // Only show team view if user has access AND is part of a team
    if (accessLevel >= 50 && hasTeam) {
      modes.push('team');
    }

    // Only show branch view if user has access AND is part of a branch
    if (accessLevel >= 90 && hasBranch) {
      modes.push('branch');
    }

    return modes;
  };

  return {
    deals: dealsQuery.data?.rows || [],
    pagination: dealsQuery.data?.pagination,
    totals: totalsQuery.data,
    isLoading: dealsQuery.isLoading || totalsQuery.isLoading,
    isError: dealsQuery.isError || totalsQuery.isError,
    error: dealsQuery.error || totalsQuery.error,
    title: getTitle(),
    availableViewModes: getAvailableViewModes(),
    currentViewMode: viewMode,
    refetch: () => {
      dealsQuery.refetch();
      totalsQuery.refetch();
    }
  };
}
