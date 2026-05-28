import { useState } from 'react';
import { Trophy, TrendingUp, Building2, Wallet, Users, Activity, ChevronRight, Target, ArrowUpRight, ArrowDownRight, Eye, FileText, BarChart3, Percent, HandCoins, Award } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { UnifiedPlanWidget } from './widgets/UnifiedPlanWidget';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const DirectorStatsCards = () => {
    const { profile, accessLevel } = useAuth();
    const isLimitedToBranchScope = accessLevel < 90; // non-director -> own branch scope

    // NOTE: this is used only to force branch scope in the dashboard query.
    const [period, setPeriod] = useState<'month' | 'quarter'>('month');
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

    // Avoid duplicate network calls: branches are already centralized/cached in useSharedData()
    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            const { data } = await localAPI.request('/branches');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 300000,
        gcTime: 600000,
    });

    // NOTE: Ideally replace this query with `useSharedData()` to fully centralize.
    // Kept as-is to avoid larger refactors right now.

    const { data: stats, isLoading } = useQuery({
        queryKey: ['director-stats-real', period, selectedBranchId],
        queryFn: async () => {
            const actualBranchId = isLimitedToBranchScope ? (profile?.branch_id || 'all') : selectedBranchId;
            const { data, error } = await localAPI.getDashboardStats(period, actualBranchId);
            if (error) throw error;
            return data || {
                rating: '-',
                active_deals: 0,
                plan_percent: 0,
                active_branches: 0,
                trends: { revenue: 0, growth: 0 }
            };
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: keepPreviousData,
    });

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-4 md:grid-rows-2 h-auto md:h-[400px]">
                <div className="col-span-2 row-span-2 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
                <div className="col-span-1 row-span-1 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
                <div className="col-span-1 row-span-1 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
                <div className="col-span-2 row-span-1 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3 md:gap-4 md:grid-cols-4 md:grid-rows-2 h-auto">
            {/* 1. Main Plan Card (Unified) */}
            <UnifiedPlanWidget className="col-span-2 row-span-2" selectedBranchId={selectedBranchId} onBranchChange={setSelectedBranchId} period={period} onPeriodChange={setPeriod} />

            {/* 2. Active Deals */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -5, scale: 1.02 }}
                transition={{ delay: 0.1 }}
                className="col-span-1 row-span-1 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-5 md:p-8 rounded-xl md:rounded-[2rem] flex flex-col justify-between hover:bg-zinc-900/60 hover:border-white/10 transition-all duration-500 group relative overflow-hidden shadow-2xl"
            >
                <div className="absolute -top-12 -right-12 p-12 bg-blue-500/20 blur-[60px] rounded-full w-24 h-24 group-hover:opacity-40 transition-all opacity-20" />
                <div className="flex justify-between items-start relative z-10">
                    <div className="p-2 md:p-3 bg-blue-500/10 rounded-lg md:rounded-xl border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-all duration-500">
                        <Activity className="h-4 w-4 md:h-5 md:w-5 text-blue-400 group-hover:text-white" />
                    </div>
                </div>
                <div className="relative z-10 space-y-0.5 md:space-y-1">
                    <div className="text-3xl md:text-5xl font-black text-white leading-none tracking-tighter">{stats?.active_deals}</div>
                    <div className="text-[9px] md:text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">СДЕЛКИ В РАБОТЕ</div>
                </div>
            </motion.div>

            {/* 3. Branches */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -5, scale: 1.02 }}
                transition={{ delay: 0.2 }}
                className="col-span-1 row-span-1 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-5 md:p-8 rounded-xl md:rounded-[2rem] flex flex-col justify-between hover:bg-zinc-900/60 hover:border-white/10 transition-all duration-500 group relative overflow-hidden shadow-2xl"
            >
                <div className="absolute -top-12 -right-12 p-12 bg-purple-500/20 blur-[60px] rounded-full w-24 h-24 group-hover:opacity-40 transition-all opacity-20" />
                <div className="flex justify-between items-start relative z-10">
                    <div className="p-2 md:p-3 bg-purple-500/10 rounded-lg md:rounded-xl border border-purple-500/20 group-hover:bg-purple-500 group-hover:text-white transition-all duration-500">
                        <Building2 className="h-4 w-4 md:h-5 md:w-5 text-purple-400 group-hover:text-white" />
                    </div>
                </div>
                <div className="relative z-10 space-y-0.5 md:space-y-1">
                    <div className="text-3xl md:text-5xl font-black text-white leading-none tracking-tighter">{stats?.active_branches}</div>
                    <div className="text-[9px] md:text-[10px] font-black text-purple-400 uppercase tracking-[0.2em]">ФИЛИАЛЫ</div>
                </div>
            </motion.div>

            {/* 4. Finances */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ y: -5, scale: 1.01 }}
                transition={{ delay: 0.3 }}
                className="col-span-2 row-span-1 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-5 md:p-8 rounded-xl md:rounded-[2rem] flex flex-col justify-between hover:bg-zinc-900/60 hover:border-white/10 transition-all duration-700 group relative overflow-hidden shadow-2xl"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute -top-10 -right-10 p-16 bg-amber-500/20 blur-[80px] rounded-full w-32 h-32 group-hover:opacity-40 transition-all opacity-20" />

                {/* Top row: icon left */}
                <div className="flex justify-between items-start relative z-10">
                    <div className="p-2 md:p-3 bg-amber-500/10 rounded-lg md:rounded-xl border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500">
                        <Wallet className="h-4 w-4 md:h-5 md:w-5 text-amber-400 group-hover:text-white" />
                    </div>
                </div>

                {/* Bottom: amount + label */}
                <div className="relative z-10 space-y-0.5 md:space-y-1">
                    <div className="text-2xl md:text-4xl font-black text-white tracking-tighter leading-none">
                        {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(stats?.trends?.revenue || 0)}
                    </div>
                    <div className="text-[9px] md:text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">ФИНАНСОВЫЙ ОБОРОТ</div>
                </div>
            </motion.div>
        </div>
    );
};

