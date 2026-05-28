import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

export interface Client {
  id: string;
  company_id: string;
  full_name: string;
  phone: string | null;
  birthday: string | null;
  comment: string | null;
  status: string;
  created_by: string | null;
  created_by_name?: string;
  branch_id: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
  properties?: any[];
}

export interface ClientCreate {
  full_name: string;
  phone?: string;
  birthday?: string;
  comment?: string;
  status?: string;
}

export const CLIENT_STATUSES: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  in_progress: { label: 'В работе', color: 'bg-amber-500/15 text-amber-300 border-amber-500/20' },
  no_answer: { label: 'Не дозвонился', color: 'bg-orange-500/15 text-orange-300 border-orange-500/20' },
  callback: { label: 'Перезвонить', color: 'bg-purple-500/15 text-purple-300 border-purple-500/20' },
  thinking: { label: 'Думает', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20' },
  deal: { label: 'Сделка', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  completed: { label: 'Завершён', color: 'bg-green-500/15 text-green-300 border-green-500/20' },
  rejected: { label: 'Отказ', color: 'bg-red-500/15 text-red-300 border-red-500/20' },
};

export function useClients(filters?: { search?: string; status?: string; branch_id?: string; team_id?: string; created_by?: string; page?: number }) {
  return useQuery({
    queryKey: ['clients', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.branch_id && filters.branch_id !== 'all') params.set('branch_id', filters.branch_id);
      if (filters?.team_id && filters.team_id !== 'all') params.set('team_id', filters.team_id);
      if (filters?.created_by && filters.created_by !== 'all') params.set('created_by', filters.created_by);
      if (filters?.page) params.set('page', String(filters.page));
      const { data } = await localAPI.request(`/clients?${params.toString()}`);
      return data as { clients: Client[]; total: number; page: number; limit: number };
    },
  });
}

export function useClient(id: string | null) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      const { data } = await localAPI.request(`/clients/${id}`);
      return data as Client;
    },
    enabled: !!id,
  });
}

export function useClientSearch(q: string) {
  return useQuery({
    queryKey: ['clients-search', q],
    queryFn: async () => {
      const { data } = await localAPI.request(`/clients/search?q=${encodeURIComponent(q)}`);
      return (data || []) as { id: string; full_name: string; phone: string; status: string }[];
    },
    enabled: q.length >= 2,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ClientCreate) => {
      const { data: res, error } = await localAPI.request('/clients', { method: 'POST', body: data });
      if (error) throw error;
      return res as Client;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: ClientCreate & { id: string }) => {
      const { data: res, error } = await localAPI.request(`/clients/${id}`, { method: 'PUT', body: data });
      if (error) throw error;
      return res as Client;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client'] });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/clients/${id}`, { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useClientAccessCheck() {
  return useQuery({
    queryKey: ['client-access-check'],
    queryFn: async () => {
      const { data } = await localAPI.request('/clients/access/check');
      return data as { restricted: boolean };
    },
  });
}

export function useClientRestrictions() {
  return useQuery({
    queryKey: ['client-restrictions'],
    queryFn: async () => {
      const { data } = await localAPI.request('/clients/access/restrictions');
      return (data || []) as any[];
    },
  });
}

export function useRestrictClientAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await localAPI.request(`/clients/access/restrict/${userId}`, { method: 'POST', body: {} });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-restrictions'] });
      qc.invalidateQueries({ queryKey: ['client-access-check'] });
    },
  });
}

export function useRemoveClientRestriction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await localAPI.request(`/clients/access/restrict/${userId}`, { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-restrictions'] });
      qc.invalidateQueries({ queryKey: ['client-access-check'] });
    },
  });
}
