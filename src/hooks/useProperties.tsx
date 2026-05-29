import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface PropertyUtilityDetails {
  water_supply_type?: string;
  sewerage_type?: string;
  gas_supply_type?: string;
  heating_type?: string;
  electricity?: string;
}

export interface Property {
  id: string;
  company_id: string;
  owner_id: string;
  branch_id: string | null;
  team_id: string | null;
  category: string;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price: number;
  area_total: number | null;
  area_living: number | null;
  area_kitchen: number | null;
  rooms: string | null;
  floor: number | null;
  floors_total: number | null;
  description: string | null;
  status: string;
  // Extended fields
  house_type?: string | null;
  year_built?: number | null;
  renovation?: string | null;
  bathroom?: string | null;
  balcony?: string | null;
  ceiling_height?: number | null;
  parking?: string | null;
  view_from_window?: string | null;
  elevator?: string | null;
  passenger_elevator_count?: number | null;
  freight_elevator_count?: number | null;
  land_area?: number | null;
  land_status?: string | null;
  commercial_type?: string | null;
  utility_details?: PropertyUtilityDetails | null;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  avito_status: string | null;
  archived_at: string | null;
  auto_delete_at: string | null;
  deal_id: string | null;
  source_type: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  owner_name: string;
  owner_avatar: string | null;
  branch_name: string | null;
  team_name: string | null;
  photo_count: number;
  cover_url: string | null;
  transfer_status: string | null;
  transfer_to_user_id: string | null;
  transfer_to_name: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  // Detail
  photos?: PropertyPhoto[];
  transfers?: PropertyTransfer[];
}

export interface PropertyPhoto {
  id: string;
  property_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  sort_order: number;
}

