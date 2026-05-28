import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Building2, Users, Percent, Calendar, Edit, Shield, KeyRound, Settings2, Trophy, Star, Target, TrendingUp, Wallet, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getAvatarUrl, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { EmployeeParametersDialog } from './EmployeeParametersDialog';
import { useEmployees } from '@/hooks/useEmployees';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Progress } from '@/components/ui/progress';

interface EmployeeProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: any;
    onEdit: () => void;
    onDeactivate: () => void;
    onResetPassword: () => void;
    canEdit: boolean;
}

export function EmployeeProfileDialog({ open, onOpenChange, employee: initialEmployee, onEdit, onDeactivate, onResetPassword, canEdit }: EmployeeProfileDialogProps) {
    const { employees } = useEmployees();
    const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
    const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
    const [showParams, setShowParams] = useState(false);

    const employee = useMemo(() => {
        if (!initialEmployee) return null;
        return employees.find(e => e.id === initialEmployee.id) || initialEmployee;
    }, [employees, initialEmployee]);

    const { data: dualKpi, isLoading: isLoadingKpi } = useQuery({
        queryKey: ['dual-kpi', employee?.id],
        queryFn: async () => {
            if (!employee?.id) return null;
            const { data } = await localAPI.request(`/kpi/user/${employee.id}/dual-stats?period=quarter`);
            return data;
        },
        enabled: !!employee?.id && open,
        staleTime: 5 * 60 * 1000
    });

    if (!employee) return null;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="w-[95vw] sm:max-w-[650px] max-h-[90vh] bg-zinc-950/98 backdrop-blur-3xl border-white/10 p-0 overflow-y-auto rounded-2xl sm:rounded-[2.5rem] shadow-2xl">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Профиль сотрудника</DialogTitle>
                        <DialogDescription>Детальная информация о сотруднике и управление статусом</DialogDescription>
                    </DialogHeader>

                    {/* Header Banner */}
                    <div className="h-24 sm:h-32 md:h-40 bg-zinc-900/50 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
                        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] bg-[size:2px_2px] opacity-20 mix-blend-overlay" />
                        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-primary/20 blur-[80px] rounded-full" />
                    </div>

                    <div className="px-3 sm:px-4 md:px-6 lg:px-10 pb-4 sm:pb-6 md:pb-10 -mt-10 sm:-mt-12 md:-mt-16 relative z-10">
                        {/* Avatar & Info Row */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-6">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-primary/20 rounded-2xl sm:rounded-3xl blur-[30px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <Avatar className="h-20 w-20 sm:h-28 sm:w-28 md:h-32 md:w-32 rounded-2xl sm:rounded-3xl border-4 border-zinc-950 shadow-2xl ring-1 ring-white/10 relative z-10">
                                    <AvatarImage src={getAvatarUrl(employee.avatar_url)} className="object-cover" />
                                    <AvatarFallback className="bg-zinc-900 text-2xl sm:text-3xl md:text-4xl font-black text-white uppercase tabular-nums">
                                        {employee.full_name?.substring(0, 2)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className={cn(
                                    "absolute bottom-1 right-1 sm:bottom-2 sm:right-2 h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 rounded-lg sm:rounded-xl border-2 sm:border-4 border-zinc-950 z-20 shadow-lg",
                                    employee.is_active ? "bg-primary" : "bg-zinc-600"
                                )} />
                            </div>

                            <div className="flex-1 space-y-2 sm:space-y-3 sm:mb-2">
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                    <Badge className="bg-white/10 text-white border-white/10 h-5 sm:h-6 px-2 sm:px-3 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-wider sm:tracking-widest backdrop-blur-xl">
                                        {employee.is_active ? 'В ШТАТЕ' : 'ОФФЛАЙН'}
                                    </Badge>
                                    <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] sm:tracking-[0.2em] flex items-center gap-1.5 sm:gap-2">
                                        <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                        С {employee.registration_date ? format(new Date(employee.registration_date), 'dd.MM.yyyy') : '—'}
                                    </p>
                                </div>
                                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tighter uppercase leading-none">{employee?.full_name ?? 'Сотрудник'}</h2>
                                <p className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-[0.2em] sm:tracking-[0.4em] flex items-center gap-2 sm:gap-3">
                                    <span className="w-6 sm:w-8 h-px bg-primary/30" />
                                    {employee?.position?.name ?? 'СОТРУДНИК'}
                                </p>
                            </div>
                        </div>

                        {/* Bento Grid Stats */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 md:gap-4 mt-6 sm:mt-8 md:mt-12">
                            <div className="bg-white/[0.03] p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] border border-white/5 space-y-2 sm:space-y-3 group hover:bg-white/5 transition-all">
                                <div className="p-1.5 sm:p-2 md:p-2.5 bg-primary/10 rounded-lg sm:rounded-xl border border-primary/20 w-fit">
                                    <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-base sm:text-lg md:text-[20px] font-black text-white tabular-nums tracking-tighter">
                                        {employee?.custom_total_revenue ? new Intl.NumberFormat('ru-RU').format(employee.custom_total_revenue) : '—'}
                                    </p>
                                    <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest mt-0.5 sm:mt-1">Выручка ₽</p>
                                </div>
                            </div>

                            <div className="bg-white/[0.03] p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] border border-white/5 space-y-2 sm:space-y-3 group hover:bg-white/5 transition-all">
                                <div className="p-1.5 sm:p-2 md:p-2.5 bg-amber-500/10 rounded-lg sm:rounded-xl border border-amber-500/20 w-fit">
                                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-base sm:text-lg md:text-[20px] font-black text-white tabular-nums tracking-tighter">
                                        {employee?.custom_rating ?? '—'}<span className="text-[10px] sm:text-xs text-white/20 ml-0.5 sm:ml-1">/ 5</span>
                                    </p>
                                    <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest mt-0.5 sm:mt-1">Рейтинг</p>
                                </div>
                            </div>

                            <div className="bg-white/[0.03] p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] border border-white/5 space-y-2 sm:space-y-3 group hover:bg-white/5 transition-all">
                                <div className="p-1.5 sm:p-2 md:p-2.5 bg-blue-500/10 rounded-lg sm:rounded-xl border border-blue-500/20 w-fit">
                                    <Target className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-base sm:text-lg md:text-[20px] font-black text-white tabular-nums tracking-tighter">
                                        {employee?.custom_plan_completion ?? '0'}%
                                    </p>
                                    <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest mt-0.5 sm:mt-1">План</p>
                                </div>
                            </div>

                            <div className="bg-white/[0.03] p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-[1.5rem] md:rounded-2xl border border-white/5 space-y-2 sm:space-y-3 group hover:bg-white/5 transition-all">
                                <div className="p-1.5 sm:p-2 md:p-2.5 bg-purple-500/10 rounded-lg sm:rounded-xl border border-purple-500/20 w-fit">
                                    <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-purple-400" />
                                </div>
                                <div>
                                    <p className="text-base sm:text-lg md:text-[20px] font-black text-white tabular-nums tracking-tighter">
                                        {employee?.custom_total_deals ?? '0'}
                                    </p>
                                    <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest mt-0.5 sm:mt-1">Сделки</p>
                                </div>
                            </div>

                            {(() => {
                                const posName = (employee?.position?.name ?? '').toLowerCase();
                                const empAccessLevel = (employee?.position as any)?.access_level ?? 0;
                                const isDirectorOrAdmin = empAccessLevel >= 90 || posName.includes('директор') || posName.includes('админ');
                                const isComm = posName.includes('коммерческий');

                                if (isDirectorOrAdmin && !isComm) return false;
                                return true;
                            })() && (
                                <div className="bg-white/[0.03] p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] border border-primary/10 space-y-2 sm:space-y-3 group hover:bg-white/5 transition-all">
                                    <div className="p-1.5 sm:p-2 md:p-2.5 bg-primary/10 rounded-lg sm:rounded-xl border border-primary/20 w-fit">
                                        <Percent className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-base sm:text-lg md:text-[20px] font-black text-primary tabular-nums tracking-tighter">
                                            {Math.round(dualKpi?.kpis?.find((k: any) => k.type === 'personal')?.currentPercent || 0)}%
                                        </p>
                                        <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest mt-0.5 sm:mt-1">
                                            KPI
                                            {employee?.position?.default_personal_kpi_min && employee?.position?.default_personal_kpi_max && (
                                                <span className="text-primary/30 ml-1">
                                                    ({employee?.position?.default_personal_kpi_min}-{employee?.position?.default_personal_kpi_max}%)
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {(() => {
                                const posName = (employee?.position?.name ?? '').toLowerCase();
                                const empAccessLevel = (employee?.position as any)?.access_level ?? 0;
                                const isDirectorOrAdmin = empAccessLevel >= 90 || posName.includes('директор') || posName.includes('админ');
                                if (isDirectorOrAdmin && !posName.includes('коммерческий')) return false;
                                return (employee?.position?.default_management_kpi_max ?? 0) > 0;
                            })() && (
                                <div className="bg-purple-500/[0.03] p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] border border-purple-500/10 space-y-2 sm:space-y-3 group hover:bg-purple-500/5 transition-all">
                                    <div className="p-1.5 sm:p-2 md:p-2.5 bg-purple-500/10 rounded-lg sm:rounded-xl border border-purple-500/20 w-fit">
                                        <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-base sm:text-lg md:text-[20px] font-black text-purple-400 tabular-nums tracking-tighter">
                                            {Math.round(dualKpi?.kpis?.find((k: any) => k.type !== 'personal')?.currentPercent || 0)}%
                                        </p>
                                        <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest mt-0.5 sm:mt-1">
                                            Управленческий KPI
                                            <span className="text-purple-400/30 ml-1">
                                                ({employee?.position?.default_management_kpi_min}-{employee?.position?.default_management_kpi_max}%)
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Org & Contact Details Section */}
                        <div className="mt-6 sm:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                            {/* Details List */}
                            <div className="lg:col-span-2 space-y-3 sm:space-y-4">
                                <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-white/20 px-1 mb-4 sm:mb-6">Информация и контакты</h4>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                    <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5">
                                        <div className="p-1.5 sm:p-2 bg-zinc-900 rounded-lg">
                                            <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/40" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest">Филиал</p>
                                            <p className="text-[11px] sm:text-xs font-bold text-white truncate">{employee?.branch?.name ?? '—'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5">
                                        <div className="p-1.5 sm:p-2 bg-zinc-900 rounded-lg">
                                            <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/40" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest">Команда</p>
                                            <p className="text-[11px] sm:text-xs font-bold text-white truncate">{employee?.team?.name ?? '—'}</p>
                                        </div>
                                    </div>
                                    <div
                                        className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                        onClick={() => { if (employee?.email) { navigator.clipboard.writeText(employee.email); toast.success('Email скопирован'); } }}
                                    >
                                        <div className="p-1.5 sm:p-2 bg-zinc-900 rounded-lg group-hover:scale-110 transition-transform">
                                            <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/40" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest">Email</p>
                                            <p className="text-[11px] sm:text-xs font-bold text-white truncate">{employee?.email ?? '—'}</p>
                                        </div>
                                    </div>
                                    {employee.phone && (
                                        <div
                                            className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                            onClick={() => { if (employee?.phone) { navigator.clipboard.writeText(employee.phone); toast.success('Телефон скопирован'); } }}
                                        >
                                            <div className="p-1.5 sm:p-2 bg-zinc-900 rounded-lg group-hover:scale-110 transition-transform">
                                                <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/40" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-wider sm:tracking-widest">Телефон</p>
                                                <p className="text-[11px] sm:text-xs font-bold text-white tracking-widest">{employee?.phone ?? '—'}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Sidebar Actions */}
                            <div className="flex flex-col gap-2 sm:gap-3 justify-end pb-1">
                                {canEdit && (
                                    <>
                                        <Button
                                            className="h-10 sm:h-11 md:h-12 w-full rounded-xl sm:rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-wide sm:tracking-widest text-[10px] sm:text-[9px] shadow-xl shadow-primary/20 group"
                                            onClick={() => setShowParams(true)}
                                        >
                                            <Settings2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-2 sm:mr-3 group-hover:rotate-90 transition-transform duration-500" />
                                            Параметры
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-10 sm:h-11 md:h-12 w-full rounded-xl sm:rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-wide sm:tracking-widest text-[10px] sm:text-[9px]"
                                            onClick={() => setShowResetPasswordConfirm(true)}
                                        >
                                            <KeyRound className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-2 sm:mr-3" />
                                            Пароль
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-10 sm:h-11 md:h-12 w-full rounded-xl sm:rounded-2xl bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/10 text-rose-400 font-black uppercase tracking-wide sm:tracking-widest text-[10px] sm:text-[9px] mt-1 sm:mt-2"
                                            onClick={() => setShowDeactivateConfirm(true)}
                                        >
                                            <Shield className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-2 sm:mr-3" />
                                            Удалить
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <AlertDialog open={showDeactivateConfirm} onOpenChange={setShowDeactivateConfirm}>
                        <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-[2.5rem] p-10">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-3xl font-black text-white tracking-tighter uppercase">Удаление доступа</AlertDialogTitle>
                                <AlertDialogDescription className="text-white/40 font-bold pt-4 text-sm uppercase tracking-wider leading-relaxed">
                                    Вы подтверждаете деактивацию <span className="text-white">{employee.full_name}</span>?
                                    <br /><br />
                                    ВХОД В СИСТЕМУ БУДЕТ ЗАБЛОКИРОВАН.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="pt-8 gap-4">
                                <AlertDialogCancel className="bg-white/5 border-white/5 hover:bg-white/10 text-white rounded-2xl h-14 uppercase font-black text-[10px] tracking-widest">Отмена</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => { onDeactivate(); setShowDeactivateConfirm(false); onOpenChange(false); }}
                                    className="bg-rose-600 hover:bg-rose-700 text-white border-0 rounded-2xl h-14 uppercase font-black text-[10px] tracking-[0.2em] shadow-2xl shadow-rose-500/20"
                                >
                                    Деактивировать
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog open={showResetPasswordConfirm} onOpenChange={setShowResetPasswordConfirm}>
                        <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-[2.5rem] p-10">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-3xl font-black text-white tracking-tighter uppercase">Сброс пароля</AlertDialogTitle>
                                <AlertDialogDescription className="text-white/40 font-bold pt-4 text-sm uppercase tracking-wider leading-relaxed">
                                    СБРОСИТЬ ПАРОЛЬ ДЛЯ <span className="text-white">{employee.full_name}</span> НА СТАНДАРТНЫЙ (123456)?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="pt-8 gap-4">
                                <AlertDialogCancel className="bg-white/5 border-white/5 hover:bg-white/10 text-white rounded-2xl h-14 uppercase font-black text-[10px] tracking-widest">Отмена</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => { onResetPassword(); setShowResetPasswordConfirm(false); }}
                                    className="bg-primary hover:bg-primary/90 text-white border-0 rounded-2xl h-14 uppercase font-black text-[10px] tracking-[0.2em] shadow-2xl shadow-primary/20"
                                >
                                    СБРОСИТЬ
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                </DialogContent>
            </Dialog>

            <EmployeeParametersDialog
                open={showParams}
                onOpenChange={setShowParams}
                employee={employee}
            />
        </>
    );
}
