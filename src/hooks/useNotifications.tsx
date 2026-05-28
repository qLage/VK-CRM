import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from './useAuth';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/notifications');
      if (error) return [] as Notification[];
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [] as Notification[];
    },
    enabled: !!user,
    staleTime: 120000,
    refetchOnWindowFocus: false,
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await localAPI.request(`/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await localAPI.request('/notifications/read-all', {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      await localAPI.request('/notifications/delete-all', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    deleteAllNotifications: () => deleteAllNotificationsMutation.mutate(),
  };
}