// ─── Переключатель периода ───────────────────────────────────────────
interface PeriodToggleProps {
    period: 'month' | 'quarter';
    onChange: (p: 'month' | 'quarter') => void;
    small?: boolean;
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
            "flex items-center border border-white/[0.08] bg-white/[0.05] shadow-inner select-none",
            small ? "p-0.5 gap-0.5 rounded-xl" : "p-1 gap-0.5 rounded-2xl"
        )}>
            <button
                type="button"
                onClick={() => onChange('month')}
                className={cn(
                    "rounded-lg font-bold transition-all duration-200 whitespace-nowrap",
                    small ? "px-2.5 py-1 text-[10px]" : "px-4 py-2 rounded-xl text-xs",
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
                    small ? "px-2.5 py-1 text-[10px]" : "px-4 py-2 rounded-xl text-xs",
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

function ActionMiniStat({ label, value, icon: Icon, color = 'default' }: any) {
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
                <span className="text-white font-bold">{value}%</span>
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

function StatItem({ label, current, target, format, color }: any) {
    const percent = Math.min(((current || 0) / (target || 1)) * 100, 100);

    const formatValue = (val: number) => {
        if (format === 'currency') {
            return new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                maximumFractionDigits: 0,
                compactDisplay: "short",
                notation: val > 1000000 ? "compact" : "standard"
            }).format(val);
        }
        return val;
    };

    const getColor = (c: string) => {
        switch (c) {
            case 'blue': return 'bg-blue-500';
            case 'emerald': return 'bg-emerald-500';
            case 'amber': return 'bg-amber-500';
            case 'purple': return 'bg-purple-500';
            default: return 'bg-primary';
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-foreground">
                    {formatValue(current)} <span className="text-white/20">/</span> {formatValue(target)}
                </span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    className={cn("h-full rounded-full", getColor(color))}
                />
            </div>
        </div>
    );
}
