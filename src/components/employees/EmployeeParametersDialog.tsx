import { useState, useEffect } from 'react';
import { Loader2, Save, Calendar, FileText, Home, DollarSign, Pencil, Edit, Info, Percent, Zap, Trophy, TrendingUp, Star, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/formatters';

interface EmployeeParametersDialogProps {
    employee: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EmployeeParametersDialog({ employee, open, onOpenChange }: EmployeeParametersDialogProps) {
    const queryClient = useQueryClient();
    const { refreshProfile, user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [isEditingStats, setIsEditingStats] = useState(false);

    const [form, setForm] = useState({
        position_id: '',
        commission_percent: '',
        personal_kpi_current: '',
        management_kpi_current: '',
        team_id: '',
        realtor_type: 'universal',
        custom_total_deals: '',
        custom_total_objects: '',
        custom_total_revenue: '',
        custom_rating: '',
        custom_plan_completion: '',
        custom_growth_trend: '',
        registration_date: ''
    });

    const { data: stats, isLoading: isStatsLoading } = useQuery({
        queryKey: ['employee-full-stats', employee?.id],
        queryFn: async () => {
            const { data } = await localAPI.request(`/employees/${employee?.id}/stats`);
            return data || { deals: 0, listings: 0, revenue: 0, deposits: 0 };
        },
        enabled: open && !!employee?.id,
    });

    useEffect(() => {
        if (employee && open) {
            // Validate and normalize personal KPI on load - must be one of valid tier values
            let personalKpiValue = employee.personal_kpi_current;
            if (personalKpiValue !== null && personalKpiValue !== undefined) {
                const roundedValue = Math.round(personalKpiValue);
                const validPersonalKPIs = [40, 45, 50, 55, 60];
                if (!validPersonalKPIs.includes(roundedValue)) {
                    console.warn(`Invalid personal KPI ${roundedValue} for employee ${employee.id}, resetting to nearest valid value`);
                    // Find nearest valid value
                    personalKpiValue = validPersonalKPIs.reduce((prev, curr) =>
                        Math.abs(curr - roundedValue) < Math.abs(prev - roundedValue) ? curr : prev
                    );
                } else {
                    personalKpiValue = roundedValue;
                }
            }

            // Validate management KPI on load - check eligibility only, allow any positive value
            let managementKpiValue = employee.management_kpi_current;
            if (managementKpiValue !== null && managementKpiValue !== undefined) {
                const roundedValue = Math.round(managementKpiValue);
                // Check if position supports management KPI
                const positionName = employee?.position?.name?.toLowerCase() || '';
                const positionRole = employee?.position?.role?.toLowerCase() || '';
                const isManagementRole = positionName.includes('моп') || positionName.includes('роп') || positionName.includes('коммерческий')
                    || positionRole === 'sales_manager' || positionRole === 'head_sales' || positionRole === 'commercial';
                if (!isManagementRole) {
                    console.warn(`Management KPI set for non-eligible employee ${employee.id}, resetting to null`);
                    managementKpiValue = null;
                } else {
                    managementKpiValue = roundedValue;
                }
            }

            setForm({
                position_id: employee.position_id || '',
                commission_percent: employee.commission_percent !== null && employee.commission_percent !== undefined ? String(employee.commission_percent) : '',
                personal_kpi_current: personalKpiValue !== null && personalKpiValue !== undefined ? String(personalKpiValue) : '',
                management_kpi_current: managementKpiValue !== null && managementKpiValue !== undefined ? String(managementKpiValue) : '',
                team_id: employee.team_id || '',
                realtor_type: employee.realtor_type || 'universal',
                custom_total_deals: employee.custom_total_deals !== null && employee.custom_total_deals !== undefined ? String(employee.custom_total_deals) : '',
                custom_total_objects: employee.custom_total_objects !== null && employee.custom_total_objects !== undefined ? String(employee.custom_total_objects) : '',
                custom_total_revenue: employee.custom_total_revenue !== null && employee.custom_total_revenue !== undefined ? String(employee.custom_total_revenue) : '',
                custom_rating: employee.custom_rating !== null && employee.custom_rating !== undefined ? String(employee.custom_rating) : '',
                custom_plan_completion: employee.custom_plan_completion !== null && employee.custom_plan_completion !== undefined ? String(employee.custom_plan_completion) : '',
                custom_growth_trend: employee.custom_growth_trend !== null && employee.custom_growth_trend !== undefined ? String(employee.custom_growth_trend) : '',
                registration_date: employee.registration_date ? employee.registration_date.split('T')[0] : ''
            });
            setIsEditingStats(false);
        }
    }, [employee, open]);

    const { data: positions = [] } = useQuery({
        queryKey: ['positions'],
        queryFn: async () => {
            const { data } = await localAPI.request('/positions');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        enabled: open,
    });

    const { data: teams = [] } = useQuery({
        queryKey: ['teams-list-dialog'],
        queryFn: async () => {
            const { data } = await localAPI.request('/teams');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        enabled: open,
    });

    // Fetch KPI rules for all roles
    const { data: kpiRulesRealtor } = useQuery({
        queryKey: ['kpi-rules', 'realtor'],
        queryFn: async () => {
            const { data } = await localAPI.getKPIRules('realtor');
            return data?.rules || [];
        },
        enabled: open,
    });

    const { data: kpiRulesMop } = useQuery({
        queryKey: ['kpi-rules', 'sales_manager'],
        queryFn: async () => {
            const { data } = await localAPI.getKPIRules('sales_manager');
            return data?.rules || [];
        },
        enabled: open,
    });

    const { data: kpiRulesRop } = useQuery({
        queryKey: ['kpi-rules', 'head_sales'],
        queryFn: async () => {
            const { data } = await localAPI.getKPIRules('head_sales');
            return data?.rules || [];
        },
        enabled: open,
    });

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // Validate personal KPI - must be one of valid tier values
            const validPersonalKPIs = [40, 45, 50, 55, 60];
            const personalKpiValue = form.personal_kpi_current !== '' ? Math.round(parseFloat(form.personal_kpi_current)) : null;
            if (personalKpiValue !== null && !validPersonalKPIs.includes(personalKpiValue)) {
                toast.error('Личный KPI должен быть 40%, 45%, 50%, 55% или 60%');
                setLoading(false);
                return;
            }

            // Validate management KPI - must be one of valid tier values from kpi_rules
            const positionRole = employee?.position?.role?.toLowerCase() || '';
            const positionName = employee?.position?.name?.toLowerCase() || '';
            const isMop = positionRole === 'sales_manager' || positionName.includes('моп');
            const isRop = positionRole === 'head_sales' || positionName.includes('роп');
            const managementRules = isRop ? kpiRulesRop : isMop ? kpiRulesMop : [];
            const validManagementKPIs = (managementRules || []).map((r: any) => Math.round(Number(r.percent)));
            const managementKpiValue = form.management_kpi_current !== '' ? Math.round(parseFloat(form.management_kpi_current)) : null;
            if (managementKpiValue !== null) {
                if (validManagementKPIs.length > 0 && !validManagementKPIs.includes(managementKpiValue)) {
                    toast.error(`Управленческий KPI должен быть одним из: ${validManagementKPIs.join('%, ')}%`);
                    setLoading(false);
                    return;
                }

                // Check if position supports management KPI
                const positionName = employee?.position?.name?.toLowerCase() || '';
                const positionRole = employee?.position?.role?.toLowerCase() || '';
                const isManagementRole = positionName.includes('моп') || positionName.includes('роп') || positionName.includes('коммерческий')
                    || positionRole === 'sales_manager' || positionRole === 'head_sales' || positionRole === 'commercial';

                if (!isManagementRole) {
                    toast.error('Управленческий KPI доступен только для МОП, РОП и Коммерческого директора');
                    setLoading(false);
                    return;
                }
            }

            const bodyPayload = {
                position_id: form.position_id || null,
                team_id: form.team_id || null,
                realtor_type: form.realtor_type || null,
                commission_percent: form.commission_percent !== '' ? parseFloat(form.commission_percent) : null,
                personal_kpi_current: personalKpiValue,
                management_kpi_current: managementKpiValue,
                custom_total_deals: form.custom_total_deals !== '' ? parseInt(form.custom_total_deals) : null,
                custom_total_objects: form.custom_total_objects !== '' ? parseInt(form.custom_total_objects) : null,
                custom_total_revenue: form.custom_total_revenue !== '' ? parseFloat(form.custom_total_revenue) : null,
                custom_rating: form.custom_rating !== '' ? parseFloat(form.custom_rating) : null,
                custom_plan_completion: form.custom_plan_completion !== '' ? parseFloat(form.custom_plan_completion) : null,
                custom_growth_trend: form.custom_growth_trend !== '' ? parseFloat(form.custom_growth_trend) : null,
                registration_date: form.registration_date || null
            };

            const { error } = await localAPI.request(`/employees/${employee.id}`, {
                method: 'PATCH',
                body: bodyPayload,
            });

            if (error) throw error;

            toast.success(`Параметры сотрудника обновлены`);

            queryClient.invalidateQueries({ queryKey: ['employees'] });
            queryClient.invalidateQueries({ queryKey: ['shared-employees'] });
            queryClient.invalidateQueries({ queryKey: ['team-employees'] });
            queryClient.invalidateQueries({ queryKey: ['employee-full-stats', employee.id] });
            queryClient.invalidateQueries({ queryKey: ['director-stats-real'] });
            queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
            queryClient.invalidateQueries({ queryKey: ['my-kpi-stats-detailed'] });
            queryClient.invalidateQueries({ queryKey: ['analytics-base-data'] });
            queryClient.invalidateQueries({ queryKey: ['reports'] });
            queryClient.invalidateQueries({ queryKey: ['service-requests'] });
            queryClient.invalidateQueries({ queryKey: ['kpi-stats-realtor'] });
            queryClient.invalidateQueries({ queryKey: ['kpi-stats-realtor-income'] });
            queryClient.invalidateQueries({ queryKey: ['dual-kpi'] });
            queryClient.invalidateQueries({ queryKey: ['dual-kpi-stats'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-kpi-stats'] });
            queryClient.invalidateQueries({ queryKey: ['kpi'] });

            if (user?.id === employee.id) {
                await refreshProfile();
            }

            onOpenChange(false);
        } catch (error: any) {
            toast.error(error.message || 'Ошибка при обновлении параметров');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col sm:rounded-[2.5rem] p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-10 pb-4 z-20">
                    <DialogTitle className="text-4xl font-black text-white flex items-center gap-4">
                        <Pencil className="h-8 w-8 text-primary" />
                        ПАРАМЕТРЫ
                    </DialogTitle>
                    <p className="text-white/20 pt-1 font-black uppercase text-[10px] tracking-[0.4em]">
                        Тонкая настройка профиля и KPI
                    </p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-10 pb-10 pt-4 space-y-12 relative z-10 w-full custom-scrollbar">

                    {/* Section: Output Metrics */}
                    <div className="space-y-8">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 flex items-center gap-3">
                                <Trophy className="h-4 w-4" /> Аналитика и достижения
                            </h4>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditingStats(!isEditingStats)}
                                className={cn(
                                    "rounded-xl h-9 text-[10px] font-black uppercase tracking-widest transition-all border",
                                    isEditingStats
                                        ? "bg-white/10 text-white border-white/20"
                                        : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                                )}
                            >
                                <Edit className="h-3.5 w-3.5 mr-2" />
                                {isEditingStats ? "Завершить" : "Изменить"}
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            <StatCard
                                icon={Star}
                                label="Личный рейтинг"
                                color="amber"
                                editing={isEditingStats}
                                value={form.custom_rating}
                                display={employee?.custom_rating ?? '—'}
                                onChange={(val: string) => setForm({ ...form, custom_rating: val })}
                                type="number"
                                suffix=" / 5"
                                editable={true}
                            />

                            <StatCard
                                icon={Target}
                                label="% Выполнения плана"
                                color="primary"
                                editing={false}
                                value={form.custom_plan_completion}
                                display={employee?.custom_plan_completion ?? '—'}
                                onChange={(val: string) => setForm({ ...form, custom_plan_completion: val })}
                                type="number"
                                suffix="%"
                                editable={false}
                            />

                            <StatCard
                                icon={TrendingUp}
                                label="Динамика роста"
                                color="primary"
                                editing={false}
                                value={form.custom_growth_trend}
                                display={employee?.custom_growth_trend ?? '—'}
                                onChange={(val: string) => setForm({ ...form, custom_growth_trend: val })}
                                type="number"
                                suffix="%"
                                editable={false}
                            />

                            <StatCard
                                icon={Trophy}
                                label="Всего сделок"
                                color="purple"
                                editing={false}
                                value={form.custom_total_deals}
                                systemValue={stats?.deals || 0}
                                onChange={(val: string) => setForm({ ...form, custom_total_deals: val })}
                                type="number"
                                editable={false}
                            />

                            <StatCard
                                icon={Home}
                                label="База объектов"
                                color="rose"
                                editing={false}
                                value={form.custom_total_objects}
                                systemValue={stats?.listings || 0}
                                onChange={(val: string) => setForm({ ...form, custom_total_objects: val })}
                                type="number"
                                editable={false}
                            />

                            <StatCard
                                icon={DollarSign}
                                label="Суммарная выручка"
                                color="white"
                                editing={false}
                                value={form.custom_total_revenue}
                                systemValue={stats?.revenue || 0}
                                onChange={(val: string) => setForm({ ...form, custom_total_revenue: val })}
                                type="number"
                                suffix=" ₽"
                                editable={false}
                            />
                        </div>
                    </div>

                    {/* Section: Operational Settings */}
                    <div className="space-y-8 pt-10 border-t border-white/5">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 flex items-center gap-3">
                            <Zap className="h-4 w-4" /> Служебные параметры
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Текущая должность</Label>
                                <Select value={form.position_id} onValueChange={(v) => setForm({ ...form, position_id: v })}>
                                    <SelectTrigger className="bg-white/[0.03] border-white/5 rounded-2xl h-14 text-sm focus:ring-1 focus:ring-white/20 transition-all">
                                        <SelectValue placeholder="Без должности" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-white/10 rounded-2xl shadow-2xl backdrop-blur-3xl">
                                        {(Array.isArray(positions) ? positions : []).map((pos: any) => (
                                            <SelectItem key={pos.id} value={pos.id} className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">{pos.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Процент комиссии</Label>
                                <div className="relative group">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={form.commission_percent}
                                        onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
                                        className="bg-white/[0.03] border-white/5 rounded-2xl h-14 text-sm pl-6 pr-12 font-black tabular-nums focus:ring-1 focus:ring-white/20 transition-all"
                                        placeholder="0"
                                    />
                                    <Percent className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Личный KPI</Label>
                                <Select value={form.personal_kpi_current} onValueChange={(v) => setForm({ ...form, personal_kpi_current: v })}>
                                    <SelectTrigger className={cn(
                                        "bg-white/[0.03] border-white/5 rounded-2xl h-14 text-sm focus:ring-1 focus:ring-primary/30 transition-all",
                                        form.personal_kpi_current && ![40, 45, 50, 55, 60].includes(parseInt(form.personal_kpi_current)) && "border-red-500/50"
                                    )}>
                                        <SelectValue placeholder="Выберите KPI" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-white/10 rounded-2xl shadow-2xl backdrop-blur-3xl">
                                        {kpiRulesData && kpiRulesData.length > 0 ? (
                                            kpiRulesData.map((rule: any) => (
                                                <SelectItem key={rule.percent} value={String(rule.percent)} className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">
                                                    {rule.percent}% {rule.threshold > 0 ? `(от ${formatMoney(rule.threshold)})` : '(базовый)'}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            // Fallback to default 40-60 range if rules not loaded
                                            <>
                                                <SelectItem value="40" className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">40% (базовый)</SelectItem>
                                                <SelectItem value="45" className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">45% (от 700 000₽)</SelectItem>
                                                <SelectItem value="50" className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">50% (от 900 000₽)</SelectItem>
                                                <SelectItem value="55" className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">55% (от 1 200 000₽)</SelectItem>
                                                <SelectItem value="60" className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">60% (от 1 550 000₽)</SelectItem>
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                                {form.personal_kpi_current && ![40, 45, 50, 55, 60].includes(parseInt(form.personal_kpi_current)) && (
                                    <p className="text-[9px] text-red-400 font-black uppercase tracking-widest ml-1 flex items-center gap-2">
                                        <Info className="h-3 w-3" />
                                        Неверное значение KPI! Выберите из списка
                                    </p>
                                )}
                            </div>

                            {(() => {
                                // Management KPI only visible for MOP (МОП), ROP (РОП), and Commercial Director
                                // Check both position name AND position role for reliability
                                const positionName = employee?.position?.name?.toLowerCase() || '';
                                const positionRole = employee?.position?.role?.toLowerCase() || '';
                                const isMopLocal = positionRole === 'sales_manager' || positionName.includes('моп');
                                const isRopLocal = positionRole === 'head_sales' || positionName.includes('роп');
                                const isManagementRole = isMopLocal || isRopLocal || positionName.includes('коммерческий')
                                    || positionRole === 'commercial';
                                const hasManagementKPI = employee?.position?.default_management_kpi_max > 0;

                                if (!isManagementRole || !hasManagementKPI) return null;

                                const rules = isRopLocal ? kpiRulesRop : isMopLocal ? kpiRulesMop : [];
                                return (
                                    <div className="space-y-3">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-purple-400/60 ml-1">Управленческий KPI</Label>
                                        <Select value={form.management_kpi_current} onValueChange={(v) => setForm({ ...form, management_kpi_current: v })}>
                                            <SelectTrigger className="bg-purple-500/[0.03] border-purple-500/10 rounded-2xl h-14 text-sm focus:ring-1 focus:ring-purple-500/30 transition-all">
                                                <SelectValue placeholder="Выберите KPI" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-950 border-white/10 rounded-2xl shadow-2xl backdrop-blur-3xl">
                                                {(rules || []).map((rule: any, idx: number) => (
                                                    <SelectItem key={idx} value={String(Math.round(Number(rule.percent)))} className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">
                                                        {Math.round(Number(rule.percent))}% (план {Math.round(Number(rule.plan_completion || rule.min_threshold))}%)
                                                    </SelectItem>
                                                ))}
                                                {(rules || []).length === 0 && (
                                                    <SelectItem value="3" className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">3%</SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[9px] text-purple-400/30 font-black uppercase tracking-widest ml-1">
                                            Доступные ступени из настроек KPI
                                        </p>
                                    </div>
                                );
                            })()}

                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Отдел / Команда</Label>
                                <Select value={form.team_id || 'none'} onValueChange={(v) => setForm({ ...form, team_id: v === 'none' ? '' : v })}>
                                    <SelectTrigger className="bg-white/[0.03] border-white/5 rounded-2xl h-14 text-sm focus:ring-1 focus:ring-white/20 transition-all">
                                        <SelectValue placeholder="Без команды" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-white/10 rounded-2xl shadow-2xl backdrop-blur-3xl">
                                        <SelectItem value="none" className="text-sm font-bold h-12 rounded-xl">Не выбрана</SelectItem>
                                        {(Array.isArray(teams) ? teams : []).map((t: any) => (
                                            <SelectItem key={t.id} value={t.id} className="text-sm font-bold h-12 rounded-xl focus:bg-white/5">{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Дата регистрации</Label>
                                <div className="relative group">
                                    <Input
                                        type="date"
                                        value={form.registration_date}
                                        onChange={(e) => setForm({ ...form, registration_date: e.target.value })}
                                        className="bg-white/[0.03] border-white/5 rounded-2xl h-14 text-sm pl-6 pr-12 font-black transition-all focus:ring-1 focus:ring-primary/30"
                                    />
                                    <Calendar className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-10 py-8 border-t border-white/5 bg-zinc-950/60 backdrop-blur-3xl flex gap-4 z-20">
                    <Button
                        variant="outline"
                        className="flex-1 bg-white/5 hover:bg-white/10 text-white rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] border-white/5 hover:border-white/20 transition-all"
                        onClick={() => onOpenChange(false)}
                    >
                        Закрыть
                    </Button>
                    <Button
                        className="flex-2 grow-[2] bg-primary hover:bg-primary/90 text-white rounded-2xl h-14 font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-primary/20 transition-all active:scale-[0.98]"
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Save className="h-4 w-4 mr-3" /> Применить изменения</>}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function StatCard({ icon: Icon, label, color, editing, value, display, systemValue, onChange, type, suffix = '', editable = true }: any) {
    const colors: Record<string, string> = {
        primary: "text-primary bg-primary/10 ring-primary/20",
        purple: "text-purple-400 bg-purple-500/10 ring-purple-500/20",
        rose: "text-rose-400 bg-rose-500/10 ring-rose-500/20",
        amber: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
        white: "text-white bg-white/5 ring-white/10"
    };

    return (
        <div className="bg-white/[0.02] p-6 rounded-[2rem] border border-white/5 hover:border-white/10 transition-all duration-500 group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] blur-3xl pointer-events-none group-hover:bg-white/5 transition-all duration-1000" />

            <div className="flex flex-col gap-5">
                <div className={cn("p-4 w-fit rounded-2xl ring-1 ring-inset transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-lg duration-500", colors[color])}>
                    <Icon className="h-5 w-5" />
                </div>

                <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">{label}</p>
                        {systemValue !== undefined && !editing && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-3 w-3 text-white/10 hover:text-white transition-colors cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-zinc-950 border-white/20 text-[10px] font-black uppercase tracking-widest p-2 px-3 shadow-2xl">
                                        <p>Текущее значение: <span className="text-white">{systemValue}{suffix}</span></p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>

                    {editing && editable ? (
                        <div className="relative mt-2">
                            <Input
                                type={type}
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                                className="bg-transparent border-0 border-b border-white/10 h-10 px-0 text-2xl font-black text-white focus-visible:ring-0 focus-visible:border-primary transition-all font-mono rounded-none"
                                placeholder={systemValue !== undefined ? String(systemValue) : "0"}
                            />
                        </div>
                    ) : (
                        <div className="h-10 flex items-baseline gap-1">
                            <span className={cn("text-3xl font-black tabular-nums tracking-tighter transition-colors", value ? "text-white" : "text-white/40")}>
                                {value || display || systemValue || '0'}
                            </span>
                            <span className="text-xs font-black text-white/20 uppercase tracking-widest">{suffix}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
