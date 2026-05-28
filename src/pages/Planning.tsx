import { useState, useEffect, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Target, Users, TrendingUp, DollarSign,
    Save, Loader2, Building2, BarChart3, Home, Percent
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useEmployeesData, useSharedData } from '@/hooks/useSharedData';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, getAvatarUrl } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { AllocationView } from '@/components/Planning/AllocationView';
import { usePlanAllocations } from '@/hooks/usePlanAllocations';

function Planning() {
    const { user, accessLevel } = useAuth();
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [quarter, setQuarter] = useState<number>(Math.ceil((new Date().getMonth() + 1) / 3));
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');
    const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
    const queryClient = useQueryClient();

    // Target States — без посещаемости, с ипотекой
    const [targets, setTargets] = useState({
        revenue: 15000000,
        deals: 45,
        deposits: 20,
        objects: 60,
        newbuildings: 10,
        mortgage: 15,
    });

    const handleTargetChange = (key: keyof typeof targets, value: number) => {
        setTargets(prev => ({ ...prev, [key]: value }));
    };

    // Только директор и администратор могут планировать
    const canAccess = accessLevel >= 90;

    if (!canAccess) {
        return (
            <MainLayout>
                <div className="flex h-[60vh] items-center justify-center flex-col gap-4 text-muted-foreground">
                    <Target className="h-16 w-16 opacity-20" />
                    <p className="text-lg font-medium">Планирование недоступно для вашей роли</p>
                    <p className="text-sm">Раздел доступен только для Директоров и Администраторов</p>
                </div>
            </MainLayout>
        );
    }

    return <PlanningContent
        user={user} year={year} setYear={setYear} quarter={quarter} setQuarter={setQuarter}
        targets={targets} setTargets={setTargets} handleTargetChange={handleTargetChange}
        selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId}
        selectedTeamId={selectedTeamId} setSelectedTeamId={setSelectedTeamId}
    />;
}

