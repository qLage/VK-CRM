import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface Position {
  id: string;
  name: string;
  description: string | null;
  base_salary: number;
  commission_percent: number;
  sort_order?: number;
}

interface Employee {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  position_id: string | null;
  has_salary: boolean;
  commission_percent: number;
  is_active: boolean;
  created_at: string;
  position?: Position;
  custom_total_deals?: number;
  custom_total_objects?: number;
  custom_total_revenue?: number;
  custom_rating?: number;
  custom_plan_completion?: number;
  custom_growth_trend?: number;
  registration_date?: string;
  team_id?: string;
  realtor_type?: string;
  branch_id?: string;
  management_kpi_current?: number;
  personal_kpi_current?: number;
}

export function useEmployees(startDate?: string, endDate?: string) {
  const { accessLevel } = useAuth();
  const isManager = accessLevel >= 50;
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading: loading, refetch: fetchEmployees } = useQuery({
    queryKey: ['employees', startDate, endDate],
    queryFn: async () => {
      if (!isManager) return [];
      let url = '/employees';
      if (startDate && endDate) {
        url += `?start=${startDate}&end=${endDate}`;
      }
      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    enabled: !!isManager,
    staleTime: 30 * 1000, // 30 seconds
  });

  const { data: positions = [], refetch: fetchPositions } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/positions');
      if (error) throw error;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    enabled: !!isManager,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  });

  const invalidateAllEmployeeQueries = async (employeeId?: string) => {
    const keys = [
      ['employees'],
      ['shared-employees'],
      ['users-with-roles'],
      ['team-employees'],
      ['branches-list'],
      ['teams'],
      ['director-stats-real'],
      ['manager-stats']
    ];

    if (employeeId) {
      keys.push(['employee', employeeId]);
      keys.push(['employee-full-stats', employeeId]);
      keys.push(['dual-kpi', employeeId]);
    }

    await Promise.all(
      keys.map(key => queryClient.invalidateQueries({ queryKey: key }))
    );
  };

  const updateEmployee = async (
    employeeId: string,
    updates: Partial<Omit<Employee, 'id' | 'email' | 'created_at' | 'position'>>
  ) => {
    if (!isManager) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request(`/employees/${employeeId}`, {
        method: 'PATCH',
        body: updates,
      });

      if (error) throw error;
      await invalidateAllEmployeeQueries(employeeId);
      toast.success('Данные сотрудника обновлены');
      return { error: null };
    } catch (error) {
      console.error('Error updating employee:', error);
      toast.error('Ошибка при обновлении');
      return { error: error as Error };
    }
  };

  const deleteEmployee = async (employeeId: string) => {
    if (!isManager) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request(`/employees/${employeeId}`, {
        method: 'DELETE',
      });

      if (error) throw error;
      await invalidateAllEmployeeQueries(employeeId);
      toast.success('Сотрудник удален');
      return { error: null };
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error('Ошибка при удалении');
      return { error: error as Error };
    }
  };

  const updateEmployeeCommission = async (employeeId: string, percent: number) => {
    return updateEmployee(employeeId, { commission_percent: percent });
  };

  const updateEmployeeSalary = async (employeeId: string, hasSalary: boolean) => {
    return updateEmployee(employeeId, { has_salary: hasSalary });
  };

  const updateEmployeePosition = async (employeeId: string, positionId: string) => {
    return updateEmployee(employeeId, { position_id: positionId });
  };

  const toggleEmployeeActive = async (employeeId: string, isActive: boolean) => {
    return updateEmployee(employeeId, { is_active: isActive });
  };

  return {
    employees,
    positions,
    loading,
    fetchEmployees,
    fetchPositions,
    updateEmployee,
    updateEmployeeCommission,
    updateEmployeeSalary,
    updateEmployeePosition,
    toggleEmployeeActive,
    deleteEmployee,
    invalidateAllEmployeeQueries,
  };
}

