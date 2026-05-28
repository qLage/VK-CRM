import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

export interface MonthlyTrend {
  month: string;
  efficiency: number;
  deals: number;
  revenue: number;
  mortgage?: number;
}

export function useEmployeeMonthlyTrends(employeeId: string | undefined, months: number = 12) {
  const { data: trends, isLoading, error, refetch } = useQuery({
    queryKey: ['employee-monthly-trends', employeeId, months],
    queryFn: async () => {
      if (!employeeId) {
        throw new Error('Employee ID is required');
      }

      const { data, error } = await localAPI.request(`/employees/${employeeId}/monthly-trends?months=${months}`);

      if (error) throw error;

      return data as MonthlyTrend[];
    },
    enabled: !!employeeId,
    staleTime: 60000, // 60 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  return {
    trends,
    isLoading,
    error,
    refetch,
  };
}
