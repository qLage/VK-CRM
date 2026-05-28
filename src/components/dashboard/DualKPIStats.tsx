// DualKPIStats - Unified Premium Version (Plan 02-06.1)
// Matches the visual elite style of KPIStats.tsx while combining Personal & Management data
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Target, CalendarRange, Clock, Info } from 'lucide-react';
import { localAPI } from '@/integrations/localAPI';
import { cn } from '@/lib/utils';
import { formatMoney, formatCompactMoney } from '@/utils/formatters';
import { KPIStats } from '@/components/dashboard/KPIStats';

interface KPIMetrics {
    totalDeposits?: number;
    totalObjects?: number;
    totalRevenue: number;
    planDeposits?: number;
    planObjects?: number;
    planRevenue: number;
    planCompletion: number;
    depositsPercent?: number;
    objectsPercent?: number;
    revenuePercent?: number;
    rating?: number;
    currentPercent?: number;
    currentThreshold?: number;
    nextThreshold?: number | null;
    estimatedIncome?: number;
    mopRevenue?: number;
    ropPayout?: number;
    mortgageDeduction?: number;
    otherExpenses?: number;
    baseSalary?: number;
    mortgageBonus?: number;
    managementBonus?: number;
}

interface KPIData {
    type: string;
    displayName: string;
    role: string;
    metrics: KPIMetrics;
    monthly?: (KPIData & { month: number, year: number })[];
    currentPercent?: number;
    planCompletion?: number;
    nextThreshold?: number | null;
}

interface DualKPIResponse {
    hasDualKpi: boolean;
    kpis: KPIData[];
}

