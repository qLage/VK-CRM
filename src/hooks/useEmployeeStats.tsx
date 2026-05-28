import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

interface EmployeeStats {
  deals: number;
  deposits: number;
  listings: number;
  meetings: number;
  showings: number;
  custom_deals?: number;
  custom_objects?: number;
  custom_revenue?: number;
  mop_revenue?: number;
  rop_payout?: number;
  mortgage_deduction?: number;
  other_expenses?: number;
}

export function useEmployeeStats(employeeId: string, startDate?: string, endDate?: string) {
  const { data: stats, isLoading: loading, error } = useQuery({
    queryKey: ['employee-stats', employeeId, startDate, endDate],
    queryFn: async () => {
      let url = `/employees/${employeeId}/stats`;
      const params = new URLSearchParams();
      if (startDate) params.append('start', startDate);
      if (endDate) params.append('end', endDate);
      
      const queryStr = params.toString();
      if (queryStr) url += `?${queryStr}`;

      const { data, error } = await localAPI.request<EmployeeStats>(url);
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    stats,
    loading,
    error,
  };
}
