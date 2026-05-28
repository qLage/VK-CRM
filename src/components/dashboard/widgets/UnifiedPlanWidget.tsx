import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, ChevronRight, Users, Eye, FileText, BarChart3, Percent, HandCoins, Award } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useSharedData } from '@/hooks/useSharedData';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function UnifiedPlanWidget({ className, selectedBranchId, onBranchChange, period, onPeriodChange }: { className?: string; selectedBranchId?: string; onBranchChange?: (id: string) => void; period?: 'month' | 'quarter'; onPeriodChange?: (p: 'month' | 'quarter') => void }) {
    const { user, profile, accessLevel } = useAuth();
    const [internalPeriod, setInternalPeriod] = useState<'month' | 'quarter'>('month');
    const [internalBranchId, setInternalBranchId] = useState<string>('all');
    const isDirectorLevel = accessLevel >= 90;
    const isManager = accessLevel >= 50;

    // Sync internal branch state with parent when parent controls it
    useEffect(() => {
        if (selectedBranchId !== undefined && selectedBranchId !== internalBranchId) {
            setInternalBranchId(selectedBranchId);
        }
    }, [selectedBranchId]);

    // Sync internal period state with parent when parent controls it
    useEffect(() => {
        if (period !== undefined && period !== internalPeriod) {
            setInternalPeriod(period);
        }
    }, [period]);

    const effectiveBranchId = selectedBranchId ?? internalBranchId;
    const effectivePeriod = period ?? internalPeriod;
    const setBranchId = (id: string) => {
        setInternalBranchId(id);
        onBranchChange?.(id);
    };
    const setPeriod = (p: 'month' | 'quarter') => {
        setInternalPeriod(p);
        onPeriodChange?.(p);
    };

    const { branches } = useSharedData();

    const { data: kpiStats, isLoading: isKPIStatsLoading } = useQuery({
        queryKey: ['my-kpi-stats-detailed', user?.id, effectivePeriod, effectiveBranchId, isManager, profile?.branch_id],
        queryFn: async () => {
            const actualBranchId = effectiveBranchId;
            const { data } = await localAPI.request(`/kpi/my-stats?period=${effectivePeriod}&branch_id=${actualBranchId}`);
            return data;
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: keepPreviousData,
    });

    if (isKPIStatsLoading) {
        return <Skeleton className={cn("h-full w-full rounded-[2.5rem] opacity-20", className)} />;
    }

    const { metrics } = kpiStats || {};
    const overallPercent = metrics?.planCompletion ?? 0;

    // Расчёт доп. аналитики
    const totalRevenue = metrics?.totalRevenue || 0;
    const planRevenue = metrics?.planRevenue || 1;
    const takes = metrics?.takes || 0;
    const deposits = metrics?.deposits || 0;
    const meetings = metrics?.meetings || 0;
    const showings = metrics?.showings || 0;
    const dealsCount = metrics?.dealsCount || 0;

    const convTakeToDeposit = takes > 0 ? (deposits / takes) * 100 : 0;
    const convMeetingToShowing = meetings > 0 ? (showings / meetings) * 100 : 0;
    const avgDealValue = dealsCount > 0 ? totalRevenue / dealsCount : 0;
    const remaining = Math.max(planRevenue - totalRevenue, 0);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(val);

    const formatCurrencyCompact = (val: number) =>
        new Intl.NumberFormat('ru-RU', {
            style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
            notation: val > 1000000 ? 'compact' : 'standard', compactDisplay: 'short'
        }).format(val);

    const ModalContent = (
        <div className="w-full relative z-10">
            {/* Header Controls */}
            <div className="mb-5 flex flex-col md:flex-row justify-between items-start gap-3">
                <div>
                    <h3 className="font-bold text-lg md:text-xl leading-tight text-white mb-2 text-left">
                        {isDirectorLevel && effectiveBranchId === 'all' ? 'План компании' : (isDirectorLevel || isManager) ? 'План филиала' : 'Мой план'}
                    </h3>
                    {isDirectorLevel && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Select value={effectiveBranchId} onValueChange={setBranchId}>
                                <SelectTrigger className="w-[160px] md:w-[180px] bg-white/5 hover:bg-white/10 border-white/10 text-white rounded-xl h-8 md:h-9 focus:ring-0 focus:ring-offset-0 transition-colors text-xs md:text-sm">
                                    <SelectValue placeholder="Выберите филиал" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-white/10 text-white">
                                    <SelectItem value="all">Все филиалы</SelectItem>
                                    {(Array.isArray(branches) ? branches : []).map((b: { id: string; name: string }) => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                    <PeriodToggle period={effectivePeriod} onChange={setPeriod} />
                    <div className={cn(
                        "flex items-center gap-1.5 px-2.5 md:px-3 py-1 md:py-1.5 rounded-xl text-xs font-bold border",
                        overallPercent >= 75 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-primary/10 text-primary border-primary/20"
                    )}>
                        <TrendingUp className="h-3.5 w-3.5" />
                        {overallPercent.toFixed(0)}%
                    </div>
                </div>
            </div>

            {/* Процент и прогресс */}
            <div className="mb-5">
                <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-5xl md:text-6xl font-black tracking-tighter text-white">
                        {Number(overallPercent).toFixed(0)}
                    </span>
                    <span className="text-2xl md:text-3xl font-bold text-white/40">%</span>
                    <span className="ml-2 text-xs text-white/30 font-medium self-end mb-1">выполнения</span>
                </div>

                <div className="relative h-2.5 w-full bg-white/5 rounded-full overflow-hidden mb-1">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(overallPercent, 100)}%` }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(
                            "h-full rounded-full",
                            overallPercent >= 75 ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                                : "bg-primary shadow-[0_0_12px_var(--primary-glow,rgba(99,102,241,0.4))]"
                        )}
                    />
                </div>
                <div className="flex justify-between text-[10px] text-white/30 font-medium">
                    <span>{formatCurrencyCompact(totalRevenue)}</span>
                    <span>цель: {formatCurrencyCompact(planRevenue)}</span>
                </div>
            </div>

            {/* KPI-карточки */}
            <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-4">
                <ActionMiniStat label="Взятия" value={takes} icon={TrendingUp} color="emerald" />
                <ActionMiniStat label="Задатки" value={deposits} icon={Target} color="blue" />
                <ActionMiniStat label="Встречи" value={meetings} icon={Users} color="purple" />
                <ActionMiniStat label="Показы" value={showings} icon={Eye} color="amber" />
                <ActionMiniStat label="Сделки" value={dealsCount} icon={FileText} color="rose" />
                <ActionMiniStat
                    label="Средний чек"
                    value={formatCurrencyCompact(avgDealValue)}
                    icon={HandCoins}
                    color="amber"
                />
            </div>

            {/* Конверсии */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 mb-4 space-y-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/30 font-black mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Конверсии
                </div>
                <ConversionRow label="Взятие → Задаток" value={convTakeToDeposit} color="blue" />
                <ConversionRow label="Встреча → Показ" value={convMeetingToShowing} color="purple" />
                <ConversionRow
                    label="Выполнение плана"
                    value={overallPercent}
                    color={overallPercent >= 75 ? "emerald" : "amber"}
                />
            </div>

            {/* До плана */}
            {remaining > 0 && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/50 text-xs font-bold uppercase tracking-wider">
                        <Percent className="h-3.5 w-3.5 text-primary" />
                        До выполнения плана
                    </div>
                    <span className="text-primary font-black text-sm">{formatCurrencyCompact(remaining)}</span>
                </div>
            )}

            {/* Бонус агента */}
            {metrics?.estimatedIncome > 0 && !isDirectorLevel && (
                <div className="mt-0 p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-amber-400/70 text-xs font-bold uppercase tracking-wider">
                        <Award className="h-3.5 w-3.5 text-amber-400" />
                        Мой бонус
                    </div>
                    <span className="text-amber-400 font-black text-sm">
                        {formatCurrency(metrics.estimatedIncome)}
                    </span>
                </div>
            )}

            {/* Финансы директора */}
            {isDirectorLevel && kpiStats?.companyFinancials && effectiveBranchId === 'all' && (
                <div className="space-y-2 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] mb-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/30 font-black mb-2">
                        <Award className="h-3 w-3" />
                        Финансы
                    </div>
                    <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                        <span className="text-muted-foreground uppercase font-bold tracking-wider">ФОТ (Комиссии):</span>
                        <span className="text-amber-400 font-bold">
                            {formatCurrency(kpiStats.companyFinancials.fot)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1">
                        <span className="text-muted-foreground font-bold tracking-wider uppercase">Чистая прибыль:</span>
                        <span className="text-emerald-400 font-black">
                            {formatCurrency(kpiStats.companyFinancials.netProfit)}
                        </span>
                    </div>
                </div>
            )}

            <Button
                variant="ghost"
                className="w-full text-xs text-white/40 hover:text-white/80 hover:bg-white/5 h-10 border border-white/5 hover:border-white/10 transition-all rounded-xl"
            >
                Финансовая аналитика <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
        </div>
    );

    const WidgetContent = (
        <div className="flex flex-col h-full justify-between w-full relative z-10">
            <div className="flex items-start justify-between mb-4 md:mb-10">
                <div className="p-3 md:p-4 bg-white/5 rounded-xl md:rounded-2xl backdrop-blur-md border border-white/10 group-hover:bg-primary/20 group-hover:border-primary/30 transition-all duration-700 flex-shrink-0">
                    <Target className="h-6 w-6 md:h-10 md:w-10 text-white" />
                </div>
                <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <PeriodToggle period={effectivePeriod} onChange={setPeriod} small />
                    <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-sm font-black border backdrop-blur-md shadow-lg transition-all duration-500",
                        overallPercent >= 75 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-primary/10 text-primary border-primary/20"
                    )}>
                        <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
                        {overallPercent.toFixed(2)}%
                    </div>
                </div>
            </div>

            <div className="space-y-2 md:space-y-4">
                <div className="space-y-0.5 md:space-y-1">
                    <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.3em] md:tracking-[0.4em]">
                        {isDirectorLevel && effectiveBranchId === 'all' ? 'КОМПАНИИ' : (isDirectorLevel || isManager) ? 'ФИЛИАЛА' : 'РЕЛТОР'} / ВЫПОЛНЕНИЕ
                    </p>
                    <div className="flex items-center justify-between">
                        <h3 className="text-muted-foreground font-black uppercase tracking-wider text-[10px] md:text-xs">ПЛАН ПРОДАЖ</h3>
                        {isDirectorLevel && (
                            <div onClick={(e) => e.stopPropagation()}>
                                <Select value={effectiveBranchId} onValueChange={setBranchId}>
                                    <SelectTrigger className="h-5 md:h-6 w-[80px] md:w-[100px] bg-white/5 hover:bg-white/10 border-white/10 text-[8px] md:text-[9px] font-black text-white/60 rounded focus:ring-0 focus:ring-offset-0 px-1.5 transition-all">
                                        <SelectValue placeholder="ФИЛИАЛ" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-white/10 text-white shadow-2xl rounded-xl">
                                        <SelectItem value="all" className="text-[10px] font-black uppercase tracking-wider">Все</SelectItem>
                                        {(Array.isArray(branches) ? branches : []).map((b: { id: string; name: string }) => (
                                            <SelectItem key={b.id} value={b.id} className="text-[10px] font-black uppercase tracking-wider">{b.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-baseline gap-1 md:gap-2">
                    <span className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-none">
                        {overallPercent.toFixed(0)}<span className="text-2xl md:text-4xl text-white/20">%</span>
                    </span>
                </div>

                <div className="relative w-full h-3 md:h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5 md:p-1">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(overallPercent, 100)}%` }}
                        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(
                            "h-full rounded-full relative overflow-hidden shadow-2xl",
                            overallPercent >= 75 ? "bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]" : "bg-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)]"
                        )}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                    </motion.div>
                </div>

                <div className="flex justify-between items-center">
                    <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-widest mt-1">
                        Выручка: {formatCurrency(totalRevenue)}
                    </p>
                    <div className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-0.5 md:py-1 rounded-lg bg-white/5 border border-white/5 text-[9px] md:text-[10px] font-black text-white/40 group-hover:text-primary transition-colors">
                        ДЕТАЛИ <ChevronRight className="h-2.5 w-2.5 md:h-3 md:w-3" />
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <Dialog>
            <DialogTrigger asChild>
                <motion.div
                    key={`plan-widget-${effectivePeriod}-${effectiveBranchId}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -5, scale: 1.01 }}
                    className={cn(
                        "bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 h-full flex flex-col relative overflow-hidden group hover:bg-zinc-900/60 hover:border-white/10 transition-all duration-700 cursor-pointer shadow-2xl",
                        className
                    )}
                >
                    <div className="absolute top-0 right-0 p-40 bg-primary/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity duration-1000" />
                    {WidgetContent}
                </motion.div>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[600px] p-0 rounded-t-[2rem] md:rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-x-hidden">
                <DialogHeader className="p-4 md:p-8 pb-0 z-20 relative flex-shrink-0">
                    <DialogTitle className="text-xl md:text-2xl font-black text-white flex gap-2 md:gap-3 items-center">
                        <div className="p-2 md:p-2.5 bg-white/5 rounded-lg md:rounded-xl border border-white/5">
                            <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                        </div>
                        Детализация плана
                    </DialogTitle>
                    <DialogDescription className="text-white/40 pt-2 font-medium text-xs md:text-sm">
                        Развернутая статистика по показателям и эффективности за выбранный период.
                    </DialogDescription>
                </DialogHeader>
                <div className="p-4 md:p-8 md:pt-6 relative z-10 w-full overflow-y-auto overflow-x-hidden flex-1 min-h-0">
                    <div className="absolute top-1/2 left-1/2 p-40 bg-primary/20 blur-[120px] rounded-full -translate-y-1/2 -translate-x-1/2 pointer-events-none opacity-40" />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {ModalContent}
                    </motion.div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface ActionMiniStatProps {
    label: string;
    value: string | number;
    icon: any;
    color?: 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'default';
}

function ActionMiniStat({ label, value, icon: Icon, color = 'default' }: ActionMiniStatProps) {
    const colorMap: Record<string, { bg: string; border: string; text: string; icon: string }> = {
        emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/15', text: 'text-emerald-400', icon: 'text-emerald-400' },
        blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/15', text: 'text-blue-400', icon: 'text-blue-400' },
        purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/15', text: 'text-purple-400', icon: 'text-purple-400' },
        amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/15', text: 'text-amber-400', icon: 'text-amber-400' },
        rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/15', text: 'text-rose-400', icon: 'text-rose-400' },
        default: { bg: 'bg-white/5', border: 'border-white/5', text: 'text-white/60', icon: 'text-white/40' },
    };
    const c = colorMap[color] || colorMap.default;

    return (
        <div className={cn("rounded-xl p-3 md:p-4 border flex flex-col justify-between gap-2 transition-all duration-300 hover:scale-[1.02]", c.bg, c.border)}>
            <div className={cn("flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold", c.text)}>
                <Icon className={cn("h-3 w-3", c.icon)} /> {label}
            </div>
            <div className="text-xl md:text-2xl font-black text-white">{value}</div>
        </div>
    );
}

function PeriodToggle({
    period,
    onChange,
    small = false,
}: {
    period: 'month' | 'quarter';
    onChange: (p: 'month' | 'quarter') => void;
    small?: boolean;
}) {
    return (
        <div className={cn(
            "flex items-center rounded-xl border border-white/[0.08] bg-white/[0.05] shadow-inner select-none",
            small ? "p-0.5 gap-0.5" : "p-1 gap-1 rounded-2xl"
        )}>
            <button
                type="button"
                onClick={() => onChange('month')}
                className={cn(
                    "rounded-lg font-bold transition-all duration-200 whitespace-nowrap",
                    small ? "px-2.5 py-1 text-[10px]" : "px-4 py-1.5 text-xs rounded-xl",
                    period === 'month'
                        ? "bg-white text-zinc-900 shadow-md"
                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                )}
            >
                Месяц
            </button>
            <div className="w-px h-3 bg-white/10 flex-shrink-0" />
            <button
                type="button"
                onClick={() => onChange('quarter')}
                className={cn(
                    "rounded-lg font-bold transition-all duration-200 whitespace-nowrap",
                    small ? "px-2.5 py-1 text-[10px]" : "px-4 py-1.5 text-xs rounded-xl",
                    period === 'quarter'
                        ? "bg-white text-zinc-900 shadow-md"
                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                )}
            >
                Квартал
            </button>
        </div>
    );
}

function ConversionRow({ label, value, color }: { label: string; value: number; color: string }) {
    const colorMap: Record<string, string> = {
        emerald: 'bg-emerald-500',
        blue: 'bg-blue-500',
        purple: 'bg-purple-500',
        amber: 'bg-amber-500',
        rose: 'bg-rose-500',
    };
    const bar = colorMap[color] || 'bg-primary';

    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-white/50 font-medium">{label}</span>
                <span className="text-white font-bold">{Number(value || 0).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(value, 100)}%` }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("h-full rounded-full", bar)}
                />
            </div>
        </div>
    );
}