function PlanningContent({ user, year, setYear, quarter, setQuarter, targets, setTargets, handleTargetChange, selectedBranchId, setSelectedBranchId, selectedTeamId, setSelectedTeamId }: any) {
    const queryClient = useQueryClient();
    const [statsPeriod, setStatsPeriod] = useState<'month' | 'quarter'>('month');


    const { data: currentPlan, isLoading: isPlanLoading, refetch: refetchPlan } = useQuery({
        queryKey: ['quarterly-plan', year, quarter, selectedBranchId],
        queryFn: async () => {
            const { data } = await localAPI.request(`/plans?year=${year}&quarter=${quarter}${selectedBranchId && selectedBranchId !== 'all' ? `&branch_id=${selectedBranchId}` : ''}`);
            let plan = null;
            if (data) {
                if (data.data && Array.isArray(data.data)) plan = data.data[0];
                else if (data.plans && Array.isArray(data.plans)) plan = data.plans[0];
                else if (Array.isArray(data)) plan = data[0];
                else if (data.id || data.plan) plan = data.plan || data;
            }
            return plan || null;
        },
        enabled: !!selectedBranchId,
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
    });

    // Fetch all plans when "all branches" is selected for aggregation
    const { data: allPlansData, isLoading: isAllPlansLoading } = useQuery({
        queryKey: ['all-branch-plans', year, quarter],
        queryFn: async () => {
            const { data } = await localAPI.request(`/plans?year=${year}&quarter=${quarter}`);
            if (data?.plans && Array.isArray(data.plans)) return data.plans;
            if (data?.data && Array.isArray(data.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        enabled: selectedBranchId === 'all',
        staleTime: 60_000,
        gcTime: 10 * 60_000,
    });

    // Aggregated totals for "all branches" view
    const aggregatedTotals = useMemo(() => {
        if (selectedBranchId !== 'all' || !allPlansData || !Array.isArray(allPlansData)) {
            return null;
        }
        return allPlansData.reduce((acc, plan) => ({
            revenue: acc.revenue + (Number(plan.target_revenue) || 0),
            deals: acc.deals + (Number(plan.target_deals) || 0),
            deposits: acc.deposits + (Number(plan.target_deposits) || 0),
            objects: acc.objects + (Number(plan.target_objects) || 0),
        }), { revenue: 0, deals: 0, deposits: 0, objects: 0 });
    }, [allPlansData, selectedBranchId]);

    // Централизованные API запросы через useSharedData
    const { branches, teams } = useSharedData();

    // Auto-select first branch when branches load and no selection exists
    useEffect(() => {
        if (branches && branches.length > 0 && !selectedBranchId) {
            setSelectedBranchId(branches[0].id);
            console.log('[Planning] Auto-selected first branch:', branches[0].id);
        }
    }, [branches]);

    // Diagnostic logging for branch selection
    console.log('[Planning] Branches loaded:', branches);
    console.log('[Planning] selectedBranchId:', selectedBranchId);
    console.log('[Planning] branches count:', branches?.length || 0);

    // Фильтрация команд по выбранному филиалу
    const allTeams = useMemo(() => {
        const safeTeams = Array.isArray(teams) ? teams : [];
        if (selectedBranchId && selectedBranchId !== 'all') {
            return safeTeams.filter((t: any) => t.branch_id === selectedBranchId);
        }
        return safeTeams;
    }, [teams, selectedBranchId]);

    // Use centralized employees cache to avoid duplicate /employees requests across pages.
    const { data: sharedEmployees = [] } = useEmployeesData();

    // Fetch allocation data from backend to get accurate employee count
    const { data: allocationData } = usePlanAllocations(year, quarter, selectedBranchId !== 'all' ? selectedBranchId : undefined);

    const employees = useMemo(() => {
        const employeesArray = Array.isArray(sharedEmployees) ? sharedEmployees : [];

        console.log('🔍 [Planning] Step 1 - Raw employees:', {
            total: employeesArray.length,
            sample: employeesArray[0] || null,
            allRoles: [...new Set(employeesArray.map((e: any) => e.position?.name || e.role))]
        });

        // Target agent roles for planning (Russian position names from database)
        const targetRoles = ['риелтор', 'роп', 'моп', 'ипотечный брокер', 'head_sales', 'sales_manager', 'realtor', 'mortgage_broker'];
        let filtered = employeesArray.filter((p: any) => {
            if (!p.is_active) return false;
            // Normalize role: trim whitespace and convert to lowercase for flexible matching
            // Use position.name (from API) or fallback to role for compatibility
            const role = (p.position?.name || p.role || '').toString().trim().toLowerCase();
            return targetRoles.includes(role);
        });

        console.log('🔍 [Planning] Step 2 - After role filter:', {
            count: filtered.length,
            targetRoles,
            sample: filtered[0] || null,
            filteredRoles: [...new Set(filtered.map((e: any) => e.position?.name || e.role))]
        });

        if (selectedBranchId !== 'all') {
            const beforeBranchFilter = filtered.length;
            filtered = filtered.filter((p: any) => p.branch_id === selectedBranchId);
            console.log('🔍 [Planning] Step 3 - After branch filter:', {
                selectedBranchId,
                before: beforeBranchFilter,
                after: filtered.length,
                sample: filtered[0] || null
            });
        }

        if (selectedTeamId !== 'all') {
            const beforeTeamFilter = filtered.length;
            filtered = filtered.filter((p: any) => p.team_id === selectedTeamId);
            console.log('🔍 [Planning] Step 4 - After team filter:', {
                selectedTeamId,
                before: beforeTeamFilter,
                after: filtered.length,
                sample: filtered[0] || null
            });
        }

        const roleWeights: Record<string, number> = {
            director: 100,
            admin: 90,
            administrator: 90,
            commercial: 80,
            head_sales: 70,
            sales_manager: 60,
            mortgage_broker: 55,
            realtor: 50
        };

        const sorted = filtered.sort((a: any, b: any) => {
            const weightA = roleWeights[a.role] || 0;
            const weightB = roleWeights[b.role] || 0;
            if (weightA !== weightB) return weightB - weightA;
            return (a.full_name || '').localeCompare(b.full_name || '');
        });

        console.log('🔍 [Planning] Step 5 - Final result:', {
            count: sorted.length,
            employees: sorted.map((e: any) => ({ name: e.full_name, role: e.role, branch_id: e.branch_id, team_id: e.team_id }))
        });

        return sorted;
    }, [sharedEmployees, selectedBranchId, selectedTeamId]);

    useEffect(() => {
        if (!isPlanLoading) {
            if (selectedBranchId === 'all' && aggregatedTotals) {
                // Use aggregated totals when "all branches" is selected
                setTargets({
                    revenue: Number(aggregatedTotals.revenue) || 15000000,
                    deals: Number(aggregatedTotals.deals) || 45,
                    deposits: Number(aggregatedTotals.deposits) || 20,
                    objects: Number(aggregatedTotals.objects) || 60,
                    newbuildings: 10,
                    mortgage: 15,
                });
            } else if (currentPlan) {
                // Use single plan data for specific branch
                setTargets({
                    revenue: Number(currentPlan.target_revenue) || 15000000,
                    deals: Number(currentPlan.target_deals) || 45,
                    deposits: Number(currentPlan.target_deposits) || 20,
                    objects: Number(currentPlan.target_objects) || 60,
                    newbuildings: Number(currentPlan.target_newbuildings) || 10,
                    mortgage: Number(currentPlan.target_mortgage) || 15,
                });
            }
        }
    }, [currentPlan, aggregatedTotals, isPlanLoading, selectedBranchId, year, quarter]);

    // Calculate activeCount - prefer backend allocation count for consistency with /distribute
    const activeCount = useMemo(() => {
        // Use backend allocation count when available (includes team branch fallback)
        if (allocationData?.total_employees !== undefined) {
            return allocationData.total_employees;
        }
        // Fallback: calculate from frontend data
        const employeesArray = Array.isArray(sharedEmployees) ? sharedEmployees : [];
        const targetRoles = ['риелтор', 'роп', 'моп', 'ипотечный брокер', 'head_sales', 'sales_manager', 'realtor', 'mortgage_broker'];

        let filtered = employeesArray.filter((p: any) => {
            if (!p.is_active) return false;
            const role = (p.position?.name || p.role || '').toString().trim().toLowerCase();
            return targetRoles.includes(role);
        });

        if (selectedBranchId && selectedBranchId !== 'all') {
            filtered = filtered.filter((p: any) => p.branch_id === selectedBranchId);
        }

        return filtered.length;
    }, [sharedEmployees, selectedBranchId, allocationData]);

    const statsDivider = statsPeriod === 'month' ? 3 : 1;
    const perUserRevenue = activeCount > 0 ? Math.round(targets.revenue / statsDivider / activeCount) : 0;


    const distributeMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                year, quarter,
                branch_id: selectedBranchId,
                target_revenue: targets.revenue,
                target_deals: targets.deals,
                target_deposits: targets.deposits,
                target_objects: targets.objects,
                target_newbuildings: targets.newbuildings,
                target_mortgage: targets.mortgage,
            };
            const { data, error } = await localAPI.request('/plans/distribute', { method: 'POST', body: payload });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            toast.success('План успешно сохранен и распределен');
            if (data?.plan) queryClient.setQueryData(['quarterly-plan', year, quarter], data.plan);
            queryClient.invalidateQueries({ queryKey: ['quarterly-plan', year, quarter] });
            refetchPlan();
            queryClient.invalidateQueries({ queryKey: ['plan-allocations', year, quarter] });
            // Comprehensive invalidation for all plan-related queries
            queryClient.invalidateQueries({ queryKey: ['all-branch-plans', year, quarter] });
            queryClient.invalidateQueries({ queryKey: ['rating-all-user-plans'] });
            queryClient.invalidateQueries({ queryKey: ['team-user-plans'] });
            queryClient.invalidateQueries({ queryKey: ['analytics-targets'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            queryClient.invalidateQueries({ queryKey: ['my-kpi-stats-detailed'] });
            queryClient.invalidateQueries({ queryKey: ['dual-kpi-stats'] });
        },
        onError: (err: any) => {
            toast.error(`Ошибка сохранения: ${err.message || 'Неизвестная ошибка'}`);
        }
    });

    return (
        <MainLayout>
            <div className="space-y-3 md:space-y-4 lg:space-y-6 animate-fade-in max-w-[1600px] mx-auto pb-20 px-3 sm:px-4 md:px-6 lg:px-8">

                {/* Header */}
                <div className="relative pt-2 md:pt-4 lg:pt-6 xl:pt-10">
                    <div className="absolute -left-20 -top-20 w-64 h-64 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
                    <div className="relative z-10 footer-gradient p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[3rem] border border-white/5 overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 md:gap-5 lg:gap-8 xl:gap-10">
                            <div className="space-y-2 md:space-y-2.5 lg:space-y-3 xl:space-y-4">
                                <div className="mb-2 md:mb-3">
                                    <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 lg:h-7 w-auto object-contain opacity-40" />
                                </div>
                                <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3">
                                    <div className="h-px w-4 md:w-6 lg:w-8 bg-primary/50" />
                                    <span className="text-[8px] md:text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] lg:tracking-[0.4em] text-primary/60">Стратегическое планирование</span>
                                </div>
                                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter leading-none uppercase">
                                    ПЛАНИРОВАНИЕ <span className="text-white/20">/ ЦЕЛИ</span>
                                </h1>
                                <p className="text-white/40 font-medium max-w-md flex items-center gap-1.5 md:gap-2 uppercase text-[8px] md:text-[9px] lg:text-[10px] tracking-widest leading-loose hidden sm:flex">
                                    <Target className="h-3 w-3 md:h-3.5 md:w-3.5 lg:h-4 lg:w-4 text-primary animate-pulse" />
                                    Установка и распределение целевых показателей эффективности
                                </p>
                            </div>

                            <div className="flex flex-wrap items-end gap-2 md:gap-3 lg:gap-4 min-w-0 w-full xl:w-auto">
                                <div className="flex flex-col gap-1.5 md:gap-2 min-w-0 flex-1 basis-[min(100%,28rem)]">
                                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white/30 ml-2">Отчетный период</span>
                                    <div className="flex bg-white/5 border border-white/10 rounded-lg md:rounded-xl lg:rounded-2xl p-0.5 md:p-1 min-w-0 w-full max-w-full">
                                        <Select value={year.toString()} onValueChange={v => setYear(parseInt(v))}>
                                            <SelectTrigger className="w-[4.5rem] sm:w-[5rem] shrink-0 border-none bg-transparent h-9 md:h-10 lg:h-12 text-[10px] md:text-xs font-black uppercase tracking-widest focus:ring-0 [&>span]:whitespace-nowrap">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-900 border-white/10 rounded-xl">
                                                <SelectItem value={(new Date().getFullYear() - 1).toString()} className="text-xs font-black uppercase py-3">{new Date().getFullYear() - 1}</SelectItem>
                                                <SelectItem value={(new Date().getFullYear()).toString()} className="text-xs font-black uppercase py-3">{new Date().getFullYear()}</SelectItem>
                                                <SelectItem value={(new Date().getFullYear() + 1).toString()} className="text-xs font-black uppercase py-3">{new Date().getFullYear() + 1}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <div className="w-px h-5 md:h-6 bg-white/10 self-center shrink-0" />
                                        <Select value={quarter.toString()} onValueChange={v => setQuarter(parseInt(v))}>
                                            <SelectTrigger className="min-w-0 flex-1 sm:min-w-[15rem] md:min-w-[16rem] border-none bg-transparent h-9 md:h-10 lg:h-12 text-[10px] md:text-xs font-black uppercase tracking-widest focus:ring-0 [&>span]:line-clamp-none [&>span]:whitespace-normal py-1 h-auto min-h-[2.25rem] md:min-h-[2.5rem] lg:min-h-[3rem]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-900 border-white/10 rounded-xl">
                                                <SelectItem value="1" className="text-xs font-black uppercase py-3">Январь - Март</SelectItem>
                                                <SelectItem value="2" className="text-xs font-black uppercase py-3">Апрель - Июнь</SelectItem>
                                                <SelectItem value="3" className="text-xs font-black uppercase py-3">Июль - Сентябрь</SelectItem>
                                                <SelectItem value="4" className="text-xs font-black uppercase py-3">Октябрь - Декабрь</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5 md:gap-2 min-w-0 flex-1 basis-[min(100%,24rem)]">
                                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white/30 ml-2">Филиал</span>
                                    <div className="flex bg-white/5 border border-white/10 rounded-lg md:rounded-xl lg:rounded-2xl p-0.5 md:p-1 min-w-0 w-full">
                                        <Select value={selectedBranchId} onValueChange={v => { console.log('[Planning] Header branch selected:', v); setSelectedBranchId(v); setSelectedTeamId('all'); }}>
                                            <SelectTrigger className="w-full min-w-0 sm:min-w-[18rem] md:min-w-[20rem] max-w-full border-none bg-transparent h-9 md:h-10 lg:h-12 text-[10px] md:text-xs font-black uppercase tracking-widest focus:ring-0 [&>span]:line-clamp-none [&>span]:whitespace-normal py-1 h-auto min-h-[2.25rem] md:min-h-[2.5rem] lg:min-h-[3rem]">
                                                <Building2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 shrink-0 text-primary/60" />
                                                <SelectValue placeholder="Выберите филиал" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-900 border-white/10 rounded-xl">
                                                <SelectItem value="all" className="text-xs font-black uppercase py-3">Все филиалы</SelectItem>
                                                {(branches || []).map((b: any) => (
                                                    <SelectItem key={b.id} value={b.id} className="text-xs font-black uppercase py-3">{b.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Banner */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[3rem] p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-rose-500/10 opacity-50" />
                    <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-4 md:gap-6 lg:gap-8 xl:gap-12">
                        <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-5 lg:gap-6 xl:gap-8 w-full xl:w-auto">
                            <div className="p-3.5 md:p-4 lg:p-5 xl:p-6 rounded-xl md:rounded-[1.5rem] bg-primary/10 border border-primary/20 text-primary shadow-[0_0_30px_rgba(var(--primary-rgb),0.1)]">
                                <TrendingUp className="h-6 w-6 md:h-7 md:w-7 lg:h-8 lg:w-8 xl:h-10 xl:w-10" />
                            </div>
                            <div className="text-center sm:text-left">
                                <h3 className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.2em] md:tracking-[0.3em] mb-1.5 md:mb-2">Общий план выручки</h3>
                                <div className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter flex items-baseline gap-1.5 md:gap-2 lg:gap-3 justify-center sm:justify-start">
                                    {targets.revenue.toLocaleString()} <span className="text-base md:text-lg lg:text-xl font-black text-primary uppercase">₽</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-px xl:h-16 w-full xl:w-px bg-white/5" />
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8 xl:gap-12 flex-1 w-full">
                            <div className="space-y-1.5 md:space-y-2 text-center lg:text-left">
                                <p className="text-[9px] md:text-[10px] text-white/30 uppercase tracking-[0.15em] md:tracking-[0.2em] font-black">Сделки</p>
                                <p className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums">{targets.deals}</p>
                            </div>
                            <div className="space-y-1.5 md:space-y-2 text-center lg:text-left">
                                <p className="text-[9px] md:text-[10px] text-white/30 uppercase tracking-[0.15em] md:tracking-[0.2em] font-black">Задатки</p>
                                <p className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums">{targets.deposits}</p>
                            </div>
                            <div className="space-y-1.5 md:space-y-2 text-center lg:text-left">
                                <p className="text-[9px] md:text-[10px] text-white/30 uppercase tracking-[0.15em] md:tracking-[0.2em] font-black">Объекты</p>
                                <p className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums">{targets.objects}</p>
                            </div>
                            <div className="space-y-1.5 md:space-y-2 text-center lg:text-left">
                                <p className="text-[9px] md:text-[10px] text-white/30 uppercase tracking-[0.15em] md:tracking-[0.2em] font-black">Агентов</p>
                                <p className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums">{activeCount}</p>
                            </div>
                        </div>
                        <div className="flex flex-col items-center xl:items-end gap-2 md:gap-3">
                            <div className="text-[9px] md:text-[10px] text-white/20 font-black uppercase tracking-[0.2em] md:tracking-[0.3em]">Статус</div>
                            <div className={cn(
                                "px-4 md:px-5 lg:px-6 py-1.5 md:py-2 rounded-lg md:rounded-xl lg:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest border transition-all duration-500",
                                selectedBranchId === 'all'
                                    ? "text-blue-500 border-blue-500/30 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                                    : currentPlan
                                        ? "text-primary border-primary/30 bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]"
                                        : "text-amber-500 border-amber-500/30 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                            )}>
                                {selectedBranchId === 'all' ? 'ВСЕ ФИЛИАЛЫ' : currentPlan ? 'ПОДТВЕРЖДЕН' : 'НЕ ЗАДАН'}
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 lg:gap-6">

                    {/* LEFT: Targets */}
                    <div className="lg:col-span-8 space-y-3 md:space-y-4 lg:space-y-6">
                        <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[3rem] overflow-hidden shadow-2xl">
                            <CardHeader className="p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 pb-0">
                                <CardTitle className="flex items-center gap-2 md:gap-3 lg:gap-4 text-base md:text-lg lg:text-xl xl:text-2xl font-black text-white uppercase tracking-tight">
                                    <div className="p-2 md:p-2.5 lg:p-3 bg-primary/10 rounded-lg md:rounded-xl border border-primary/20">
                                        <Target className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 text-primary" />
                                    </div>
                                    Целевые показатели
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 space-y-4 md:space-y-6 lg:space-y-8 xl:space-y-12">

                                {selectedBranchId === 'all' && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 md:p-5 lg:p-6 flex items-start gap-3 md:gap-4">
                                        <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                                            <Users className="h-4 w-4 md:h-5 md:w-5 text-amber-500" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[9px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-1">
                                                Просмотр всех филиалов
                                            </p>
                                            <p className="text-xs md:text-sm text-white/60">
                                                Для изменения показателей выберите конкретный филиал. В режиме "Все филиалы" отображаются только суммарные данные.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Revenue Slider */}
                                <div className="space-y-3 md:space-y-4 lg:space-y-6">
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 md:gap-3">
                                        <Label className="text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em] flex items-center gap-1.5 md:gap-2">
                                            Общая Выручка <span className="text-primary/60 font-black hidden sm:inline">(План на период)</span>
                                        </Label>
                                        <div className="text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tighter flex items-center gap-1.5 md:gap-2 lg:gap-3">
                                            {targets.revenue.toLocaleString()} <span className="text-xs md:text-sm font-black text-primary uppercase">₽</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={[targets.revenue]}
                                        min={1000000}
                                        max={60000000}
                                        step={500000}
                                        onValueChange={v => handleTargetChange('revenue', v[0])}
                                        disabled={selectedBranchId === 'all'}
                                        className={cn("py-3 md:py-4", selectedBranchId === 'all' && "opacity-50 pointer-events-none")}
                                    />
                                </div>

                                <Separator className="bg-white/5" />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 md:gap-x-8 lg:gap-x-12 gap-y-6 md:gap-y-8 lg:gap-y-10">
                                    {/* Deals */}
                                    <div className="space-y-3 md:space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em]">Сделки</Label>
                                            <div className="px-3 md:px-4 py-1 md:py-1.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10 font-black text-white tabular-nums text-xs md:text-sm">
                                                {targets.deals}
                                            </div>
                                        </div>
                                        <Slider value={[targets.deals]} min={10} max={250} step={1}
                                            onValueChange={v => handleTargetChange('deals', v[0])}
                                            disabled={selectedBranchId === 'all'}
                                            className={cn(selectedBranchId === 'all' && "opacity-50 pointer-events-none")} />
                                    </div>

                                    {/* Deposits */}
                                    <div className="space-y-3 md:space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em]">Задатки</Label>
                                            <div className="px-3 md:px-4 py-1 md:py-1.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10 font-black text-white tabular-nums text-xs md:text-sm">
                                                {targets.deposits}
                                            </div>
                                        </div>
                                        <Slider value={[targets.deposits]} min={5} max={120} step={1}
                                            onValueChange={v => handleTargetChange('deposits', v[0])}
                                            disabled={selectedBranchId === 'all'}
                                            className={cn(selectedBranchId === 'all' && "opacity-50 pointer-events-none")} />
                                    </div>

                                    {/* Base Growth */}
                                    <div className="space-y-3 md:space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em]">Рост Базы (Объекты)</Label>
                                            <div className="px-3 md:px-4 py-1 md:py-1.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10 font-black text-white tabular-nums text-xs md:text-sm">
                                                {targets.objects}
                                            </div>
                                        </div>
                                        <Slider value={[targets.objects]} min={20} max={400} step={5}
                                            onValueChange={v => handleTargetChange('objects', v[0])}
                                            disabled={selectedBranchId === 'all'}
                                            className={cn(selectedBranchId === 'all' && "opacity-50 pointer-events-none")} />
                                    </div>

                                    {/* New Buildings */}
                                    <div className="space-y-3 md:space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em]">Новостройки</Label>
                                            <div className="px-3 md:px-4 py-1 md:py-1.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10 font-black text-white tabular-nums text-xs md:text-sm">
                                                {targets.newbuildings}
                                            </div>
                                        </div>
                                        <Slider value={[targets.newbuildings]} min={0} max={80} step={1}
                                            onValueChange={v => handleTargetChange('newbuildings', v[0])}
                                            disabled={selectedBranchId === 'all'}
                                            className={cn(selectedBranchId === 'all' && "opacity-50 pointer-events-none")} />
                                    </div>

                                    {/* Mortgage */}
                                    <div className="space-y-3 md:space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em]">Ипотека</Label>
                                            <div className="px-3 md:px-4 py-1 md:py-1.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10 font-black text-white tabular-nums text-xs md:text-sm">
                                                {targets.mortgage}
                                            </div>
                                        </div>
                                        <Slider value={[targets.mortgage]} min={0} max={100} step={1}
                                            onValueChange={v => handleTargetChange('mortgage', v[0])}
                                            disabled={selectedBranchId === 'all'}
                                            className={cn(selectedBranchId === 'all' && "opacity-50 pointer-events-none")} />
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 md:gap-4 lg:gap-6 pt-3 md:pt-4">
                                    <Button type="button" variant="outline" size="lg"
                                        className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest rounded-lg md:rounded-xl lg:rounded-2xl h-11 md:h-12 lg:h-14 xl:h-16 transition-all duration-300 text-[10px] md:text-xs"
                                        onClick={() => refetchPlan()} disabled={isPlanLoading}>
                                        {isPlanLoading ? <Loader2 className="animate-spin mr-1.5 md:mr-2 lg:mr-3 h-3.5 w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5" /> : <Loader2 className="mr-1.5 md:mr-2 lg:mr-3 h-3.5 w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5" />}
                                        Обновить
                                    </Button>
                                    <Button size="lg"
                                        className="flex-[2] bg-primary hover:bg-primary/80 text-primary-foreground font-black uppercase tracking-[0.15em] md:tracking-[0.2em] rounded-lg md:rounded-xl lg:rounded-2xl h-11 md:h-12 lg:h-14 xl:h-16 shadow-[0_15px_30px_rgba(var(--primary-rgb),0.3)] hover:shadow-[0_20px_40px_rgba(var(--primary-rgb),0.4)] transition-all duration-500 text-[10px] md:text-xs"
                                        disabled={!selectedBranchId || selectedBranchId === 'all' || distributeMutation.isPending}
                                        onClick={() => distributeMutation.mutate()}>
                                        {distributeMutation.isPending ? <Loader2 className="animate-spin mr-1.5 md:mr-2 lg:mr-3 h-3.5 w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5" /> : <Save className="mr-1.5 md:mr-2 lg:mr-3 h-3.5 w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5" />}
                                        Сохранить показатели
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT: Stats */}
                    <div className="lg:col-span-4 space-y-3 md:space-y-4 lg:space-y-6">
                        <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[3rem] overflow-hidden shadow-2xl h-full flex flex-col">
                            <CardHeader className="p-4 sm:p-5 md:p-6 lg:p-8 pb-3 md:pb-4 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="flex items-center gap-2 md:gap-3 text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/40">
                                    <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" /> Показатели отдела
                                </CardTitle>
                                <div className="flex bg-white/5 rounded-lg md:rounded-xl p-0.5 md:p-1 border border-white/10">
                                    <button
                                        onClick={() => setStatsPeriod('month')}
                                        className={cn(
                                            "px-2.5 md:px-3 lg:px-4 py-1 md:py-1.5 text-[8px] md:text-[9px] font-black rounded-md md:rounded-lg transition-all uppercase tracking-widest",
                                            statsPeriod === 'month' ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"
                                        )}
                                    >
                                        МЕС
                                    </button>
                                    <button
                                        onClick={() => setStatsPeriod('quarter')}
                                        className={cn(
                                            "px-2.5 md:px-3 lg:px-4 py-1 md:py-1.5 text-[8px] md:text-[9px] font-black rounded-md md:rounded-lg transition-all uppercase tracking-widest",
                                            statsPeriod === 'quarter' ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"
                                        )}
                                    >
                                        КВ
                                    </button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 sm:p-5 md:p-6 lg:p-8 space-y-6 md:space-y-8 lg:space-y-10 flex-1">
                                <div className="flex items-center justify-between bg-white/5 p-4 md:p-5 lg:p-6 rounded-xl md:rounded-2xl lg:rounded-3xl border border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-widest mb-0.5 md:mb-1">Активных Агентов</span>
                                        <span className="text-3xl md:text-4xl font-black text-white tracking-tighter tabular-nums">{activeCount}</span>
                                    </div>
                                    <div className="p-3 md:p-4 bg-primary/20 rounded-xl md:rounded-2xl border border-primary/20">
                                        <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                                    </div>
                                </div>

                                <div className="space-y-4 md:space-y-5 lg:space-y-6">
                                    <div className="space-y-2 md:space-y-3">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.15em] md:tracking-[0.2em]">Выручка на агента</span>
                                            <span className="text-xs md:text-sm font-black text-primary tabular-nums tracking-tight">{perUserRevenue.toLocaleString()} ₽</span>
                                        </div>
                                        <div className="h-1.5 md:h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                            <motion.div
                                                className="h-full bg-primary"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min((perUserRevenue / (statsPeriod === 'month' ? 1000000 : 3000000)) * 100, 100)}%` }}
                                                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 md:space-y-3">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.15em] md:tracking-[0.2em]">Задатков на агента</span>
                                            <span className="text-xs md:text-sm font-black text-rose-500 tabular-nums tracking-tight">~{(targets.deposits / statsDivider / (activeCount || 1)).toFixed(1)}</span>
                                        </div>
                                        <div className="h-1.5 md:h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                            <motion.div
                                                className="h-full bg-rose-500"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(((targets.deposits / statsDivider / (activeCount || 1)) / (statsPeriod === 'month' ? 8 : 24)) * 100, 100)}%` }}
                                                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 md:space-y-3">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.15em] md:tracking-[0.2em]">Сделок на агента</span>
                                            <span className="text-xs md:text-sm font-black text-primary tabular-nums tracking-tight">~{(targets.deals / statsDivider / (activeCount || 1)).toFixed(1)}</span>
                                        </div>
                                        <div className="h-1.5 md:h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                            <motion.div
                                                className="h-full bg-primary"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(((targets.deals / statsDivider / (activeCount || 1)) / (statsPeriod === 'month' ? 5 : 15)) * 100, 100)}%` }}
                                                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>


                {/* Employee Allocation Section */}
                <div className="mt-6 md:mt-8 lg:mt-12 xl:mt-16 space-y-3 md:space-y-4 lg:space-y-6">
                    <div className="flex items-center gap-2 md:gap-3 border-b border-white/5 pb-3 md:pb-4 lg:pb-6">
                        <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                        <h3 className="text-base md:text-lg lg:text-xl font-black text-white uppercase tracking-tight">
                            Распределение по сотрудникам
                        </h3>
                    </div>
                    <AllocationView year={year} quarter={quarter} branchId={selectedBranchId} />
                </div>
            </div>
        </MainLayout>
    );
}

export default memo(Planning);
