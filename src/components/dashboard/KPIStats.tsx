// KPIStats - Uses unified KPI API (Plan 02-05)
// All numbers formatted consistently with formatters.ts
// No client-side calculations - backend is source of truth
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Target, CalendarRange, Clock, Info } from 'lucide-react';
import { localAPI } from '@/integrations/localAPI';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/formatters';

interface KPIData {
    metrics: {
        totalRevenue: number;
        currentPercent: number;
        currentThreshold: number;
        nextThreshold: number | null;
        estimatedIncome: number;
        departmentRevenue?: number;
        planCompletion?: number;
        planRevenue?: number;
    };
    role: string;
}

interface MySalaryData {
    total_salary: number;
    personal_income: number;
    team_revenue: number;
    department_revenue: number;
    base_salary: number;
    commission: number;
    period_year: number;
    period_month: number;
}

export function KPIStats() {
    const [incomePeriod, setIncomePeriod] = useState<'month' | 'quarter'>('month');

    // Main quarterly data for the widget
    const { data: quarterData, isLoading: quarterLoading, isError: quarterIsError } = useQuery({
        queryKey: ['kpi-stats-realtor', 'quarter', 'v17'],
        queryFn: async () => {
            const { data, error } = await localAPI.getKPIStats('quarter');
            if (error) throw error;
            return data as KPIData;
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        retry: 2,
    });

    // Secondary data for income toggle (if different from quarter)
    const { data: incomeDataResult } = useQuery({
        queryKey: ['kpi-stats-realtor-income', incomePeriod],
        queryFn: async () => {
            const { data, error } = await localAPI.getKPIStats(incomePeriod);
            if (error) throw error;
            return data as KPIData;
        },
        enabled: incomePeriod === 'month', // Only fetch month if needed (quarter is already in quarterData)
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    // Personal salary data from actual deal payouts (not calculated formula)
    // Use the same period logic as KPI API
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1; // 1-based quarter (same as KPI API)

    // For month view: fetch current month salary
    const { data: monthSalaryData } = useQuery({
        queryKey: ['my-salary', currentYear, currentMonth],
        queryFn: async () => {
            const { data, error } = await localAPI.getMySalary(currentYear, currentMonth);
            if (error) throw error;
            return data as MySalaryData;
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    // For quarter view: fetch all 3 months of the quarter in one call
    const { data: quarterSalaryData } = useQuery({
        queryKey: ['my-salary', currentYear, 'q', currentQuarter],
        queryFn: async () => {
            const { data, error } = await localAPI.getMySalary(currentYear, undefined, currentQuarter);
            if (error) throw error;
            return data as MySalaryData;
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    // Compute personal income from salary data
    const personalIncome = useMemo(() => {
        if (incomePeriod === 'month') {
            return monthSalaryData?.personal_income ?? 0;
        }
        // Quarter: use the quarter endpoint result
        return quarterSalaryData?.personal_income ?? 0;
    }, [incomePeriod, monthSalaryData, quarterSalaryData]);

    if (quarterLoading && !quarterData) {
        return <div className="animate-pulse h-60 bg-white/5 rounded-[2.5rem] opacity-20" />;
    }

    const quarterFallback: KPIData = {
        role: 'realtor',
        metrics: {
            totalRevenue: 0,
            currentPercent: 0,
            currentThreshold: 0,
            nextThreshold: null,
            estimatedIncome: 0,
            planCompletion: 0,
            planRevenue: 0,
        },
    };
    const quarterResolved = quarterData ?? quarterFallback;

    // Use current income period data for income card, otherwise use quarter data
    const activeIncomeData = incomePeriod === 'month' ? (incomeDataResult ?? quarterResolved) : quarterResolved;

    // Defensive destructuring (Plan 04-02)
    const {
        totalRevenue = 0,
        currentPercent = 0,
        planCompletion = 0,
    } = activeIncomeData?.metrics || quarterResolved?.metrics || {};

    // Tier progress is ALWAYS quarterly (revenue ladder doesn't change with month/quarter toggle)
    const {
        nextThreshold: quarterNextThreshold = null,
        totalRevenue: quarterTotalRevenue = 0,
    } = quarterResolved?.metrics || {};

    // Use backend-provided nextThreshold for the primary goal
    const primaryGoal = quarterNextThreshold || 0;
    const currentProgress = primaryGoal > 0 ? Math.min(100, (quarterTotalRevenue / primaryGoal) * 100) : 100;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5, scale: 1.01 }}
            className={cn(
                "relative overflow-hidden rounded-xl md:rounded-[2.5rem] p-6 md:p-10 transition-all duration-700 group h-full flex flex-col justify-between border shadow-2xl bg-zinc-900/40 backdrop-blur-3xl border-white/5 hover:bg-zinc-900/60 hover:border-white/10"
            )}
        >
            {/* Background Glows */}
            <div className="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 blur-[100px] transition-all duration-1000 opacity-40 group-hover:opacity-60" />
            <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-emerald-500/10 blur-[100px] transition-all duration-1000 opacity-20 group-hover:opacity-30" />

            <div className="relative z-10 flex flex-col gap-6 md:gap-10">
                {quarterIsError && quarterData == null && (
                    <p className="text-xs font-bold text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2">
                        Не удалось загрузить KPI с сервера. Показаны нули — попробуйте обновить страницу.
                    </p>
                )}
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="p-3 md:p-5 rounded-xl md:rounded-3xl bg-primary/10 border border-primary/20 text-primary transition-all duration-700 shadow-2xl shadow-primary/10 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                            <Award className="w-6 h-6 md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h3 className="font-black text-2xl md:text-4xl tracking-tighter text-white leading-none uppercase mb-2">
                                МОТИВАЦИЯ & KPI
                            </h3>
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                <p className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/40">
                                    {quarterResolved.role === 'manager' ? 'ЭФФЕКТИВНОСТЬ ОТДЕЛА' : 'ВАША ЭФФЕКТИВНОСТЬ'} / {incomePeriod === 'quarter' ? 'КВАРТАЛ' : 'МЕСЯЦ'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-row items-center gap-4 md:gap-8 self-end md:self-auto">
                            <div className="flex flex-col items-end">
                                <span className="text-xl md:text-3xl font-black text-emerald-400 tabular-nums leading-none mb-1">
                                    {Math.round(planCompletion || 0)}%
                                </span>
                                <span className="text-[9px] md:text-[11px] font-black text-white/30 uppercase tracking-widest">ПЛАН ПРОДАЖ</span>
                            </div>
                        <div className="flex flex-col items-end">
                            <span className="text-xl md:text-3xl font-black text-primary tabular-nums leading-none mb-1">
                                {Math.round(currentPercent ?? 0)}%
                            </span>
                            <span className="text-[9px] md:text-[11px] font-black text-white/30 uppercase tracking-widest">ТЕКУЩАЯ СТАВКА</span>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {/* Revenue Card */}
                    <div className="p-5 md:p-8 rounded-2xl md:rounded-[2rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-500 group/card relative overflow-hidden flex flex-col justify-between gap-4">
                        <div className="absolute top-0 right-0 p-10 bg-blue-500/5 blur-[50px] -translate-y-1/2 translate-x-1/2" />
                        <div className="relative z-10 flex flex-col gap-4">
                            <div className="flex items-center gap-3 text-white/40 mb-1">
                                <TrendingUp className="w-5 h-5" />
                                <span className="text-[10px] md:text-[12px] font-black uppercase tracking-widest">ВАЛОВАЯ ВЫРУЧКА</span>
                            </div>
                            <div className="text-2xl md:text-4xl font-black text-white group-hover/card:text-blue-400 transition-colors tabular-nums tracking-normal">
                                {formatMoney(totalRevenue ?? 0)}
                            </div>
                        </div>
                    </div>

                    {/* Personal Income Card with Toggle */}
                    <div className="col-span-1 md:col-span-1 lg:col-span-2 p-5 md:p-8 rounded-2xl md:rounded-[2rem] bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/30 transition-all duration-500 group/card relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                        <div className="relative z-10 flex flex-col gap-4">
                            <div className="flex items-center gap-3 text-primary/60 mb-1">
                                <Award className="w-5 h-5" />
                                <span className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-primary">ЛИЧНЫЙ ДОХОД</span>
                                <div className="group/tooltip relative">
                                    <Info className="w-3.5 h-3.5 text-primary/40 hover:text-primary cursor-help transition-colors" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 w-72 z-50 pointer-events-none">
                                        <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">ФОРМУЛА РАСЧЁТА</div>
                                        <div className="text-xs text-white font-mono">
                                            Выручка × KPI%<br />
                                            <span className="text-white/50 text-[10px] mt-1 block">
                                                Например: {formatMoney(totalRevenue ?? 0)} × {Math.round(currentPercent ?? 0)}% = {formatMoney(((totalRevenue ?? 0) * (currentPercent ?? 0)) / 100)}
                                            </span>
                                        </div>
                                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-zinc-900 border-r border-b border-white/10" />
                                    </div>
                                </div>
                            </div>
                            <div className="text-3xl md:text-5xl font-black text-white tabular-nums tracking-normal">
                                {formatMoney(personalIncome)}
                            </div>
                            <div className="flex items-center gap-2 text-[9px] md:text-[11px] font-bold text-primary/40 uppercase tracking-tighter">
                                <Clock className="w-3 h-3" />
                                {incomePeriod === 'quarter' ? 'СУММА ЗА ТЕКУЩИЙ КВАРТАЛ' : 'СУММА ЗА ТЕКУЩИЙ МЕСЯЦ'}
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

                {/* Progress Bar Tier */}
                <div className="space-y-6 p-6 md:p-10 rounded-2xl md:rounded-[2rem] bg-white/[0.03] border border-white/5 relative group/progress">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-sm font-medium relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 group-hover/progress:bg-orange-500 group-hover/progress:text-white transition-all duration-500 shadow-2xl shadow-orange-500/10">
                                <Target className="w-6 h-6 md:w-8 md:h-8" />
                            </div>
                            <div>
                                <span className="text-[11px] md:text-[13px] font-black uppercase tracking-widest text-white/50 block mb-1">ПРОГРЕСС УРОВНЯ</span>
                                <span className="text-white text-sm md:text-xl font-black tracking-normal leading-none uppercase">
                                    Следующая ступень
                                </span>
                            </div>
                        </div>
                        <div className="text-left md:text-right">
                           <div className="text-xl md:text-3xl font-black text-white tabular-nums tracking-normal leading-none mb-1">
                                {primaryGoal > 0
                                    ? formatMoney(Math.max(0, primaryGoal - (quarterTotalRevenue ?? 0)))
                                    : 'МАКС. УРОВЕНЬ'}
                            </div>
                           <p className="text-[10px] md:text-[12px] font-black text-white/20 uppercase tracking-widest transition-colors group-hover/progress:text-orange-500/40">
                                ОСТАЛОСЬ ДО СТУПЕНИ
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="relative h-4 md:h-6 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${currentProgress}%` }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className={cn(
                                    "h-full rounded-full shadow-2xl relative bg-primary",
                                )}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                            </motion.div>
                        </div>

                        {primaryGoal > 0 && (
                            <div className="flex justify-between text-[11px] md:text-[13px] font-black text-white/30 uppercase tracking-[0.2em] tabular-nums">
                                <span className="group-hover/progress:text-primary transition-colors">{formatMoney(quarterTotalRevenue ?? 0)}</span>
                                <span className="opacity-50">ЦЕЛЬ: {formatMoney(primaryGoal)}</span>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </motion.div>
    );
}