export function usePositions() {
  const { accessLevel } = useAuth();
  const isAdmin = accessLevel >= 100;
  const queryClient = useQueryClient();

  const { data: positions = [], isLoading: loading, refetch: fetchPositions } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/positions');
      if (error) throw error;
      let items = [];
      if (Array.isArray(data?.data)) {
        items = data.data;
      } else if (Array.isArray(data)) {
        items = data;
      } else {
        return [];
      }

      const positionOrder = [
        'pos-director',
        'pos-admin',
        'pos-comm',
        'pos-rop',
        'pos-mop',
        'pos-mortgage',
        'pos-realtor'
      ];

      return items.sort((a: any, b: any) => {
        const indexA = positionOrder.indexOf(a.id);
        const indexB = positionOrder.indexOf(b.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
    },
    staleTime: 30 * 60 * 1000,
  });

  const createPosition = async (position: Omit<Position, 'id'>) => {
    if (!isAdmin) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request('/positions', {
        method: 'POST',
        body: position,
      });

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Должность создана');
      return { error: null };
    } catch (error) {
      console.error('Error creating position:', error);
      toast.error('Ошибка при создании должности');
      return { error: error as Error };
    }
  };

  const updatePosition = async (id: string, updates: Partial<Omit<Position, 'id'>>) => {
    if (!isAdmin) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request(`/positions/${id}`, {
        method: 'PATCH',
        body: updates,
      });

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Должность обновлена');
      return { error: null };
    } catch (error) {
      console.error('Error updating position:', error);
      toast.error('Ошибка при обновлении');
      return { error: error as Error };
    }
  };

  const deletePosition = async (id: string) => {
    if (!isAdmin) return { error: new Error('Not authorized') };

    try {
      const { error } = await localAPI.request(`/positions/${id}`, {
        method: 'DELETE',
      });

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Должность удалена');
      return { error: null };
    } catch (error) {
      console.error('Error deleting position:', error);
      toast.error('Ошибка при удалении');
      return { error: error as Error };
    }
  };

  return {
    positions,
    loading,
    fetchPositions,
    createPosition,
    updatePosition,
    deletePosition,
  };
}

export function usePermissions() {
  const { accessLevel } = useAuth();
  const isAdmin = accessLevel >= 100;
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);

  const permissionLabels: Record<string, string> = {
    view_own_stats: 'Просмотр своей статистики',
    create_reports: 'Создание служебок',
    view_own_reports: 'Просмотр своих служебок',
    view_team_reports: 'Просмотр служебок команды',
    approve_reports: 'Одобрение служебок',
    manage_employees: 'Управление сотрудниками',
    view_finances: 'Просмотр финансов',
    manage_attendance: 'Управление посещаемостью',
    manage_positions: 'Управление должностями',
  };

  const fetchPermissions = async () => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const { data, error } = await localAPI.request('/permissions');
      if (error) throw error;

      const permMap: Record<string, Record<string, boolean>> = {};
      const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      items.forEach((perm: any) => {
        if (!permMap[perm.position_id]) {
          permMap[perm.position_id] = {};
        }
        permMap[perm.position_id][perm.permission] = true;
      });

      setPermissions(permMap);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePermission = async (
    positionId: string,
    permissionKey: string,
    enabled: boolean
  ) => {
    if (!isAdmin) return { error: new Error('Not authorized') };

    try {
      if (enabled) {
        const { error } = await localAPI.request('/permissions', {
          method: 'POST',
          body: { position_id: positionId, permission: permissionKey },
        });
        if (error) throw error;
      } else {
        const { data: allPermsData } = await localAPI.request(`/permissions/position/${positionId}`);
        const allPerms = Array.isArray(allPermsData?.data) ? allPermsData.data : (Array.isArray(allPermsData) ? allPermsData : []);
        const permToDelete = (allPerms).find((p: any) => p.permission === permissionKey);

        if (permToDelete) {
          const { error } = await localAPI.request(`/permissions/${permToDelete.id}`, {
            method: 'DELETE',
          });
          if (error) throw error;
        }
      }

      await fetchPermissions();
      toast.success('Права обновлены');
      return { error: null };
    } catch (error) {
      console.error('Error updating permission:', error);
      toast.error('Ошибка при обновлении прав');
      return { error: error as Error };
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchPermissions();
    }
  }, [isAdmin]);

  return {
    permissions,
    permissionLabels,
    loading,
    fetchPermissions,
    updatePermission,
  };
}
