import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import type { DrillDownFilters } from '@/hooks/useDrillDownDeals';

export type DealForecastScope = DrillDownFilters & { year?: number; month?: number | null };

type DrillLevel = 'company' | 'branch' | 'team' | 'employee';

/**
 * Loads deal rows for «Прогноз» calculation (same scope as current drill-down / filters).
 * Directors: `/my-deals` (+ company-wide or branch/team drill filters).
 * МОП при уровне «команда» и access &lt; 90: `/team-deals`.
 */
export function useDealForecastQuery(
  enabled: boolean,
  level: DrillLevel,
  accessLevel: number,
  filters: DealForecastScope
) {
  return useQuery({
    queryKey: ['deal-forecast-rows', level, accessLevel, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.year) params.set('year', String(filters.year));
      if (filters.month) params.set('month', String(filters.month));
      if (filters.branch_id) params.set('branch_id', filters.branch_id);
      if (filters.team_id) params.set('team_id', filters.team_id);
      if (filters.agent_id) params.set('agent_id', filters.agent_id);
      if (filters.agent_name) params.set('agent_name', filters.agent_name);
      if (filters.dealStatus && filters.dealStatus !== 'all') {
        params.set('dealStatus', filters.dealStatus);
      }
      if (filters.minAmount !== undefined) params.set('minAmount', String(filters.minAmount));
      if (filters.maxAmount !== undefined) params.set('maxAmount', String(filters.maxAmount));
      if (filters.isMyDealsOnly !== undefined) {
        params.set('isMyDealsOnly', String(filters.isMyDealsOnly));
      }
      params.set('limit', '20000');
      params.set('page', '1');

      const teamScope = level === 'team' && accessLevel < 90;
      const path = teamScope ? '/deal-table/team-deals' : '/deal-table/my-deals';

      const { data, error } = await localAPI.request(`${path}?${params.toString()}`);
      if (error) throw error;
      const rows = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
      return rows as Record<string, unknown>[];
    },
    enabled,
    staleTime: 120000,
    gcTime: 600000,
    refetchOnWindowFocus: false,
  });
}
