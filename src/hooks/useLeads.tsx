import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

export interface Lead {
  id: string;
  company_id: string;
  category: 'newbuilding' | 'secondary';
  full_name: string;
  phone: string | null;
  birthday: string | null;
  mortgage: boolean;
  mortgage_type: 'base' | 'family' | 'it' | 'installment' | null;
  mortgage_approved: boolean;
  residential_complex: string | null;
  result: string | null;
  comment: string | null;
  status: string;
  created_by: string | null;
  created_by_name?: string;
  branch_id: string | null;
  team_id: string | null;
  touches_count?: number;
  created_at: string;
  updated_at: string;
  touches?: LeadTouch[];
}

export interface LeadTouch {
  id: string;
  lead_id: string;
  text: string;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
}

export interface LeadCreate {
  category: 'newbuilding' | 'secondary';
  full_name: string;
  phone?: string;
  birthday?: string;
  mortgage?: boolean;
  mortgage_type?: string;
  mortgage_approved?: boolean;
  residential_complex?: string;
  result?: string;
  comment?: string;
  status?: string;
}

export const LEAD_STATUSES: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  in_progress: { label: 'В работе', color: 'bg-amber-500/15 text-amber-300 border-amber-500/20' },
  no_answer: { label: 'Не дозвонился', color: 'bg-orange-500/15 text-orange-300 border-orange-500/20' },
  callback: { label: 'Перезвонить', color: 'bg-purple-500/15 text-purple-300 border-purple-500/20' },
  thinking: { label: 'Думает', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20' },
  deal: { label: 'Сделка', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  completed: { label: 'Завершён', color: 'bg-green-500/15 text-green-300 border-green-500/20' },
  rejected: { label: 'Отказ', color: 'bg-red-500/15 text-red-300 border-red-500/20' },
};

export const MORTGAGE_TYPES: Record<string, string> = {
  base: 'Базовая',
  family: 'Семейная',
  it: 'IT',
  installment: 'Рассрочка',
};

export function useLeads(filters?: {
  category?: string;
  status?: string;
  search?: string;
  branch_id?: string;
  team_id?: string;
  created_by?: string;
  scope?: 'personal' | 'branch';
  page?: number;
}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.category) params.set('category', filters.category);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.branch_id && filters.branch_id !== 'all') params.set('branch_id', filters.branch_id);
      if (filters?.team_id && filters.team_id !== 'all') params.set('team_id', filters.team_id);
      if (filters?.scope) params.set('scope', filters.scope);
      if (filters?.scope !== 'personal' && filters?.created_by && filters.created_by !== 'all') {
        params.set('created_by', filters.created_by);
      }
      if (filters?.page) params.set('page', String(filters.page));
      const { data } = await localAPI.request(`/leads?${params.toString()}`);
      return data as { leads: Lead[]; total: number; page: number; limit: number };
    },
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const { data } = await localAPI.request(`/leads/${id}`);
      return data as Lead;
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: LeadCreate) => {
      const { data: res, error } = await localAPI.request('/leads', { method: 'POST', body: data });
      if (error) throw error;
      return res as Lead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: LeadCreate & { id: string }) => {
      const { data: res, error } = await localAPI.request(`/leads/${id}`, { method: 'PUT', body: data });
      if (error) throw error;
      return res as Lead;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/leads/${id}`, { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useAddLeadTouch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, text }: { leadId: string; text: string }) => {
      const { data, error } = await localAPI.request(`/leads/${leadId}/touches`, { method: 'POST', body: { text } });
      if (error) throw error;
      return data as LeadTouch;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
    },
  });
}

export function useDeleteLeadTouch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, touchId }: { leadId: string; touchId: string }) => {
      const { error } = await localAPI.request(`/leads/${leadId}/touches/${touchId}`, { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
    },
  });
}
