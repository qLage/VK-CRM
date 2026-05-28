import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

function toInt(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function extractRows(data: any): any[] {
  if (Array.isArray(data?.groups)) return data.groups;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data)) return data;
  return [];
}

function withCurrentYear(endpoint: string): string {
  const year = new Date().getFullYear();
  const joiner = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${joiner}year=${year}`;
}

export function useServiceRequestsPendingCount(enabled: boolean) {
  return useQuery({
    queryKey: ['service-requests-pending-count'],
    queryFn: async () => {
      const [{ data: srData }, { data: reportsData }] = await Promise.all([
        localAPI.request('/service-requests?limit=500'),
        localAPI.request('/reports?limit=300'),
      ]);

      const serviceRequests = extractRows(srData);
      const reports = extractRows(reportsData).filter((r: any) => ['plan', 'daily'].includes(r?.type));

      const pendingService = serviceRequests.filter((r: any) => r?.status === 'pending').length;
      const pendingReports = reports.filter((r: any) => r?.status === 'pending').length;

      return pendingService + pendingReports;
    },
    enabled,
    staleTime: 60000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchInterval: enabled ? 15000 : false,
  });
}

function getDealsTotalsEndpoint(accessLevel: number, hasTeam: boolean): string {
  if (accessLevel >= 90) return '/deal-table/company-deals-totals';
  if (accessLevel >= 50 && hasTeam) return '/deal-table/team-deals-totals';
  return '/deal-table/my-deals-totals';
}

function getDealsGroupedEndpoint(accessLevel: number, hasTeam: boolean): string {
  if (accessLevel >= 90) return '/deal-table/company-deals-grouped';
  if (accessLevel >= 50 && hasTeam) return '/deal-table/team-deals-grouped';
  return '/deal-table/my-deals';
}

export function useDealsPendingCount(enabled: boolean, accessLevel: number, hasTeam: boolean) {
  return useQuery({
    queryKey: ['deals-pending-count', accessLevel, hasTeam],
    queryFn: async () => {
      const endpoint = getDealsTotalsEndpoint(accessLevel, hasTeam);
      const { data } = await localAPI.request(withCurrentYear(endpoint));
      const payload = data || {};

      const directPending = toInt(
        payload.pending_count ??
        payload.pending_deals_count ??
        payload.pending_deals ??
        payload.pending
      );

      if (directPending > 0) return directPending;

      // Fallback: derive pending from grouped source (same as deals screen widgets).
      const groupedEndpoint = getDealsGroupedEndpoint(accessLevel, hasTeam);
      const { data: groupedData } = await localAPI.request(withCurrentYear(groupedEndpoint));
      const rows = extractRows(groupedData);
      if (rows.length > 0) {
        return rows.reduce((sum, row) => sum + toInt(row?.pending_count), 0);
      }

      // Last fallback for personal endpoint shape.
      const personalRows = extractRows(payload);
      return personalRows.filter((d: any) => d?.status === 'pending').length;
    },
    enabled,
    staleTime: 60000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchInterval: enabled ? 15000 : false,
  });
}
