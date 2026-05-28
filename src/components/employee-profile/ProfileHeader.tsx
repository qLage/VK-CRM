import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getAvatarUrl, cn } from '@/lib/utils';
import { getPositionName, isRatingParticipant } from '@/lib/positions';
import {
  Mail, Phone, MapPin, FileText, PencilLine,
  TrendingUp, Target, ChevronLeft, Edit, Trash2, KeyRound, MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEmployees } from '@/hooks/useEmployees';
import { EditEmployeeDialog } from './EditEmployeeDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { ProfileExtraInfoDialog } from '@/components/profile/ProfileExtraInfoDialog';

interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position_id: string | null;
  position?: { 
    id: string; 
    name: string; 
    base_salary: number; 
    commission_percent: number; 
    sort_order?: number; 
    access_level?: number;
    default_personal_kpi_min?: number;
    default_personal_kpi_max?: number;
    default_management_kpi_min?: number;
    default_management_kpi_max?: number;
  } | null;
  commission_percent: number;
  has_salary: boolean;
  is_active: boolean;
  branch_id?: string;
  branch?: { id: string; name: string };
  team_id?: string;
  team?: { id: string; name: string };
  avatar_url?: string;
  created_at: string;
  realtor_type?: string;
  custom_total_deals?: number;
  custom_total_objects?: number;
  custom_total_revenue?: number;
  registration_date?: string;
  personal_kpi_current?: number;
  management_kpi_current?: number;
  passport_series_number?: string | null;
  extra_phone?: string | null;
  emergency_contacts?: unknown;
  passport_address?: string | null;
  residential_address?: string | null;
}

interface ProfileHeaderProps {
  employee: Employee;
}