export function DualKPIStats() {
    const [incomePeriod, setIncomePeriod] = useState<'month' | 'quarter'>('quarter');
    const queryClient = useQueryClient();
    const { lastMessage } = useWebSocket(null);

    // Listen for real-time updates to invalidate KPI data
    useEffect(() => {
        if (lastMessage && (
            lastMessage.type === 'kpi:updated' || 
            lastMessage.type === 'kpi:settings_updated' || 
            lastMessage.type === 'deal:updated' || 
            lastMessage.type === 'deal:created' ||
            lastMessage.type === 'deal:deleted'
        )) {
            console.log(`[DualKPIStats] Real-time event [${lastMessage.type}] received, refreshing data...`);
            queryClient.invalidateQueries({ queryKey: ['dual-kpi-stats'] });
        }
    }, [lastMessage, queryClient]);

    const { data, isLoading: loading } = useQuery({
        queryKey: ['dual-kpi-stats', 'quarter'],
        queryFn: async () => {
            const { data, error } = await localAPI.getDualKPIStats('quarter');
            if (error) throw error;
            return data as DualKPIResponse;
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Monthly data for income toggle if period = month
    const { data: monthDataResult } = useQuery({
        queryKey: ['dual-kpi-stats', 'month'],
        queryFn: async () => {
            const { data, error } = await localAPI.getDualKPIStats('month');
            if (error) throw error;
            return data as DualKPIResponse;
        },
        enabled: incomePeriod === 'month',
        staleTime: 5 * 60 * 1000,
    });

    if (loading) return <div className="animate-pulse h-80 bg-white/5 rounded-[2.5rem] opacity-20" />;
    if (!data || !data.hasDualKpi || data.kpis.length < 2) {
        // Двойной KPI недоступен (роль/ответ API) — показываем тот же блок «Мотивация & KPI» через единый виджет
        return <KPIStats />;
    }
    // Debug log for zero values
    if (data.kpis.every(kpi => !kpi?.metrics?.totalRevenue || kpi.metrics.totalRevenue === 0)) {
        console.log('[DualKPIStats] All KPIs showing zero revenue:', JSON.stringify(data, null, 2));
    }

    const quarterPersonal = data.kpis[0];
    const quarterManagement = data.kpis[1];

    const activeData = incomePeriod === 'month' ? monthDataResult : data;
    const personal = activeData?.kpis[0] || quarterPersonal;
    const management = activeData?.kpis[1] || quarterManagement;

    const pIncome = personal.metrics.estimatedIncome || 0;
    const mIncome = management.metrics.estimatedIncome || 0;
    const personalCommission = Math.max(0, pIncome - (personal.metrics.baseSalary || 0));

    // totalEstimatedIncome should be the sum of base income and all bonuses
    // With backend fix, management already contains the base salary correctly scaled.
    // We only need to add personal commissions if they exist beyond the personal calculator's own (now 0) base salary.
    const totalEstimatedIncome = mIncome + personalCommission;
    
    const personalRevenue = personal.metrics.totalRevenue || 0;
    const teamRevenue = management.metrics.totalRevenue || 0;
    
    // Progress calculation for next tier (using quarterly as main)
    const pNextThreshold = quarterPersonal.metrics.nextThreshold;
    const pProgress = pNextThreshold ? Math.min(100, (quarterPersonal.metrics.totalRevenue / pNextThreshold) * 100) : quarterPersonal.planCompletion || 0;
    
    // Robust threshold calculation: if completion is < 100% and nextThreshold is null, fallback to 50%
    const rawMNextThreshold = quarterManagement.metrics.nextThreshold;
    const mProgress = quarterManagement.planCompletion || 0;
    const mNextThreshold = (rawMNextThreshold === null || rawMNextThreshold === undefined) && mProgress < 100 ? 50 : rawMNextThreshold;
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "relative overflow-hidden rounded-xl md:rounded-[2.5rem] p-6 md:p-10 transition-all duration-700 group h-full flex flex-col justify-between border shadow-2xl bg-zinc-900/40 backdrop-blur-3xl border-white/5 hover:bg-zinc-900/60 hover:border-white/10"
            )}
        >
            {/* Background Glows */}
            <div className="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 blur-[100px] transition-all duration-1000 opacity-40 group-hover:opacity-60" />
            <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-500/10 blur-[100px] transition-all duration-1000 opacity-20 group-hover:opacity-30" />

            <div className="relative z-10 flex flex-col gap-6 md:gap-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="p-3 md:p-5 rounded-xl md:rounded-3xl bg-primary/10 border border-primary/20 text-primary transition-all duration-700 shadow-2xl shadow-primary/10 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                            <Award className="w-6 h-6 md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h3 className="font-black text-2xl md:text-3xl lg:text-4xl tracking-tighter text-white leading-none uppercase mb-2">
                                МОТИВАЦИЯ & KPI
                            </h3>
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                <p className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/40">
                                    ЭФФЕКТИВНОСТЬ УПРАВЛЕНИЯ / КВАРТАЛ
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-row items-center gap-4 md:gap-8 self-end md:self-auto">
                        <div className="flex flex-col items-end">
                            <span className="text-xl md:text-3xl font-black text-emerald-400 tabular-nums leading-none mb-1">
                                {Math.round(Number(quarterPersonal.currentPercent ?? 0))}%
                            </span>
                            <span className="text-[9px] md:text-[11px] font-black text-white/30 uppercase tracking-widest">ЛИЧНЫЙ KPI</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-xl md:text-3xl font-black text-primary tabular-nums leading-none mb-1">
                                {Math.round(Number(quarterManagement.currentPercent ?? 0))}%
                            </span>
                            <span className="text-[9px] md:text-[11px] font-black text-white/30 uppercase tracking-widest">УПР. KPI</span>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {/* Revenue Card (Personal + Team) */}
                    <div className="p-5 md:p-8 rounded-2xl md:rounded-[2rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-500 group/card relative overflow-hidden flex flex-col justify-between gap-4">
                        <div className="absolute top-0 right-0 p-10 bg-blue-500/5 blur-[50px] -translate-y-1/2 translate-x-1/2" />
                        <div className="relative z-10 flex flex-col gap-6">
                            <div className="flex items-center gap-3 text-white/40">
                                <TrendingUp className="w-5 h-5" />
                                <span className="text-[10px] md:text-[12px] font-black uppercase tracking-widest">ВЫРУЧКА</span>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <div className="text-[9px] font-black text-white/20 uppercase mb-1">ЛИЧНАЯ</div>
                                    <div className="text-xl md:text-2xl font-black text-white group-hover/card:text-blue-400 transition-colors tabular-nums">
                                        {formatMoney(personalRevenue)}
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-white/5">
                                    <div className="text-[9px] font-black text-white/20 uppercase mb-1">КОМАНДА</div>
                                    <div className="text-xl md:text-2xl font-black text-purple-400/80 transition-colors tabular-nums">
                                        {formatMoney(teamRevenue)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Total Income Card (Unified) */}
                    <div className="col-span-1 md:col-span-1 lg:col-span-2 p-5 md:p-8 rounded-2xl md:rounded-[2rem] bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/30 transition-all duration-500 group/card relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                        <div className="relative z-10 flex flex-col gap-4">
                            <div className="flex items-center gap-3 text-primary/60 mb-1">
                                <Award className="w-5 h-5" />
                                <span className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-primary">СУММАРНЫЙ ДОХОД</span>
                                <div className="group/tooltip relative">
                                    <Info className="w-3.5 h-3.5 text-primary/40 hover:text-primary cursor-help transition-colors" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 w-72 z-50 pointer-events-none">
                                        <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">СТРУКТУРА ДОХОДА</div>
                                        <div className="text-xs text-white font-mono space-y-1">
                                            <div>Личный: {formatMoney(personal.metrics.estimatedIncome || 0)}</div>
                                            <div>Управл.: {formatMoney(management.metrics.estimatedIncome || 0)}</div>
                                            <div className="border-t border-white/10 pt-1 mt-1 font-bold">Итого: {formatMoney(totalEstimatedIncome)}</div>
                                        </div>
                                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-zinc-900 border-r border-b border-white/10" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 md:gap-x-4 gap-y-1 mb-2">
                                {(management?.metrics?.baseSalary || personal?.metrics?.baseSalary) ? (
                                    <div className="text-[10px] md:text-[11px] font-black text-primary/40 uppercase tracking-widest flex items-center gap-2">
                                        ОКЛАД: {formatMoney(management?.metrics?.baseSalary ?? personal?.metrics?.baseSalary ?? 0)}
                                    </div>
                                ) : null}
                                {personalCommission > 0 ? (
                                    <div className="text-[10px] md:text-[11px] font-black text-emerald-400/50 uppercase tracking-widest flex items-center gap-2">
                                        ЛИЧНЫЙ: {formatMoney(personalCommission)}
                                    </div>
                                ) : null}
                                {management?.metrics?.managementBonus ? (
                                    <div className="text-[10px] md:text-[11px] font-black text-blue-400/50 uppercase tracking-widest flex items-center gap-2">
                                        КОМАНДА: {formatMoney(management.metrics.managementBonus)}
                                    </div>
                                ) : null}
                                {(personal?.metrics?.mortgageBonus || management?.metrics?.mortgageBonus) ? (
                                    <div className="text-[10px] md:text-[11px] font-black text-amber-500/50 uppercase tracking-widest flex items-center gap-2">
                                        ИПОТЕКА: {formatMoney(management?.metrics?.mortgageBonus ?? personal?.metrics?.mortgageBonus ?? 0)}
                                    </div>
                                ) : null}
                            </div>
                            <div className="text-3xl md:text-5xl font-black text-white tabular-nums tracking-tighter leading-none transition-all group-hover/card:scale-105 origin-left">
                                {formatMoney(totalEstimatedIncome)}
                            </div>
                            <div className="flex items-center gap-2 text-[9px] md:text-[11px] font-bold text-primary/40 uppercase tracking-tighter">
                                <Clock className="w-3 h-3" />
                                {incomePeriod === 'quarter' ? 'РАСЧЁТ ЗА КВАРТАЛ' : 'РАСЧЁТ ЗА МЕСЯЦ'}
                            </div>
                        </div>

                        {/* Period Toggle */}
                        <div className="relative z-20 flex bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-md self-start md:self-auto">
                            <button
                                onClick={() => setIncomePeriod('month')}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                                    incomePeriod === 'month'
                                        ? "bg-white text-zinc-900 shadow-xl scale-105"
                                        : "text-white/40 hover:text-white/70"
                                )}
                            >
                                <CalendarRange className="w-3 h-3" /> МЕСЯЦ
                            </button>
                            <button
                                onClick={() => setIncomePeriod('quarter')}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                                    incomePeriod === 'quarter'
                                        ? "bg-white text-zinc-900 shadow-xl scale-105"
                                        : "text-white/40 hover:text-white/70"
                                )}
                            >
                                <CalendarRange className="w-3 h-3" /> КВАРТАЛ
                            </button>
                        </div>
                    </div>
                </div>

                {/* Progress Bars Section (Double Bars) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
                    {/* Personal Progress */}
                    <div className="space-y-4 p-6 md:p-8 rounded-2xl md:rounded-[2rem] bg-white/[0.03] border border-white/5 relative group/progress">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm font-medium relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-2 md:p-3 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 group-hover/progress:bg-orange-500 group-hover:text-white transition-all duration-500 shadow-lg">
                                    <Target className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50 block mb-1">ПРОГРЕСС УРОВНЯ</span>
                                    <span className="text-white text-sm md:text-lg font-black tracking-normal uppercase">
                                        ЛИЧНЫЙ ПЛАН
                                    </span>
                                </div>
                            </div>
                            <div className="text-left md:text-right">
                               <div className="text-lg md:text-xl font-black text-white tabular-nums tracking-normal leading-none mb-1">
                                    {pNextThreshold
                                        ? formatCompactMoney(Math.max(0, pNextThreshold - quarterPersonal.metrics.totalRevenue))
                                        : 'МАКС. УРОВЕНЬ'}
                                </div>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">ОСТАЛОСЬ</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="relative h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pProgress}%` }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    className="h-full rounded-full shadow-2xl relative bg-primary"
                                />
                            </div>
                            <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-[0.2em] tabular-nums">
                                <span>{formatCompactMoney(quarterPersonal.metrics.totalRevenue)}</span>
                                <span>ЦЕЛЬ: {formatCompactMoney(pNextThreshold || 0)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Team/Management Progress */}
                    <div className="space-y-4 p-6 md:p-8 rounded-2xl md:rounded-[2rem] bg-white/[0.03] border border-white/5 relative group/progress">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm font-medium relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-2 md:p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover/progress:bg-purple-500 group-hover:text-white transition-all duration-500 shadow-lg">
                                    <Target className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50 block mb-1">СЛЕДУЮЩАЯ СТУПЕНЬ</span>
                                    <span className="text-white text-sm md:text-lg font-black tracking-normal uppercase">
                                        КОМАНДНЫЙ ПЛАН
                                    </span>
                                </div>
                            </div>
                            <div className="text-left md:text-right">
                               <div className="text-lg md:text-xl font-black text-white tabular-nums tracking-normal leading-none mb-1">
                                    {mNextThreshold
                                        ? formatCompactMoney(Math.max(0, mNextThreshold - quarterManagement.metrics.totalRevenue))
                                        : 'МАКС. УРОВЕНЬ'}
                                </div>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">ОСТАЛОСЬ</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="relative h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, mProgress)}%` }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    className="h-full rounded-full shadow-2xl relative bg-purple-500"
                                />
                            </div>
                            <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-[0.2em] tabular-nums">
                                <span>{Number(quarterManagement.planCompletion || 0).toFixed(2)}%</span>
                                <span>ЦЕЛЬ: {mNextThreshold || 100}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
