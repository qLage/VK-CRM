import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Save, RussianRuble, TrendingUp, Users, AlertCircle, Award, Target, BarChart3, Zap, Percent, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { localAPI } from '@/integrations/localAPI';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface RealtorThreshold {
    min_threshold: number;
    percent: number;
}

interface MopPercentage {
    plan_completion: number;
    percent: number;
}

interface RopPercentage {
    plan_completion: number;
    percent: number;
}

interface KpiSettings {
    realtor: {
        thresholds: RealtorThreshold[];
    };
    mop: {
        percentages: MopPercentage[];
    };
    rop: {
        percentages: RopPercentage[];
    };
}

const DEFAULT_SETTINGS: KpiSettings = {
    realtor: {
        thresholds: [
            { min_threshold: 0, percent: 40 },
            { min_threshold: 700000, percent: 45 },
            { min_threshold: 900000, percent: 50 },
            { min_threshold: 1200000, percent: 55 },
            { min_threshold: 1550000, percent: 60 },
        ],
    },
    mop: {
        percentages: [
            { plan_completion: 50, percent: 3 },
            { plan_completion: 95, percent: 4 },
            { plan_completion: 120, percent: 5 },
        ],
    },
    rop: {
        percentages: [
            { plan_completion: 50, percent: 3 },
            { plan_completion: 75, percent: 4 },
            { plan_completion: 95, percent: 5 },
            { plan_completion: 120, percent: 6 },
        ],
    },
};

