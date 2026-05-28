import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseUTCDate } from '@/lib/date-utils';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  check_in_by: string | null;
  check_out_by: string | null;
  notes: string | null;
  is_in_fields?: boolean;
}

export function useAttendance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (user) {
      fetchTodayAttendance();
    }
  }, [user]);

  const fetchTodayAttendance = async () => {
    if (!user) return;

    try {
      const { data, error } = await localAPI.request('/attendance/today');
      if (error) throw error;

      // Backend returns { checked_in: boolean, record: AttendanceRecord | null }
      if (data && 'record' in data) {
        setTodayRecord((data as any).record);
      } else {
        // Fallback if structure is different
        setTodayRecord(data as AttendanceRecord | null);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkIn = async () => {
    if (!user) return { error: new Error('Not authenticated') };
    if (submittingRef.current) return { error: new Error('Already submitting') };

    // Optimistic check
    if (todayRecord?.check_in) {
      await fetchTodayAttendance();
      return { error: null };
    }

    try {
      submittingRef.current = true;
      setIsSubmitting(true);

      const { error } = await localAPI.request('/attendance/check-in', {
        method: 'POST',
        body: { timestamp: new Date().toISOString() },
      });

      if (error) throw error;
      await fetchTodayAttendance();
      toast.success('Приход отмечен');
      return { error: null };
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.log('Check-in error:', error);
      }
      // Quietly handle "Already checked in" or specific 400s
      if (error.message?.includes('Already checked in') || error.status === 400) {
        await fetchTodayAttendance();
        toast.info('Вы уже отметились сегодня');
        return { error: null };
      }

      console.error('Error checking in:', error);
      toast.error('Ошибка при отметке прихода');
      return { error: error as Error };
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const checkOut = async () => {
    if (!user) return { error: new Error('Not authenticated') };
    if (submittingRef.current) return { error: new Error('Already submitting') };

    if (todayRecord?.check_out) {
      await fetchTodayAttendance();
      return { error: null };
    }

    try {
      submittingRef.current = true;
      setIsSubmitting(true);

      const { error } = await localAPI.request('/attendance/check-out', {
        method: 'POST',
        body: { timestamp: new Date().toISOString() },
      });

      if (error) throw error;
      await fetchTodayAttendance();
      toast.success('Уход отмечен');
      return { error: null };
    } catch (error: any) {
      // Quietly handle "Already checked out"
      if (error.message?.includes('Already checked out') || error.status === 400) {
        await fetchTodayAttendance();
        toast.info('Вы уже отметились на уход');
        return { error: null };
      }

      console.error('Error checking out:', error);
      toast.error('Ошибка при отметке ухода');
      return { error: error as Error };
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const markInFields = async () => {
    if (!user) return { error: new Error('Not authenticated') };
    if (!isCheckedIn || isCheckedOut) return { error: new Error('Cannot mark in fields now') };

    try {
      setIsSubmitting(true);
      const { error } = await localAPI.request(`/attendance/${todayRecord?.id}`, {
        method: 'PATCH',
        body: { is_in_fields: !todayRecord?.is_in_fields },
      });

      if (error) throw error;

      // Standard fetch for current user
      await fetchTodayAttendance();

      // Invalidate broad lists to synchronize Dashboard and Team pages
      queryClient.invalidateQueries({ queryKey: ['team-today-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today-records'] });
      // Comprehensive invalidation for all attendance-related queries
      queryClient.invalidateQueries({ queryKey: ['analytics-base-data'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['team-leaderboard-metrics'] });

      toast.success(todayRecord?.is_in_fields ? 'Вернулся из полей' : 'Ушёл в поля');
      return { error: null };
    } catch (error) {
      console.error('Error marking in fields:', error);
      toast.error('Ошибка при обновлении статуса');
      return { error: error as Error };
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCheckedIn = !!todayRecord?.check_in;
  const isCheckedOut = !!todayRecord?.check_out;
  const isInFields = !!todayRecord?.is_in_fields;
  const checkInTime = todayRecord?.check_in
    ? parseUTCDate(todayRecord.check_in).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null;
  // If checked out, show check out time. If not, null.
  const checkOutTime = todayRecord?.check_out
    ? parseUTCDate(todayRecord.check_out).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null;

  return {
    todayRecord,
    loading: loading || isSubmitting,
    checkIn,
    checkOut,
    isCheckedIn,
    isCheckedOut,
    isInFields,
    checkInTime,
    checkOutTime,
    markInFields,
    refresh: fetchTodayAttendance,
  };
}

// Hook for managers to manage employee attendance
export function useEmployeeAttendance(employeeId?: string) {
  const { user, accessLevel } = useAuth();
  const isManager = accessLevel >= 50;
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = async (startDate?: string, endDate?: string) => {
    if (!isManager) return;

    try {
      let url = '/attendance';
      const params: string[] = [];
      if (employeeId) params.push(`user_id=${employeeId}`);
      if (startDate) params.push(`start_date=${startDate}`);
      if (endDate) params.push(`end_date=${endDate}`);
      if (params.length) url += `?${params.join('&')}`;

      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      setRecords((data as AttendanceRecord[]) || []);
    } catch (error) {
      console.error('Error fetching attendance records:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAttendance = async (
    recordId: string,
    updates: { check_in?: string; check_out?: string; notes?: string }
  ) => {
    if (!isManager) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request(`/attendance/${recordId}`, {
        method: 'PATCH',
        body: updates,
      });

      if (error) throw error;
      await fetchRecords();
      // Comprehensive invalidation for all attendance-related queries
      queryClient.invalidateQueries({ queryKey: ['team-today-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today-records'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-base-data'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['team-leaderboard-metrics'] });
      toast.success('Посещаемость обновлена');
      return { error: null };
    } catch (error) {
      console.error('Error updating attendance:', error);
      toast.error('Ошибка при обновлении');
      return { error: error as Error };
    }
  };

  const createAttendance = async (
    userId: string,
    date: string,
    checkIn?: string,
    checkOut?: string
  ) => {
    if (!isManager) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request('/attendance', {
        method: 'POST',
        body: {
          user_id: userId,
          date,
          check_in: checkIn,
          check_out: checkOut,
        },
      });

      if (error) throw error;
      await fetchRecords();
      // Comprehensive invalidation for all attendance-related queries
      queryClient.invalidateQueries({ queryKey: ['team-today-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today-records'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-base-data'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['team-leaderboard-metrics'] });
      toast.success('Запись создана');
      return { error: null };
    } catch (error) {
      console.error('Error creating attendance:', error);
      toast.error('Ошибка при создании записи');
      return { error: error as Error };
    }
  };

  useEffect(() => {
    if (isManager) {
      fetchRecords();
    }
  }, [isManager, employeeId]);

  return {
    records,
    loading,
    fetchRecords,
    updateAttendance,
    createAttendance,
  };
}