export interface PropertyTransfer {
  id: string;
  property_id: string;
  from_user_id: string;
  to_user_id: string;
  from_name: string;
  to_name: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export interface PropertyFilters {
  view?: 'my' | 'team';
  status?: string;
  category?: string;
  search?: string;
  branch_id?: string;
  price_min?: string;
  price_max?: string;
  rooms?: string;
}

export interface PropertyCreate {
  category: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
  price: number;
  area_total?: number;
  area_living?: number;
  area_kitchen?: number;
  rooms?: number | string;
  floor?: number;
  floors_total?: number;
  description?: string;
  // Extended fields
  house_type?: string;
  year_built?: number;
  renovation?: string;
  bathroom?: string;
  balcony?: string;
  ceiling_height?: number;
  parking?: string;
  view_from_window?: string;
  elevator?: string;
  passenger_elevator_count?: number;
  freight_elevator_count?: number;
  land_area?: number;
  land_status?: string;
  commercial_type?: string;
  deal_type?: string;
  room_type?: string;
  sale_options?: string;
  walls_type?: string;
  heating?: string;
  water_supply?: string;
  sewerage?: string;
  gas_supply?: string;
  built_year?: number;
  client_id?: string;
  lead_id?: string;
  external_name?: string;
  source_type?: 'client' | 'lead' | 'external';
  // Avito rent fields
  furniture?: string;
  appliances?: string;
  internet?: string;
  conditioner?: string;
  washing_machine?: string;
  dishwasher?: string;
  fridge?: string;
  tv?: string;
  pets_allowed?: string;
  children_allowed?: string;
  prepayment?: string;
  deposit_amount?: string;
  lease_term?: string;
  tenant_requirements?: string;
  // Avito common fields
  infrastructure?: string;
  transport_accessibility?: string;
  // Additional Avito fields
  object_type?: string;
  bathroom_location?: string;
  apartment_type?: string;
  smoking_allowed?: string;
  // Detailed utility types for Avito houses
  utility_details?: PropertyUtilityDetails;
}

export function useProperties(filters: PropertyFilters = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const params = new URLSearchParams();
  if (filters.view) params.set('view', filters.view);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.search) params.set('search', filters.search);
  if (filters.branch_id) params.set('branch_id', filters.branch_id);
  if (filters.price_min) params.set('price_min', filters.price_min);
  if (filters.price_max) params.set('price_max', filters.price_max);
  if (filters.rooms) params.set('rooms', filters.rooms);
  const qs = params.toString();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['properties', qs],
    queryFn: async () => {
      const { data, error } = await localAPI.request(`/properties?${qs}`);
      if (error) throw error;
      const raw = data as Record<string, unknown> | null;
      const list = Array.isArray(raw?.data) ? (raw!.data as Property[]) : Array.isArray(raw) ? (raw as unknown as Property[]) : [];
      const total = typeof raw?.total === 'number' ? raw.total : list.length;
      return { data: list, total };
    },
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['properties'] });
    queryClient.invalidateQueries({ queryKey: ['property-detail'] });
  };

  const createProperty = useMutation({
    mutationFn: async (prop: PropertyCreate) => {
      const { data, error } = await localAPI.request('/properties', { method: 'POST', body: prop });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Объект создан'); },
    onError: () => toast.error('Ошибка при создании объекта'),
  });

  const updateProperty = useMutation({
    mutationFn: async ({ id, ...body }: PropertyCreate & { id: string }) => {
      const { error } = await localAPI.request(`/properties/${id}`, { method: 'PUT', body });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Объект обновлён'); },
    onError: () => toast.error('Ошибка при обновлении'),
  });

  const submitForApproval = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/properties/${id}/submit`, { method: 'PATCH' });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Отправлено на одобрение'); },
    onError: () => toast.error('Ошибка'),
  });

  const approveProperty = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: 'approve' | 'reject'; reason?: string }) => {
      const { error } = await localAPI.request(`/properties/${id}/approve`, { method: 'PATCH', body: { action, reason } });
      if (error) throw error;
    },
    onSuccess: (_, vars) => { invalidate(); toast.success(vars.action === 'approve' ? 'Одобрено' : 'Отклонено'); },
    onError: (e: any) => toast.error(e?.message || 'Ошибка'),
  });

  const requestArchive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/properties/${id}/archive`, { method: 'PATCH' });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Запрос на архивацию отправлен'); },
    onError: () => toast.error('Ошибка'),
  });

  const requestAvito = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/properties/${id}/avito-request`, { method: 'PATCH' });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Запрос на публикацию на Avito отправлен'); },
    onError: () => toast.error('Ошибка'),
  });

  const transferProperty = useMutation({
    mutationFn: async ({ id, to_user_id }: { id: string; to_user_id: string }) => {
      const { error } = await localAPI.request(`/properties/${id}/transfer`, { method: 'POST', body: { to_user_id } });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Запрос на передачу отправлен'); },
    onError: () => toast.error('Ошибка'),
  });

  const handleTransfer = useMutation({
    mutationFn: async ({ transferId, action }: { transferId: string; action: 'accept' | 'reject' | 'cancel' }) => {
      const { error } = await localAPI.request(`/properties/transfers/${transferId}`, { method: 'PATCH', body: { action } });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidate();
      const msgs: Record<string, string> = { accept: 'Объект принят', reject: 'Передача отклонена', cancel: 'Передача отменена' };
      toast.success(msgs[vars.action]);
    },
    onError: () => toast.error('Ошибка'),
  });

  const deleteProperty = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/properties/${id}`, { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Объект удалён'); },
    onError: () => toast.error('Ошибка при удалении'),
  });

  return {
    properties: data?.data || [],
    total: data?.total || 0,
    isLoading,
    refetch,
    createProperty,
    updateProperty,
    submitForApproval,
    approveProperty,
    requestArchive,
    requestAvito,
    transferProperty,
    handleTransfer,
    deleteProperty,
  };
}

export function usePropertyDetail(id: string | null) {
  return useQuery({
    queryKey: ['property-detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await localAPI.request(`/properties/${id}`);
      if (error) throw error;
      return data as Property;
    },
    enabled: !!id,
    staleTime: 30000,
  });
}

export function usePropertyPendingCount() {
  const { user, accessLevel } = useAuth();
  return useQuery({
    queryKey: ['properties-pending-count'],
    queryFn: async () => {
      const { data } = await localAPI.request('/properties/pending-count');
      return (data as any)?.count || 0;
    },
    enabled: !!user && accessLevel >= 50,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
