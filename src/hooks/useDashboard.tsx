import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAttendance } from './useAttendance';

interface DashboardStats {
  totalPoints: number;
  totalReports: number;
  showings: number;
  deals: number;
  rank: number;
  totalUsers: number;
  attendanceDays: number;
  attendancePercentage: number;
}

export function useDashboard() {
  const { user } = useAuth();
  const { todayRecord, loading: loadingAttendance } = useAttendance();

  const { data: kpiStats, isLoading: loadingKpi } = useQuery({
    queryKey: ['dashboard-kpi-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await localAPI.getDashboardStats('month');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  // Main dashboard stats mapped from backend KPI
  const stats = useMemo((): DashboardStats => {
    if (!kpiStats || !user?.id) {
      return {
        totalPoints: 0,
        totalReports: 0,
        showings: 0,
        deals: 0,
        rank: 0,
        totalUsers: 0,
        attendanceDays: 0,
        attendancePercentage: 0,
      };
    }

    return {
      totalPoints: kpiStats.totalPoints || 0,
      totalReports: kpiStats.totalReports || 0,
      showings: kpiStats.showings || 0,
      deals: kpiStats.deals || 0,
      rank: kpiStats.rating || 0,
      totalUsers: kpiStats.totalUsers || 0,
      attendanceDays: kpiStats.attendanceDays || 0,
      attendancePercentage: kpiStats.attendancePercentage || 0,
    };
  }, [user?.id, kpiStats]);

  return {
    stats,
    isLoading: loadingKpi || loadingAttendance,
    todayRecord
  };
}
