import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

interface Branch {
  id: string;
  name: string;
  city?: string;
  region?: string;
}

export function useBranches() {
  const { data: branches = [], isLoading, error } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/branches', {
        method: 'GET',
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch branches');
      }

      // Transform API response to match BranchFilter interface
      const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      return items.map((branch: any) => ({
        id: branch.id,
        name: branch.name || `Филиал ${branch.id}`,
        city: branch.city,
        region: branch.region,
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  return { branches, isLoading, error };
}
