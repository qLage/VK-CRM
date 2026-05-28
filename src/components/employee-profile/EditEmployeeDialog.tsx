import { useState, useEffect } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { localAPI } from '@/integrations/localAPI';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Phone, Mail, Target } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useSharedData } from '@/hooks/useSharedData';
import { usePositions } from '@/hooks/useEmployees';
import { formatPhoneRu } from '@/lib/phone-utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { cn } from '@/lib/utils';

interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position_id?: string | null;
  position?: { id: string; name: string; role?: string } | null;
  branch_id?: string | null;
  team_id?: string | null;
  personal_kpi_current?: number;
  management_kpi_current?: number;
  is_active?: boolean | number;
  has_salary?: boolean | number;
  salary_amount?: number;
  commission_percent?: number;
  is_kpi_enabled?: boolean | number;
  is_new_building?: boolean | number;
  custom_total_deals?: number;
  custom_total_objects?: number;
  custom_total_revenue?: number;
  registration_date?: string | null;
  realtor_type?: string | null;
}

interface EditEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
  onSuccess?: () => void;
}

export function EditEmployeeDialog({ open, onOpenChange, employee, onSuccess }: EditEmployeeDialogProps) {
  const { toast } = useToast();
  const { branches } = useSharedData();
  const { positions } = usePositions();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const splitName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    return {
      lastName: parts[0] || '',
      firstName: parts[1] || '',
      middleName: parts.slice(2).join(' ') || '',
    };
  };

  const nameParts = splitName(employee?.full_name ?? '');

  const [formData, setFormData] = useState({
    lastName: nameParts.lastName,
    firstName: nameParts.firstName,
    middleName: nameParts.middleName,
    email: employee?.email ?? '',
    phone: employee?.phone ? formatPhoneRu(employee.phone) : '',
    position_id: employee?.position_id ?? null,
    branch_id: employee?.branch_id ?? null,
    team_id: employee?.team_id ?? null,
    is_active: !!employee?.is_active,
    has_salary: !!employee?.has_salary,
    salary_amount: employee?.salary_amount ?? 0,
    commission_percent: employee?.commission_percent ?? 0,
    is_kpi_enabled: !!employee?.is_kpi_enabled,
    is_new_building: !!employee?.is_new_building,
    custom_total_deals: employee?.custom_total_deals ?? 0,
    custom_total_objects: employee?.custom_total_objects ?? 0,
    custom_total_revenue: employee?.custom_total_revenue ?? 0,
    registration_date: employee?.registration_date ?? null,
    personal_kpi_current: employee?.personal_kpi_current ?? 40,
    management_kpi_current: employee?.management_kpi_current ?? 0,
    realtor_type: employee?.realtor_type ?? 'universal',
  });

  useEffect(() => {
    if (!open || !employee) return;
    const parts = splitName(employee.full_name ?? '');
    setFormData({
      lastName: parts.lastName,
      firstName: parts.firstName,
      middleName: parts.middleName,
      email: employee.email ?? '',
      phone: employee.phone ? formatPhoneRu(employee.phone) : '',
      position_id: employee.position_id ?? null,
      branch_id: employee.branch_id ?? null,
      team_id: employee.team_id ?? null,
      is_active: !!employee.is_active,
      has_salary: !!employee.has_salary,
      salary_amount: employee.salary_amount ?? 0,
      commission_percent: employee.commission_percent ?? 0,
      is_kpi_enabled: !!employee.is_kpi_enabled,
      is_new_building: !!employee.is_new_building,
      custom_total_deals: employee.custom_total_deals ?? 0,
      custom_total_objects: employee.custom_total_objects ?? 0,
      custom_total_revenue: employee.custom_total_revenue ?? 0,
      registration_date: employee.registration_date ?? null,
      personal_kpi_current: employee.personal_kpi_current ?? 40,
      management_kpi_current: employee.management_kpi_current ?? 0,
      realtor_type: employee.realtor_type ?? 'universal',
    });
  }, [open, employee]);

  const selectedPosition = (Array.isArray(positions) ? positions : []).find((p: any) => p.id === formData.position_id);
  const positionName = String(selectedPosition?.name || employee?.position?.name || '').toUpperCase();
  const positionRole = String((selectedPosition as any)?.role || employee?.position?.role || '');
  const isDirectorOrAdmin = ['ДИРЕКТОР', 'АДМИНИСТРАТОР', 'АДМИН'].some(pos => positionName.includes(pos))
    || ['director', 'admin'].includes(positionRole);
  const isComm = positionName.includes('КОММЕРЧЕСКИЙ');

  const isMop = positionRole === 'sales_manager' || positionName.includes('МОП');
  const isRop = positionRole === 'head_sales' || positionName.includes('РОП');

  const showManagementKpi = (['МОП', 'РОП', 'КОММЕРЧЕСКИЙ'].some(pos => positionName.includes(pos))
    || ['sales_manager', 'head_sales', 'commercial'].includes(positionRole)) && (!isDirectorOrAdmin || isComm);

  const showPersonalKpi = !isDirectorOrAdmin || isComm;

  // Fetch KPI rules dynamically
  const { data: realtorRules } = useQuery({
    queryKey: ['kpi-rules', 'realtor'],
    queryFn: async () => {
      const { data } = await localAPI.getKPIRules('realtor');
      return data?.rules || [];
    },
    enabled: open && showPersonalKpi,
  });

  const { data: mopRules } = useQuery({
    queryKey: ['kpi-rules', 'sales_manager'],
    queryFn: async () => {
      const { data } = await localAPI.getKPIRules('sales_manager');
      return data?.rules || [];
    },
    enabled: open && showManagementKpi && isMop,
  });

  const { data: ropRules } = useQuery({
    queryKey: ['kpi-rules', 'head_sales'],
    queryFn: async () => {
      const { data } = await localAPI.getKPIRules('head_sales');
      return data?.rules || [];
    },
    enabled: open && showManagementKpi && isRop,
  });

  const managementRules = isRop ? ropRules : isMop ? mopRules : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const fullName = `${formData.lastName} ${formData.firstName} ${formData.middleName}`.trim();
      const submissionData: Record<string, any> = {
        ...formData,
        full_name: fullName,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
      };

      // Remove temporary UI fields
      delete submissionData.lastName;
      delete submissionData.firstName;
      delete submissionData.middleName;

      // If KPI field is hidden for this role, don't send it at all to avoid validation errors
      if (!showManagementKpi) {
        delete submissionData.management_kpi_current;
      }
      if (!showPersonalKpi) {
        delete submissionData.personal_kpi_current;
      }

      console.log('Sending submission data:', submissionData);

      const result = await localAPI.request(`/employees/${employee.id}`, {
        method: 'PATCH',
        body: submissionData,
      });

      if (result.error) {
        throw result.error;
      }

      toast({
        title: 'Успешно',
        description: 'Профиль сотрудника обновлен',
      });

      // Invalidate caches so analytics/employee lists update instantly
      queryClient.invalidateQueries({ queryKey: ['shared-employees'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-leaderboard-prev'] });

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось обновить профиль',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Редактировать профиль
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium text-white/85">
                Фамилия
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className={cn(INPUT_WITH_LEADING_ICON, 'normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white')}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium text-white/85">
                Имя
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className={cn(INPUT_WITH_LEADING_ICON, 'normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white')}
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="middleName" className="text-sm font-medium text-white/85">
              Отчество (необязательно)
            </Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
              <Input
                id="middleName"
                value={formData.middleName}
                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                className={cn(INPUT_WITH_LEADING_ICON, 'normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white')}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch_id" className="text-sm font-medium text-white/85">
              Филиал
            </Label>
            <Select
              value={formData.branch_id || 'none'}
              onValueChange={(value) => setFormData({ ...formData, branch_id: value === 'none' ? null : value })}
            >
              <SelectTrigger id="branch_id" className="normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Выберите филиал" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="none" className="normal-case font-medium tracking-normal text-white hover:bg-white/5">
                  Без филиала
                </SelectItem>
                {(Array.isArray(branches) ? branches : []).map(branch => (
                  <SelectItem key={branch.id} value={branch.id} className="normal-case font-medium tracking-normal text-white hover:bg-white/5">
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="position_id" className="text-sm font-medium text-white/85">
              Должность
            </Label>
            <Select
              value={formData.position_id || 'none'}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  position_id: value === 'none' ? null : value,
                  // Reset hidden management KPI to safe default when moving to non-management.
                  management_kpi_current: value === 'none' ? 0 : formData.management_kpi_current,
                })
              }
            >
              <SelectTrigger id="position_id" className="normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Выберите должность" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="none" className="normal-case font-medium tracking-normal text-white hover:bg-white/5">
                  Без должности
                </SelectItem>
                {(Array.isArray(positions) ? positions : []).map(position => (
                  <SelectItem key={position.id} value={position.id} className="normal-case font-medium tracking-normal text-white hover:bg-white/5">
                    {position.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-sm font-medium text-white/85">
                Email
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={cn(INPUT_WITH_LEADING_ICON, 'normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white')}
                  placeholder="employee@company.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="phone" className="text-sm font-medium text-white/85">
                Телефон
              </Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhoneRu(e.target.value) })}
                  className={cn(INPUT_WITH_LEADING_ICON, 'normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white')}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="realtor_type" className="text-sm font-medium text-white/85">
              Специализация
            </Label>
            <div className="relative">
              <Target className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
              <Select
                value={formData.realtor_type}
                onValueChange={(value) => setFormData({ ...formData, realtor_type: value })}
              >
                <SelectTrigger id="realtor_type" className={cn(INPUT_WITH_LEADING_ICON, 'normal-case font-medium tracking-normal bg-white/5 border-white/10 text-white')}>
                  <SelectValue placeholder="Выберите специализацию" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  <SelectItem value="universal" className="normal-case font-medium tracking-normal text-white hover:bg-white/5">
                    Универсальный боец
                  </SelectItem>
                  <SelectItem value="secondary" className="normal-case font-medium tracking-normal text-white hover:bg-white/5">
                    Вторичка
                  </SelectItem>
                  <SelectItem value="newbuildings" className="normal-case font-medium tracking-normal text-white hover:bg-white/5">
                    Новостройки
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 space-y-6">
            {showPersonalKpi && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-white/85">
                    Личный KPI
                  </Label>
                  <span className="text-xs font-bold text-primary">{Math.round(formData.personal_kpi_current)}%</span>
                </div>
                <Slider
                  value={[formData.personal_kpi_current]}
                  min={Math.min(...(realtorRules || []).map((r: any) => Math.round(Number(r.percent)))) || 40}
                  max={Math.max(...(realtorRules || []).map((r: any) => Math.round(Number(r.percent)))) || 60}
                  step={1}
                  onValueChange={([val]) => setFormData({ ...formData, personal_kpi_current: val })}
                  className="py-4"
                />
                <div className="flex justify-between text-[10px] text-white/30 font-black uppercase tracking-widest">
                  <span>мин: {Math.min(...(realtorRules || []).map((r: any) => Math.round(Number(r.percent)))) || 40}%</span>
                  <span>цель: {Math.max(...(realtorRules || []).map((r: any) => Math.round(Number(r.percent)))) || 60}%</span>
                </div>
              </div>
            )}

            {showManagementKpi && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-white/85">
                    Управленческий KPI
                  </Label>
                  <span className="text-xs font-bold text-purple-400">{Math.round(formData.management_kpi_current || 0)}%</span>
                </div>
                <Slider
                  value={[formData.management_kpi_current || 0]}
                  min={Math.min(...(managementRules || []).map((r: any) => Math.round(Number(r.percent)))) || 3}
                  max={Math.max(...(managementRules || []).map((r: any) => Math.round(Number(r.percent)))) || 5}
                  step={1}
                  onValueChange={([val]) => setFormData({ ...formData, management_kpi_current: val })}
                  className="py-4"
                />
                <div className="flex justify-between text-[10px] text-white/30 font-black uppercase tracking-widest">
                  <span>мин: {Math.min(...(managementRules || []).map((r: any) => Math.round(Number(r.percent)))) || 3}%</span>
                  <span>цель: {Math.max(...(managementRules || []).map((r: any) => Math.round(Number(r.percent)))) || 5}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1 border-white/10 hover:bg-white/5"
            >
              Отмена
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
