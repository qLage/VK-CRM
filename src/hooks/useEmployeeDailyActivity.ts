import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

export type DailyActivityHeatmap = number[][];

export function useEmployeeDailyActivity(employeeId: string | undefined, days: number = 7) {
  const { data: heatmapData, isLoading, error, refetch } = useQuery({
    queryKey: ['employee-daily-activity', employeeId, days],
    queryFn: async () => {
      if (!employeeId) {
        throw new Error('Employee ID is required');
      }

      const { data, error } = await localAPI.request(`/employees/${employeeId}/daily-activity?days=${days}`);

      if (error) throw error;

      return data as DailyActivityHeatmap;
    },
    enabled: !!employeeId,
    staleTime: 60000, // 60 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  return {
    heatmapData,
    isLoading,
    error,
    refetch,
  };
}
