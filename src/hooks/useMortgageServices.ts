import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';

export type MortgageServiceRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  team_id: string | null;
  deal_date: string;
  year: number;
  month: number;
  bank_program: string;
  bank_name?: string;
  program_name?: string;
  client_id?: string | null;
  service_cost: number;
  client_name: string;
  broker_id: string | null;
  broker_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_fee: number;
  broker_share: number;
  agency_share: number;
  broker_payout_status: string;
  broker_paid_at: string | null;
  broker_paid_note: string | null;
  status: string;
  rejection_reason?: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MortgageListParams = {
  year?: number;
  month?: number | null;
  search?: string;
  branch_id?: string;
  enabled?: boolean;
};

async function fetchMortgageList(params: MortgageListParams): Promise<MortgageServiceRow[]> {
  const qs = new URLSearchParams();
  if (params.year != null) qs.set('year', String(params.year));
  if (params.month != null && params.month > 0) qs.set('month', String(params.month));
  if (params.search?.trim()) qs.set('search', params.search.trim());
  if (params.branch_id) qs.set('branch_id', params.branch_id);
  const { data, error } = await localAPI.request(`/mortgage-services?${qs}`);
  if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Ошибка загрузки');
  const payload = data as { data?: MortgageServiceRow[] } | MortgageServiceRow[] | null;
  if (payload && typeof payload === 'object' && 'data' in payload && Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function useMortgageServices(params: MortgageListParams) {
  return useQuery({
    queryKey: ['mortgage-services', params.year, params.month, params.search, params.branch_id],
    queryFn: () => fetchMortgageList(params),
    enabled: params.enabled !== false,
  });
}

export function useMortgageMutations() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mortgage-services'] });
    qc.invalidateQueries({ queryKey: ['kpi'] });
    qc.invalidateQueries({ queryKey: ['finances'] });
  };

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await localAPI.request('/mortgage-services', { method: 'POST', body });
      if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Ошибка');
      return data as MortgageServiceRow;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Запись создана');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data, error } = await localAPI.request(`/mortgage-services/${id}`, {
        method: 'PUT',
        body,
      });
      if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Ошибка');
      return data as MortgageServiceRow;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Сохранено');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/mortgage-services/${id}`, { method: 'DELETE' });
      if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Ошибка');
    },
    onSuccess: () => {
      invalidate();
      toast.success('Удалено');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { create, update, remove };
}