function formatKpiRub(value: number) {
    return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

export function KpiSettings() {
    const queryClient = useQueryClient();
    const [settings, setSettings] = useState<KpiSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const { data } = await localAPI.request('/kpi-settings');
            if (data?.success && data.settings) {
                setSettings(data.settings);
            }
        } catch (error) {
            console.error('Failed to load KPI settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            const { data, error } = await localAPI.request('/kpi-settings', {
                method: 'POST',
                body: { settings },
            });

            if (data?.success) {
                setShowSaveDialog(false);
                // Invalidate all KPI-related caches so changes reflect immediately
                queryClient.invalidateQueries({ queryKey: ['kpi'] });
                queryClient.invalidateQueries({ queryKey: ['dual-kpi'] });
                queryClient.invalidateQueries({ queryKey: ['dual-kpi-stats'] });
                queryClient.invalidateQueries({ queryKey: ['kpi-stats-realtor'] });
                queryClient.invalidateQueries({ queryKey: ['kpi-stats-realtor-income'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-kpi-stats'] });
                queryClient.invalidateQueries({ queryKey: ['my-kpi-stats-detailed'] });
                queryClient.invalidateQueries({ queryKey: ['my-kpi-stats-personal-plan-widget'] });
                queryClient.invalidateQueries({ queryKey: ['employee-full-stats'] });
                queryClient.invalidateQueries({ queryKey: ['employee-profile-stats'] });
                queryClient.invalidateQueries({ queryKey: ['analytics-kpi-current'] });
                queryClient.invalidateQueries({ queryKey: ['analytics-kpi-prev'] });
                queryClient.invalidateQueries({ queryKey: ['kpi-rules'] });
            } else {
                alert('Ошибка сохранения: ' + (error?.message || 'Неизвестная ошибка'));
            }
        } catch (error: any) {
            alert('Ошибка сохранения: ' + (error?.message || 'Неизвестная ошибка'));
        } finally {
            setSaving(false);
        }
    };

    // ── Realtor helpers ──
    const addRealtorThreshold = () => {
        setSettings(prev => {
            const last = prev.realtor.thresholds[prev.realtor.thresholds.length - 1];
            const nextMin = last ? last.min_threshold + 200000 : 0;
            const nextPercent = last ? Math.min(last.percent + 5, 95) : 40;
            return {
                ...prev,
                realtor: {
                    thresholds: [...prev.realtor.thresholds, { min_threshold: nextMin, percent: nextPercent }],
                },
            };
        });
    };

    const removeRealtorThreshold = (index: number) => {
        setSettings(prev => ({
            ...prev,
            realtor: {
                thresholds: prev.realtor.thresholds.filter((_, i) => i !== index),
            },
        }));
    };

    const moveRealtorThreshold = (index: number, direction: 'up' | 'down') => {
        setSettings(prev => {
            const arr = [...prev.realtor.thresholds];
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= arr.length) return prev;
            [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
            return { ...prev, realtor: { thresholds: arr } };
        });
    };

    const updateRealtorThreshold = (index: number, field: keyof RealtorThreshold, value: number) => {
        setSettings(prev => ({
            ...prev,
            realtor: {
                thresholds: prev.realtor.thresholds.map((t, i) =>
                    i === index ? { ...t, [field]: value } : t
                ),
            },
        }));
    };

    // ── MOP helpers ──
    const addMopPercentage = () => {
        setSettings(prev => {
            const last = prev.mop.percentages[prev.mop.percentages.length - 1];
            const nextPlan = last ? last.plan_completion + 25 : 50;
            const nextPercent = last ? Math.min(last.percent + 1, 20) : 3;
            return {
                ...prev,
                mop: {
                    ...prev.mop,
                    percentages: [...prev.mop.percentages, { plan_completion: nextPlan, percent: nextPercent }],
                },
            };
        });
    };

    const removeMopPercentage = (index: number) => {
        setSettings(prev => ({
            ...prev,
            mop: {
                ...prev.mop,
                percentages: prev.mop.percentages.filter((_, i) => i !== index),
            },
        }));
    };

    const moveMopPercentage = (index: number, direction: 'up' | 'down') => {
        setSettings(prev => {
            const arr = [...prev.mop.percentages];
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= arr.length) return prev;
            [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
            return { ...prev, mop: { ...prev.mop, percentages: arr } };
        });
    };

    const updateMopPercentage = (index: number, field: keyof MopPercentage, value: number) => {
        setSettings(prev => ({
            ...prev,
            mop: {
                ...prev.mop,
                percentages: prev.mop.percentages.map((p, i) =>
                    i === index ? { ...p, [field]: value } : p
                ),
            },
        }));
    };

    // ── ROP helpers ──
    const addRopPercentage = () => {
        setSettings(prev => {
            const last = prev.rop.percentages[prev.rop.percentages.length - 1];
            const nextPlan = last ? last.plan_completion + 25 : 50;
            const nextPercent = last ? Math.min(last.percent + 1, 20) : 3;
            return {
                ...prev,
                rop: {
                    ...prev.rop,
                    percentages: [...prev.rop.percentages, { plan_completion: nextPlan, percent: nextPercent }],
                },
            };
        });
    };

    const removeRopPercentage = (index: number) => {
        setSettings(prev => ({
            ...prev,
            rop: {
                ...prev.rop,
                percentages: prev.rop.percentages.filter((_, i) => i !== index),
            },
        }));
    };

    const moveRopPercentage = (index: number, direction: 'up' | 'down') => {
        setSettings(prev => {
            const arr = [...prev.rop.percentages];
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= arr.length) return prev;
            [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
            return { ...prev, rop: { ...prev.rop, percentages: arr } };
        });
    };

    const updateRopPercentage = (index: number, field: keyof RopPercentage, value: number) => {
        setSettings(prev => ({
            ...prev,
            rop: {
                ...prev.rop,
                percentages: prev.rop.percentages.map((p, i) =>
                    i === index ? { ...p, [field]: value } : p
                ),
            },
        }));
    };

    // ── Example calculations ──
    const calculateRealtorIncome = (revenue: number, thresholds: RealtorThreshold[]) => {
        let percent = thresholds[0]?.percent || 0;
        for (const t of thresholds) {
            if (revenue >= t.min_threshold) {
                percent = t.percent;
            }
        }
        return (revenue * percent) / 100;
    };

    const getRealtorExampleRevenue = (index: number) => {
        const examples = [600000, 900000, 1200000, 1600000, 2000000];
        return examples[index % examples.length];
    };

    const getMopExampleRevenue = (index: number, percentages: MopPercentage[]) => {
        const examples = [1500000, 3000000, 4500000, 6000000];
        return examples[index % examples.length];
    };

    const getRopExampleRevenue = (index: number, percentages: RopPercentage[]) => {
        const examples = [3000000, 6000000, 9000000, 12000000];
        return examples[index % examples.length];
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-t-2 border-primary animate-spin" />
                    <Zap className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 md:space-y-12 lg:space-y-16 pb-20">
            {/* ═══ REALTOR SECTION ═══ */}
            <section className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/0 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
                <div className="relative p-6 md:p-8 lg:p-10 rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                        <div className="flex items-center gap-4 lg:gap-6">
                            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                                <Award className="h-7 w-7 lg:h-8 lg:w-8 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">Риелторы</h3>
                                <p className="text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] lg:tracking-[0.3em] mt-1">Прогрессивная шкала вознаграждения от выручки</p>
                            </div>
                        </div>
                        <Button
                            onClick={addRealtorThreshold}
                            variant="outline"
                            className="h-12 px-6 rounded-xl border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-black uppercase tracking-widest text-[10px]"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Добавить уровень
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {settings.realtor.thresholds.map((threshold, index) => {
                            const exampleRevenue = getRealtorExampleRevenue(index);
                            return (
                                <motion.div
                                    key={index}
                                    whileHover={{ y: -5 }}
                                    className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all duration-300 group/card relative overflow-hidden shadow-xl"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover/card:opacity-10 transition-opacity">
                                        <BarChart3 className="h-16 w-16 text-emerald-500" />
                                    </div>
                                    
                                    <div className="relative z-10 space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5">Уровень {index + 1}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="text-2xl font-black text-emerald-400 tracking-tighter">
                                                    {threshold.percent}%
                                                </div>
                                                {settings.realtor.thresholds.length > 1 && (
                                                    <button
                                                        onClick={() => removeRealtorThreshold(index)}
                                                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors ml-1"
                                                        title="Удалить уровень"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block ml-1">Мин. Выручка</label>
                                                <div className="relative">
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-emerald-500/50">
                                                        <TrendingUp className="h-4 w-4" />
                                                        <RussianRuble className="h-4 w-4" />
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        value={threshold.min_threshold}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRealtorThreshold(index, 'min_threshold', Number(e.target.value))}
                                                        className="pr-20 bg-black/40 border-white/5 h-12 rounded-xl text-sm font-bold focus:ring-emerald-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block ml-1">Процент</label>
                                                <div className="relative">
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-emerald-500/50">
                                                        <Award className="h-4 w-4" />
                                                        <Percent className="h-3.5 w-3.5" />
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        value={threshold.percent}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRealtorThreshold(index, 'percent', Number(e.target.value))}
                                                        className="pr-20 bg-black/40 border-white/5 h-12 rounded-xl text-sm font-bold focus:ring-emerald-500/20 text-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        min={0} max={100}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Move buttons */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => moveRealtorThreshold(index, 'up')}
                                                disabled={index === 0}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:hover:bg-white/5 disabled:hover:text-white/40 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <ArrowUp className="h-3.5 w-3.5" />
                                                Вверх
                                            </button>
                                            <button
                                                onClick={() => moveRealtorThreshold(index, 'down')}
                                                disabled={index === settings.realtor.thresholds.length - 1}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:hover:bg-white/5 disabled:hover:text-white/40 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <ArrowDown className="h-3.5 w-3.5" />
                                                Вниз
                                            </button>
                                        </div>

                                        <div className="pt-4 border-t border-white/5">
                                            <div className="bg-black/20 p-3 rounded-xl flex justify-between items-center group/item">
                                                <span className="text-[9px] font-black text-white/20 uppercase">ИТОГО:</span>
                                                <span className="text-sm font-black text-emerald-400">
                                                    {formatKpiRub(calculateRealtorIncome(exampleRevenue, settings.realtor.thresholds))}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-[10px] text-white/30 text-right">
                                                при {formatKpiRub(exampleRevenue)} выручки
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ═══ MOP SECTION ═══ */}
            <section className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-indigo-500/0 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
                <div className="relative p-6 md:p-8 lg:p-10 rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                        <div className="flex items-center gap-4 lg:gap-6">
                            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 shadow-lg shadow-blue-500/5">
                                <Users className="h-7 w-7 lg:h-8 lg:w-8 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">Менеджер МОП</h3>
                                <p className="text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] lg:tracking-[0.3em] mt-1">Окладная часть + бонус за выполнение плана команды</p>
                            </div>
                        </div>
                        <Button
                            onClick={addMopPercentage}
                            variant="outline"
                            className="h-12 px-6 rounded-xl border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-black uppercase tracking-widest text-[10px]"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Добавить ступень
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {settings.mop.percentages.map((perc, index) => {
                            const exampleRevenue = getMopExampleRevenue(index, settings.mop.percentages);
                            return (
                                <motion.div
                                    key={index}
                                    whileHover={{ y: -5 }}
                                    className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all duration-300 group/card relative overflow-hidden"
                                >
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Ступень {index + 1}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="text-2xl font-black text-blue-400 italic">
                                                    {perc.percent}%
                                                </div>
                                                {settings.mop.percentages.length > 1 && (
                                                    <button
                                                        onClick={() => removeMopPercentage(index)}
                                                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors ml-1"
                                                        title="Удалить ступень"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block font-sans">План команды %</label>
                                                <div className="relative">
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-blue-500/50">
                                                        <Target className="h-4 w-4" />
                                                        <Percent className="h-3.5 w-3.5" />
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        value={perc.plan_completion}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMopPercentage(index, 'plan_completion', Number(e.target.value))}
                                                        className="pr-20 bg-black/40 border-white/5 h-12 rounded-xl text-sm font-bold focus:ring-blue-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block font-sans">Процент Бонуса</label>
                                                <div className="relative">
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-blue-500/50">
                                                        <Award className="h-4 w-4" />
                                                        <Percent className="h-3.5 w-3.5" />
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        value={perc.percent}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMopPercentage(index, 'percent', Number(e.target.value))}
                                                        className="pr-20 bg-black/40 border-white/5 h-12 rounded-xl text-sm font-bold focus:ring-blue-500/20 text-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Move buttons */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => moveMopPercentage(index, 'up')}
                                                disabled={index === 0}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:hover:bg-white/5 disabled:hover:text-white/40 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <ArrowUp className="h-3.5 w-3.5" />
                                                Вверх
                                            </button>
                                            <button
                                                onClick={() => moveMopPercentage(index, 'down')}
                                                disabled={index === settings.mop.percentages.length - 1}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:hover:bg-white/5 disabled:hover:text-white/40 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <ArrowDown className="h-3.5 w-3.5" />
                                                Вниз
                                            </button>
                                        </div>
                                        
                                        <div className="pt-4 border-t border-white/5">
                                            <div className="bg-black/20 p-3 rounded-xl flex justify-between items-center group/item">
                                                <span className="text-[9px] font-black text-white/20 uppercase">ИТОГО:</span>
                                                <span className="text-sm font-black text-white tracking-tighter">
                                                    {formatKpiRub((exampleRevenue * perc.percent) / 100)}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-[10px] text-white/30 text-right">
                                                при {formatKpiRub(exampleRevenue)} выручки
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ═══ ROP SECTION ═══ */}
            <section className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/20 to-fuchsia-500/0 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
                <div className="relative p-6 md:p-8 lg:p-10 rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                        <div className="flex items-center gap-4 lg:gap-6">
                            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 shadow-lg shadow-purple-500/5">
                                <TrendingUp className="h-7 w-7 lg:h-8 lg:w-8 text-purple-500" />
                            </div>
                            <div>
                                <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">Руководитель РОП</h3>
                                <p className="text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] lg:tracking-[0.3em] mt-1">Оклад + процент от выручки всего агентства</p>
                            </div>
                        </div>
                        <Button
                            onClick={addRopPercentage}
                            variant="outline"
                            className="h-12 px-6 rounded-xl border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-black uppercase tracking-widest text-[10px]"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Добавить ступень
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {settings.rop.percentages.map((perc, index) => {
                            const exampleRevenue = getRopExampleRevenue(index, settings.rop.percentages);
                            return (
                                <motion.div
                                    key={index}
                                    whileHover={{ y: -5 }}
                                    className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all duration-300 group/card relative overflow-hidden"
                                >
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-6 bg-purple-500 rounded-full" />
                                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Ступень {index + 1}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="text-2xl font-black text-purple-400">
                                                    {perc.percent}%
                                                </div>
                                                {settings.rop.percentages.length > 1 && (
                                                    <button
                                                        onClick={() => removeRopPercentage(index)}
                                                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors ml-1"
                                                        title="Удалить ступень"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block ml-1">Выполнение плана %</label>
                                                <div className="relative">
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-purple-500/50">
                                                        <Target className="h-4 w-4" />
                                                        <Percent className="h-3.5 w-3.5" />
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        value={perc.plan_completion}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRopPercentage(index, 'plan_completion', Number(e.target.value))}
                                                        className="pr-20 bg-black/40 border-white/5 h-12 rounded-xl text-sm font-bold focus:ring-purple-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block ml-1">Процент Выручки</label>
                                                <div className="relative">
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-purple-500/50">
                                                        <Award className="h-4 w-4" />
                                                        <Percent className="h-3.5 w-3.5" />
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        value={perc.percent}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRopPercentage(index, 'percent', Number(e.target.value))}
                                                        className="pr-20 bg-black/40 border-white/5 h-12 rounded-xl text-sm font-bold focus:ring-purple-500/20 text-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Move buttons */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => moveRopPercentage(index, 'up')}
                                                disabled={index === 0}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:hover:bg-white/5 disabled:hover:text-white/40 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <ArrowUp className="h-3.5 w-3.5" />
                                                Вверх
                                            </button>
                                            <button
                                                onClick={() => moveRopPercentage(index, 'down')}
                                                disabled={index === settings.rop.percentages.length - 1}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-20 disabled:hover:bg-white/5 disabled:hover:text-white/40 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <ArrowDown className="h-3.5 w-3.5" />
                                                Вниз
                                            </button>
                                        </div>

                                        <div className="pt-4 border-t border-white/5">
                                            <div className="bg-black/20 p-3 rounded-xl flex justify-between items-center group/item">
                                                <span className="text-[9px] font-black text-white/20 uppercase">ИТОГО:</span>
                                                <span className="text-sm font-black text-purple-400">
                                                    {formatKpiRub((exampleRevenue * perc.percent) / 100)}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-[10px] text-white/30 text-right">
                                                при {formatKpiRub(exampleRevenue)} выручки
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Save Button */}
            <div className="fixed bottom-10 right-10 z-50">
                <Button
                    onClick={() => setShowSaveDialog(true)}
                    className="h-16 md:h-20 px-8 md:px-12 rounded-[2rem] bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-[0.2em] shadow-[0_20px_50px_rgba(16,185,129,0.3)] border-t border-white/40 group transition-all duration-500"
                >
                    <Save className="h-6 w-6 mr-3 group-hover:scale-110 transition-transform" />
                    Сохранить настройки KPI
                </Button>
            </div>

            {/* Save Confirmation Dialog */}
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogContent className="bg-zinc-900/90 backdrop-blur-3xl border-white/10 rounded-[2.5rem] sm:max-w-lg">
                    <DialogHeader className="space-y-4">
                        <DialogTitle className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Сохранение KPI</DialogTitle>
                        <DialogDescription className="text-white/40 font-medium">
                            Вы подтверждаете внесение изменений в глобальные формулы расчета вознаграждений? 
                            Это повлияет на расчеты для всей организации.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex items-start gap-4 p-6 bg-amber-500/5 border border-amber-500/10 rounded-3xl my-6">
                        <AlertCircle className="h-7 w-7 text-amber-500 flex-shrink-0" />
                        <div className="space-y-1">
                            <p className="font-black text-white uppercase text-xs tracking-widest">Внимание</p>
                            <p className="text-sm text-white/60 font-medium">Изменения будут применены немедленно. Новые расчеты коснутся как текущих, так и будущих циклов начислений.</p>
                        </div>
                    </div>

                    <DialogFooter className="gap-4">
                        <Button
                            variant="outline"
                            onClick={() => setShowSaveDialog(false)}
                            disabled={saving}
                            className="flex-1 h-14 rounded-2xl border-white/5 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-[10px]"
                        >
                            Отмена
                        </Button>
                        <Button
                            onClick={saveSettings}
                            disabled={saving}
                            className="flex-1 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest text-[10px]"
                        >
                            {saving ? 'СОХРАНЕНИЕ...' : 'ПОДТВЕРДИТЬ'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
