import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

export interface ActivityFeedItem {
  id: string;
  type: 'deal' | 'object' | 'meeting' | 'call' | 'email' | 'task' | 'achievement';
  title: string;
  description: string;
  timestamp: string;
  metadata: Record<string, any> | null;
}

export function useEmployeeActivityFeed(employeeId: string | undefined, limit: number = 15) {
  const { data: activities, isLoading, error, refetch } = useQuery({
    queryKey: ['employee-activity-feed', employeeId, limit],
    queryFn: async () => {
      if (!employeeId) {
        throw new Error('Employee ID is required');
      }

      const { data, error } = await localAPI.request(`/employees/${employeeId}/activity-feed?limit=${limit}`);

      if (error) throw error;

      return data as ActivityFeedItem[];
    },
    enabled: !!employeeId,
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  return {
    activities,
    isLoading,
    error,
    refetch,
  };
}
