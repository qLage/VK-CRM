import { PerformanceStatsRow } from '@/components/employee-profile/PerformanceStatsRow';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProfileHeader } from '@/components/employee-profile/ProfileHeader';
import { QuarterlyStats } from '@/components/employee-profile/QuarterlyStats';
import { DailyActivity } from '@/components/employee-profile/DailyActivity';
import { DailyCallsWidget } from '@/components/employee-profile/DailyCallsWidget';
import { EfficiencyAnalytics } from '@/components/employee-profile/EfficiencyAnalytics';
import { ActivityFeed } from '@/components/employee-profile/ActivityFeed';
import { TeamComparison } from '@/components/employee-profile/TeamComparison';

import { TeamPerformanceOverview } from '@/components/employee-profile/TeamPerformanceOverview';
import { useEmployees } from '@/hooks/useEmployees';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { startOfMonth, startOfQuarter, isWithinInterval, endOfDay } from 'date-fns';
import { getPositionName, isRatingParticipant, shouldHidePersonalRevenue, shouldHideRatingPlace } from '@/lib/positions';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const now = new Date();
  const quarterStart = startOfQuarter(now).toISOString();
  const quarterEnd = endOfDay(now).toISOString(); // Use end of day for the end bound
  
  const { employees, loading } = useEmployees(quarterStart, quarterEnd);

  const employee = employees.find(e => e.id === id);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['employee-profile-stats', id],
    queryFn: async () => {
      if (!id || !employee) return null;

      const posName = getPositionName(employee);
      const isParticipant = isRatingParticipant(posName);

      // Get leaderboard data
      const now = new Date();
      const periodStart = startOfQuarter(now).toISOString();
      const { data: leaderboardData } = await localAPI.request(`/kpi/leaderboard?start=${periodStart}&end=${now.toISOString()}`);
      const entry = (leaderboardData || []).find((p: any) => p.userId === id);
      
      const planPercent = Math.round(entry?.planCompletion || 0);
      const revenue = entry?.revenue || 0;
      const rating = entry?.rating || 0;

      // Calculate rank
      const participants = (leaderboardData || []).filter((p: any) => isRatingParticipant(getPositionName(p)));
      const sorted = [...participants].sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
      const rank = sorted.findIndex((p: any) => p.userId === id) + 1;

      // Get deals count from reports
      const { data: reportsData } = await localAPI.request('/reports');
      const reports = Array.isArray(reportsData?.data) ? reportsData.data : (Array.isArray(reportsData) ? reportsData : []);
      const approved = reports.filter((r: any) => {
        const isApproved = r.status === 'approved' && r.user_id === id;
        if (!isApproved) return false;
        const itemDate = new Date(r.created_at || r.data?.date);
        return isWithinInterval(itemDate, { start: new Date(periodStart), end: endOfDay(now) });
      });
      const totalDeals = approved.filter((r: any) => ['deal', 'sale'].includes(r.report_type || r.type || '')).length;
      const pendingDeals = reports.filter((r: any) => r.user_id === id && r.status === 'pending').length;

      // Get Dual KPI data if user is management
      let dualKpi = null;
      const isManagementPos = ['моп', 'роп', 'директор', 'коммерческ'].some(p => posName.toLowerCase().includes(p));
      if (isManagementPos) {
        try {
          const { data: dualKpiData } = await localAPI.request<any>(`/kpi/user/${id}/dual-stats?period=quarter`);
          dualKpi = dualKpiData;
        } catch (e) {
          console.error('Error fetching dual KPI for employee:', e);
        }
      }

      return {
        totalRevenue: revenue,
        revenue,
        rank: isParticipant ? rank : null,
        planPercent,
        totalDeals,
        pendingDeals,
        rating,
        dualKpi,
        growth: 0 // Mock growth as it's not easily available per employee yet
      };
    },
    enabled: !!id && !!employee,
  });

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4" role="status" aria-live="polite" aria-label="Загрузка профиля сотрудника">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" aria-hidden="true"></div>
            <p className="text-sm text-white/70 font-bold uppercase tracking-wider">Загрузка профиля...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!employee) {
    return <Navigate to="/employees" replace />;
  }

  const myPosition = getPositionName(employee);
  const hideRevenue = shouldHidePersonalRevenue(myPosition);
  const hideRating = shouldHideRatingPlace(myPosition);
  const isParticipant = isRatingParticipant(myPosition);

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in max-w-[1600px] w-full mx-auto pb-16 md:pb-20 pt-4 md:pt-6 px-4 sm:px-6 md:px-8 overflow-x-hidden">
        {/* Profile Header */}
        <ProfileHeader employee={employee} />

        {/* Performance Stats Unified Row */}
        <PerformanceStatsRow 
          stats={stats} 
          loading={statsLoading} 
          hideRevenue={hideRevenue} 
          hideRating={hideRating} 
        />

        {/* Quarterly Stats & Daily Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 min-w-0 items-stretch">
          <div className="min-w-0 h-full">
            <QuarterlyStats employee={employee} />
          </div>
          <div className="min-w-0 h-full">
            <DailyActivity employee={employee} />
          </div>
        </div>

        <DailyCallsWidget employeeId={employee.id} />

        {/* Management Analytics - show for management positions (ROP/MOP/Director/Commercial) */}
        {(() => {
          const posName = String((employee as any)?.position?.name || (employee as any)?.position_name || '').toLowerCase();
          const isManagementPosition = posName.includes('роп') || posName.includes('моп') || posName.includes('директор') || posName.includes('коммерческ');
          return isManagementPosition;
        })() && (
          <TeamPerformanceOverview employee={employee} allEmployees={employees} />
        )}

        {/* Efficiency Analytics */}
        <EfficiencyAnalytics employee={employee} />



        {/* Activity Feed & Team Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 min-w-0 items-stretch">
          <div className="min-w-0 h-full">
            <ActivityFeed employee={employee} />
          </div>
          <div className="min-w-0 h-full">
            <TeamComparison employee={employee} allEmployees={employees} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
