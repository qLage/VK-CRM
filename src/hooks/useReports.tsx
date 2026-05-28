import { useMemo } from 'react';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useReportsData } from './useSharedData';

interface Report {
  id: string;
  user_id: string;
  type: string;
  title: string;
  content: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const reportTypes = [
  { id: 'deposit', name: 'Задаток', icon: 'Wallet' },
  { id: 'deal', name: 'Сделка', icon: 'Handshake' },
  { id: 'object', name: 'Взятие объекта', icon: 'Building' },
  { id: 'showing', name: 'Показ', icon: 'Eye' },
  { id: 'sale', name: 'Продажа', icon: 'TrendingUp' },
  { id: 'purchase', name: 'Покупка', icon: 'ShoppingCart' },
  { id: 'meeting', name: 'Встречи в офисе', icon: 'Users' },
  { id: 'booking', name: 'Новостройки', icon: 'Building2' },
] as const;

export function useReports() {
  const { user, isManager } = useAuth();
  const queryClient = useQueryClient();
  const { data: reports = [], isLoading: loading } = useReportsData();

  const createReport = async (
    reportType: string,
    title: string,
    content: Record<string, unknown>
  ) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { error } = await localAPI.request('/reports', {
        method: 'POST',
        body: {
          type: reportType,
          title,
          content,
        },
      });

      if (error) throw error;

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
      queryClient.invalidateQueries({ queryKey: ['paginated-reports'] });
      queryClient.invalidateQueries({ queryKey: ['shared-attendance'] });
      // Comprehensive invalidation
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      toast.success('Отчёт создан');
      return { error: null };
    } catch (error) {
      console.error('Error creating report:', error);
      toast.error('Ошибка при создании отчёта');
      return { error: error as Error };
    }
  };

  const updateReport = async (
    reportId: string,
    updates: { title?: string; content?: Record<string, unknown> }
  ) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { error } = await localAPI.request(`/reports/${reportId}`, {
        method: 'PATCH',
        body: updates,
      });

      if (error) throw error;

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
      queryClient.invalidateQueries({ queryKey: ['paginated-reports'] });
      // Comprehensive invalidation
      queryClient.invalidateQueries({ queryKey: ['shared-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      toast.success('Служебка обновлена');
      return { error: null };
    } catch (error) {
      console.error('Error updating report:', error);
      toast.error('Ошибка при обновлении');
      return { error: error as Error };
    }
  };

  const approveReport = async (reportId: string) => {
    if (!isManager || !user) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request(`/reports/${reportId}/status`, {
        method: 'PATCH',
        body: { status: 'approved' },
      });

      if (error) throw error;

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
      queryClient.invalidateQueries({ queryKey: ['paginated-reports'] });
      queryClient.invalidateQueries({ queryKey: ['shared-attendance'] });
      // Comprehensive invalidation
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      toast.success('Отчёт одобрен');
      return { error: null };
    } catch (error) {
      console.error('Error approving report:', error);
      toast.error('Ошибка при одобрении');
      return { error: error as Error };
    }
  };

  const rejectReport = async (reportId: string, reason: string) => {
    if (!isManager || !user) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request(`/reports/${reportId}/status`, {
        method: 'PATCH',
        body: { status: 'rejected', rejection_reason: reason },
      });

      if (error) throw error;

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
      queryClient.invalidateQueries({ queryKey: ['paginated-reports'] });
      // Comprehensive invalidation
      queryClient.invalidateQueries({ queryKey: ['shared-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      toast.success('Отчёт отклонен');
      return { error: null };
    } catch (error) {
      console.error('Error rejecting report:', error);
      toast.error('Ошибка при отклонении');
      return { error: error as Error };
    }
  };

  const pendingReports = useMemo(() =>
    reports.filter((r) => r.status === 'pending'),
    [reports]
  );

  const approvedReports = useMemo(() =>
    reports.filter((r) => r.status === 'approved'),
    [reports]
  );

  const rejectedReports = useMemo(() =>
    reports.filter((r) => r.status === 'rejected'),
    [reports]
  );

  return {
    reports,
    pendingReports,
    approvedReports,
    rejectedReports,
    loading,
    fetchReports: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
      queryClient.invalidateQueries({ queryKey: ['paginated-reports'] });
    },
    createReport,
    updateReport,
    approveReport,
    rejectReport,
  };
}
