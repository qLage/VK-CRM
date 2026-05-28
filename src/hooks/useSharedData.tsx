import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

/**
 * Centralized data fetching to prevent duplicate requests
 * All components should use these hooks instead of fetching directly
 */

// Shared branches query - used by Analytics, Employees, Planning, Rating, Team
export function useSharedData() {
  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await localAPI.request('/branches');
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 300000, // 5 min
    gcTime: 600000, // 10 min
  });

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      // Default backend limit is 50; without a higher limit, many teams (and correct leader_id) are missing from cache.
      const { data } = await localAPI.request('/teams?limit=1000');
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 300000, // 5 min
    gcTime: 600000, // 10 min
  });

  const positionsQuery = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const { data } = await localAPI.request('/positions');
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 1800000, // 30 min
    gcTime: 3600000, // 60 min
  });

  const isLoading = branchesQuery.isLoading || teamsQuery.isLoading || positionsQuery.isLoading;
  const isError = branchesQuery.isError || teamsQuery.isError || positionsQuery.isError;

  const refetch = () => {
    branchesQuery.refetch();
    teamsQuery.refetch();
    positionsQuery.refetch();
  };

  const branchesData = branchesQuery.data;
  const teamsData = teamsQuery.data;
  const positionsData = positionsQuery.data;

  return {
    branches: Array.isArray(branchesData) ? branchesData : (Array.isArray(branchesData?.data) ? branchesData.data : []),
    teams: Array.isArray(teamsData) ? teamsData : (Array.isArray(teamsData?.data) ? teamsData.data : []),
    positions: Array.isArray(positionsData) ? positionsData : (Array.isArray(positionsData?.data) ? positionsData.data : []),
    isLoading,
    isError,
    refetch,
  };
}

// Shared reports query - used by Analytics, Dashboard, Reports page
export function useReportsData(startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ['shared-reports', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let url = '/reports?limit=200';
      if (startDate) url += `&start=${startDate.toISOString()}`;
      if (endDate) url += `&end=${endDate.toISOString()}`;
      
      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 300000, // 5 minutes
    gcTime: 900000, // 15 minutes
    refetchOnWindowFocus: false,
  });
}

// Shared service requests query - used by Analytics, ServiceRequests page
export function useServiceRequestsData(startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ['shared-service-requests', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let url = '/service-requests?limit=500';
      if (startDate) url += `&start=${startDate.toISOString()}`;
      if (endDate) url += `&end=${endDate.toISOString()}`;

      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
  });
}

// Shared employees query - used by multiple pages
export function useEmployeesData() {
  return useQuery({
    queryKey: ['shared-employees'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/employees');
      if (error) throw error;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 120000, // 2 minutes
    gcTime: 600000, // 10 minutes
  });
}

// Shared attendance query - used by Dashboard, Team page, Analytics
export function useAttendanceData() {
  return useQuery({
    queryKey: ['shared-attendance'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/attendance');
      if (error) throw error;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
  });
}

// Combined approved data for analytics (reports + service requests, approved only)
export function useApprovedData(startDate?: Date, endDate?: Date) {
  const { data: reports = [], isLoading: loadingReports } = useReportsData(startDate, endDate);
  const { data: requests = [], isLoading: loadingRequests } = useServiceRequestsData(startDate, endDate);

  return {
    data: [...reports, ...requests].filter((r: any) => r.status === 'approved'),
    isLoading: loadingReports || loadingRequests,
  };
}

// =====================================
// INFINITE / PAGINATED HOOKS (NEW PHASE 2)
// Use these in lists and tables
// =====================================

export function usePaginatedReports() {
  return useInfiniteQuery({
    queryKey: ['paginated-reports'],
    queryFn: async ({ pageParam = null }) => {
      const url = pageParam
        ? `/reports?limit=50&cursor=${encodeURIComponent(pageParam as string)}`
        : `/reports?limit=50`;
      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      return data; // { data: [...], nextCursor: '...', hasNextPage: true }
    },
    getNextPageParam: (lastPage: any) => lastPage?.hasNextPage ? lastPage.nextCursor : undefined,
    initialPageParam: null,
  });
}

export function usePaginatedServiceRequests(options?: { teamFilter?: boolean }) {
  const { teamFilter } = options || {};

  return useInfiniteQuery({
    queryKey: ['paginated-service-requests', { teamFilter }],
    queryFn: async ({ pageParam = null }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) {
        params.set('cursor', encodeURIComponent(pageParam as string));
      }
      if (teamFilter) {
        params.set('teamId', 'true');
      }
      const url = `/service-requests?${params.toString()}`;
      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage: any) => lastPage?.hasNextPage ? lastPage.nextCursor : undefined,
    initialPageParam: null,
  });
}