export function ProfileHeader({ employee }: ProfileHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { accessLevel, user, role } = useAuth();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isExtraInfoOpen, setIsExtraInfoOpen] = useState(false);
  const [extraInfoDialogMode, setExtraInfoDialogMode] = useState<'view' | 'edit'>('view');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  interface KpiResult {
    type: string;
    displayName: string;
    currentPercent?: number;
    planCompletion?: number;
    currentValue?: number; // Added
    planValue?: number; // Added
    metrics: any;
  }

  interface DualKpiResponse {
    hasDualKpi: boolean;
    kpis: KpiResult[];
  }
  const queryClient = useQueryClient();
  const { deleteEmployee, invalidateAllEmployeeQueries } = useEmployees();
  const { data: dualKpi, isLoading: isLoadingKpi } = useQuery({
    queryKey: ['dual-kpi', employee.id],
    queryFn: async () => {
      const { data } = (await localAPI.request(`/kpi/user/${employee.id}/dual-stats?period=quarter`)) as { data: DualKpiResponse };
      return data;
    },
    enabled: !!employee.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const canEdit = accessLevel >= 90;

  const isSelfProfile = String(user?.id || '') === String(employee.id);
  const isManagementExtra =
    accessLevel >= 90 || ['commercial', 'head_sales', 'sales_manager', 'manager'].includes(role || '');
  const canEditExtraInfo = isSelfProfile || isManagementExtra;

  // Helper functions for dual KPI display
  const isManagementRole = useMemo(() => {
    const posName = (employee?.position?.name ?? '').toLowerCase();
    const legacyPositionName = String((employee as any)?.position_name ?? '').toLowerCase();
    const effectivePosName = posName || legacyPositionName;

    // Check if position explicitly includes titles like MOП or POП
    const hasManagementTitle = ['моп', 'роп'].some(pos => effectivePosName.includes(pos));

    // Check if they already have management kpi data
    const hasManagementKpi = employee.management_kpi_current != null && employee.management_kpi_current > 0;

    // Commercial director always has dual kpi
    const isCommercial = effectivePosName.includes('коммерческ');

    // Check if it's a Director or Admin (access level >= 90 or by name)
    const empAccessLevel = employee?.position?.access_level ?? 0;
    const isDirectorOrAdmin = empAccessLevel >= 90 || effectivePosName.includes('директор') || effectivePosName.includes('админ');

    // Directors and Admins don't have KPI, unless they are Commercial Directors
    if (isDirectorOrAdmin && !isCommercial) return false;

    return hasManagementTitle || hasManagementKpi || isCommercial;
  }, [employee]);
  const getManagementLabel = (positionName?: string) => {
    if (!positionName) return 'Управление';
    if (positionName.includes('МОП')) return 'Команда';
    if (positionName.includes('РОП')) return 'Отдел';
    if (positionName.includes('Коммерческий')) return 'Агентство';
    return 'Управление';
  };

  const handleBack = () => {
    const from = (location.state as { from?: string })?.from;
    if (from) {
      navigate(from);
    } else {
      navigate('/employees');
    }
  };

  const handleEditSuccess = async () => {
    // Invalidate queries to refresh data without page reload
    await invalidateAllEmployeeQueries(employee.id);
    setIsEditDialogOpen(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await deleteEmployee(employee.id);

      if (error) {
        throw error;
      }

      navigate('/employees');
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Не удалось удалить сотрудника');
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleResetPassword = async () => {
    setIsResettingPassword(true);
    try {
      const result = await localAPI.request(`/users/${employee.id}/password`, {
        method: 'PATCH',
        body: { password: '123456' }
      });

      if (result.error) {
        throw result.error;
      }

      toast.success('Пароль сброшен', {
        description: 'Новый пароль: 123456',
        duration: 10000,
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Не удалось сбросить пароль');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} скопирован в буфер обмена`);
    } catch (err) {
      toast.error('Не удалось скопировать в буфер обмена');
    }
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl md:rounded-[2rem] lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 shadow-2xl focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-2 focus-within:ring-offset-zinc-900 w-full"
      style={{
        "--reduced-motion": "(prefers-reduced-motion: reduce)"
      } as React.CSSProperties}
    >
      {/* Background Banner with Dynamic Gradient */}
      <div className="relative h-32 sm:h-40 md:h-48 lg:h-56 bg-zinc-950 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-zinc-900 to-zinc-950" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" aria-hidden="true" />
        <div className="absolute -top-24 -right-24 w-64 md:w-96 h-64 md:h-96 bg-primary/20 blur-[120px] rounded-full animate-pulse" aria-hidden="true" />
        <div className="absolute -bottom-24 -left-24 w-64 md:w-96 h-64 md:h-96 bg-purple-500/10 blur-[120px] rounded-full" aria-hidden="true" />

        {/* Back Button */}
        <Button
          onClick={handleBack}
          variant="ghost"
          className="absolute top-4 left-4 md:top-6 md:left-6 h-9 md:h-10 px-3 md:px-4 rounded-xl bg-black/20 backdrop-blur-xl border border-white/10 hover:bg-black/40 transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-900"
          aria-label="Вернуться к предыдущей странице"
        >
          <ChevronLeft className="h-4 w-4 mr-1 md:mr-2" aria-hidden="true" />
          <span className="text-xs md:text-sm font-bold">Назад</span>
        </Button>

        {/* Action Buttons - Compact Elite Version */}
        {canEdit && (
          <div className="absolute top-4 right-4 md:top-6 md:right-6 flex items-center gap-2 z-30">
            <Button
              onClick={() => setIsEditDialogOpen(true)}
              className="h-9 md:h-10 px-4 md:px-5 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 border-none font-black text-xs md:text-sm uppercase tracking-wider"
              aria-label="Редактировать профиль"
            >
              <Edit className="h-4 w-4 mr-2" aria-hidden="true" />
              <span>Редактировать</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 md:h-10 w-9 md:w-10 p-0 rounded-xl bg-black/20 backdrop-blur-xl border border-white/10 hover:bg-black/40 transition-all font-black"
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="sr-only">Дополнительные действия</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-zinc-900/95 backdrop-blur-xl border-white/10 rounded-2xl p-2 shadow-2xl">
                <DropdownMenuItem
                  onClick={() => setShowResetPasswordConfirm(true)}
                  disabled={isResettingPassword}
                  className="flex items-center gap-2 p-3 rounded-xl cursor-pointer hover:bg-white/5 text-yellow-500 font-bold focus:bg-white/5 transition-colors"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Сбросить пароль</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/5 my-1" />
                <DropdownMenuItem
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="flex items-center gap-2 p-3 rounded-xl cursor-pointer hover:bg-red-500/10 text-red-500 font-bold focus:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Удалить сотрудника</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Profile Content */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 pb-6 md:pb-8 lg:pb-10">
        {/* Avatar & Status */}
        <div className="relative z-20 flex flex-col sm:flex-row items-start sm:items-end gap-5 md:gap-8 -mt-12 sm:-mt-16 md:-mt-20 mb-6 md:mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/30 rounded-2xl md:rounded-[2rem] blur-[30px] animate-pulse" />
            <Avatar className="relative z-10 h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36 rounded-2xl md:rounded-[2rem] border-4 border-zinc-900 shadow-2xl">
              <AvatarImage src={getAvatarUrl(employee.avatar_url)} className="object-cover" />
              <AvatarFallback className="bg-zinc-800 text-white font-black text-3xl md:text-4xl uppercase rounded-2xl md:rounded-[2rem]">
                {employee.full_name && employee.full_name.length >= 2 ? employee.full_name.substring(0, 2) : 'NA'}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              "absolute -bottom-2 -right-2 h-6 w-6 md:h-7 md:w-7 rounded-xl border-4 border-zinc-900 z-20 shadow-lg",
              employee.is_active ? "bg-primary shadow-[0_0_20px_rgba(var(--primary),0.6)]" : "bg-zinc-500"
            )}
              aria-label={employee.is_active ? "Статус: активен" : "Статус: оффлайн"}
              role="status"
            />
          </div>

          <div className="flex-1 space-y-2 md:space-y-3">

            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white uppercase tracking-tight leading-tight py-1 break-words min-w-0">
                {employee?.full_name ?? 'Сотрудник'}
              </h1>

              <Badge className={cn(
                "px-3 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-wider border",
                employee.is_active
                  ? "bg-primary/10 border-primary/20 text-white"
                  : "bg-zinc-500/10 border-white/5 text-zinc-500"
              )}>
                {employee.is_active ? 'Активен' : 'Оффлайн'}
              </Badge>
              {employee.realtor_type && (
                <Badge className={cn(
                  "px-3 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-wider border",
                  employee.realtor_type === 'secondary' ? 'bg-primary/5 border-primary/10 text-primary' :
                    employee.realtor_type === 'newbuildings' ? 'bg-purple-500/5 border-purple-500/10 text-purple-400' :
                      'bg-white/5 border-white/10 text-white/60'
                )}>
                  {employee.realtor_type === 'secondary' ? 'Вторичка' :
                    employee.realtor_type === 'newbuildings' ? 'Новостройки' : 'Универсал'}
                </Badge>
              )}
            </div>

            <p className="text-xs md:text-sm font-bold text-white/70 uppercase tracking-widest">
              {employee?.position?.name ?? 'Должность не указана'}
            </p>
          </div>
        </div>

        {/* Main Content Area: Info + KPI Integrated */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
          {/* Info Grid - Left Column */}
          <section className="lg:col-span-7 space-y-4" aria-label="Контактная информация">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {/* Email */}
              <div
                onClick={() => employee.email && copyToClipboard(employee.email, 'Email')}
                className="flex items-center gap-3 p-3 md:p-4 rounded-2xl bg-white/[0.03] border border-white/5 cursor-pointer hover:bg-white/[0.06] transition-all group"
              >
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 group-hover:scale-110 transition-transform" aria-hidden="true">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] md:text-[9px] font-black text-white/40 uppercase tracking-widest mb-0.5">Email</p>
                  <p className="text-xs md:text-sm font-bold text-white truncate">{employee?.email ?? '—'}</p>
                </div>
              </div>

              {/* Phone */}
              <div
                onClick={() => employee.phone && copyToClipboard(employee.phone, 'Телефон')}
                className="flex items-center gap-3 p-3 md:p-4 rounded-2xl bg-white/[0.03] border border-white/5 cursor-pointer hover:bg-white/[0.06] transition-all group"
              >
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 group-hover:scale-110 transition-transform" aria-hidden="true">
                  <Phone className="h-4 w-4 text-white/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] md:text-[9px] font-black text-white/40 uppercase tracking-widest mb-0.5">Телефон</p>
                  <p className="text-xs md:text-sm font-bold text-white truncate">{employee?.phone ?? 'Не указан'}</p>
                </div>
              </div>

              {/* Branch & Team Unified */}
              <div className="flex items-center gap-3 p-3 md:p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10" aria-hidden="true">
                  <MapPin className="h-4 w-4 text-white/60" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[8px] md:text-[9px] font-black text-white/40 uppercase tracking-widest mb-0.5">Локация</p>
                  <p className="text-xs md:text-sm font-bold text-white truncate">
                    {employee?.branch?.name ?? '—'} {employee?.team?.name && `• ${employee.team.name}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 md:p-4 rounded-2xl bg-white/[0.03] border border-white/5 transition-all hover:bg-white/[0.06] group">
                <button
                  type="button"
                  onClick={() => {
                    setExtraInfoDialogMode('view');
                    setIsExtraInfoOpen(true);
                  }}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none',
                    'focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
                  )}
                  aria-label="Доп. сведения: просмотр"
                >
                  <div
                    className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0 group-hover:scale-110 transition-transform"
                    aria-hidden="true"
                  >
                    <FileText className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-bold text-white truncate">Доп. сведения</p>
                  </div>
                </button>
                {canEditExtraInfo && (
                  <button
                    type="button"
                    className={cn(
                      'shrink-0 rounded-xl p-2.5 outline-none border border-white/10 bg-white/[0.02]',
                      'text-emerald-400/90 hover:bg-white/[0.08] hover:text-emerald-300',
                      'focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
                    )}
                    aria-label="Редактировать доп. сведения"
                    onClick={() => {
                      setExtraInfoDialogMode('edit');
                      setIsExtraInfoOpen(true);
                    }}
                  >
                    <PencilLine className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>

            </div>
          </section>

          {/* KPI Integrated Column - Right Column */}
          {isRatingParticipant(getPositionName(employee)) && (
            <section className="lg:col-span-5 flex flex-col gap-4" aria-label="Показатели эффективности">
              <div className="relative overflow-hidden p-5 md:p-6 rounded-3xl bg-primary/5 border border-primary/10 group/kpi transition-all hover:bg-primary/10">
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 blur-[40px] rounded-full pointer-events-none" />
                
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/20 border border-primary/30">
                        <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="text-[10px] md:text-[11px] font-black text-white/60 uppercase tracking-widest">Личная ставка</span>
                    </div>
                    <div className="text-xl md:text-2xl font-black text-white">
                      {Math.round(Number(dualKpi?.kpis?.find(k => k.type === 'personal')?.currentPercent || 0))}%
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Progress
                      value={(() => {
                        const min = employee.position?.default_personal_kpi_min || 40;
                        const max = employee.position?.default_personal_kpi_max || 60;
                        const current = dualKpi?.kpis?.find(k => k.type === 'personal')?.currentPercent || min;
                        return Math.min(100, Math.max(0, (current / (max || 1)) * 100));
                      })()}
                      className="h-2.5 bg-white/10 rounded-full"
                      indicatorClassName="bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all duration-1000"
                    />
                    <div className="flex justify-between text-[8px] md:text-[9px] font-bold text-white/30 uppercase tracking-widest">
                      <span>Мин: {employee.position?.default_personal_kpi_min || 40}%</span>
                      <span>Цель: {employee.position?.default_personal_kpi_max || 60}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {isManagementRole && (
                <div className="relative overflow-hidden p-5 md:p-6 rounded-3xl bg-purple-500/5 border border-purple-500/10 group/kpi transition-all hover:bg-purple-500/10">
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/20 blur-[40px] rounded-full pointer-events-none" />
                  
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30">
                          <Target className="h-3.5 w-3.5 text-purple-400" />
                        </div>
                        <span className="text-[10px] md:text-[11px] font-black text-white/60 uppercase tracking-widest">
                          {getManagementLabel(employee?.position?.name)}
                        </span>
                      </div>
                      <div className="text-xl md:text-2xl font-black text-white">
                        {Math.round(Number(dualKpi?.kpis?.find(k => k.type === 'team' || k.type === 'agency' || k.type === 'company')?.currentPercent || employee.management_kpi_current || 0))}%
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Progress
                        value={(() => {
                          const min = employee.position?.default_management_kpi_min || 3;
                          const max = employee.position?.default_management_kpi_max || 5;
                          const current = dualKpi?.kpis?.find(k => k.type === 'team' || k.type === 'agency' || k.type === 'company')?.currentPercent || employee.management_kpi_current || min;
                          return Math.min(100, Math.max(0, (current / (max || 1)) * 100));
                        })()}
                        className="h-2.5 bg-white/10 rounded-full"
                        indicatorClassName="bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all duration-1000"
                      />
                      <div className="flex justify-between text-[8px] md:text-[9px] font-bold text-white/30 uppercase tracking-widest">
                        <span>Мин: {employee.position?.default_management_kpi_min || 3}%</span>
                        <span>Цель: {employee.position?.default_management_kpi_max || 5}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Extra info */}
      <ProfileExtraInfoDialog
        open={isExtraInfoOpen}
        onOpenChange={setIsExtraInfoOpen}
        defaultMode={extraInfoDialogMode}
        employeeId={employee.id}
        canEdit={canEditExtraInfo}
        initial={{
          passport_series_number: employee.passport_series_number,
          extra_phone: employee.extra_phone,
          emergency_contacts: employee.emergency_contacts,
          passport_address: employee.passport_address,
          residential_address: employee.residential_address,
        }}
        onSaved={async () => {
          await invalidateAllEmployeeQueries(employee.id);
        }}
      />

      {/* Edit Dialog */}
      <EditEmployeeDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        employee={employee}
        onSuccess={handleEditSuccess}
      />

      {/* Reset Password Confirmation Dialog */}
      <AlertDialog open={showResetPasswordConfirm} onOpenChange={setShowResetPasswordConfirm}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Сбросить пароль?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">
              Вы уверены, что хотите сбросить пароль для <span className="font-bold text-white">{employee?.full_name ?? 'Сотрудник'}</span>?
              Новый пароль будет установлен на <span className="font-bold text-white">123456</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5" disabled={isResettingPassword}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { handleResetPassword(); setShowResetPasswordConfirm(false); }}
              disabled={isResettingPassword}
              className="bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {isResettingPassword ? 'Сброс...' : 'Сбросить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Удалить сотрудника?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">
              Вы уверены, что хотите удалить сотрудника <span className="font-bold text-white">{employee?.full_name ?? 'Сотрудник'}</span>?
              Это действие нельзя отменить. Все данные сотрудника будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5" disabled={isDeleting}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.header>
  );
}
