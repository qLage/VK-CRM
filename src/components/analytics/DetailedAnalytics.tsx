import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  DollarSign, Target, Home, Users, Milestone, Star, 
  TrendingDown, TrendingUp, LayoutGrid 
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, getAvatarUrl } from '@/lib/utils';
import { formatMoney } from '@/utils/formatters';
import { EmployeePerformanceEntry } from '@/hooks/useAnalytics';

interface DetailedAnalyticsProps {
  performance: EmployeePerformanceEntry[];
  kpis: {
    totalDeals: number;
    totalDeposits: number;
    totalObjects: number;
    totalMeetings: number;
    trends: Record<string, string>;
  };
  aggregatedTargets: {
    target_deals: number;
    target_deposits: number;
    target_objects: number;
    target_meetings: number;
    target_revenue: number;
  };
  isLoading: boolean;
  period: string;
  currentPeriodLabel: string;
  prevPeriodLabel: string;
}

export function DetailedAnalytics({ 
  performance, 
  kpis, 
  aggregatedTargets, 
  period,
  currentPeriodLabel,
  prevPeriodLabel
}: DetailedAnalyticsProps) {
  const [selectedMetric, setSelectedMetric] = useState<keyof typeof metricsConfig>('revenue');

  const metricsConfig = {
    revenue: { label: 'Выручка', icon: DollarSign, color: 'text-primary' as const, unit: '₽', isMoney: true },
    deals: { label: 'Сделки', icon: Target, color: 'text-rose-500' as const, unit: 'шт', isMoney: false },
    deposits: { label: 'Задатки', icon: DollarSign, color: 'text-emerald-500' as const, unit: 'шт', isMoney: false },
    objects: { label: 'Объекты', icon: Home, color: 'text-primary' as const, unit: 'шт', isMoney: false },
    meetings: { label: 'Встречи', icon: Users, color: 'text-purple-500' as const, unit: 'шт', isMoney: false },
    kpi: { label: 'KPI', icon: Milestone, color: 'text-emerald-400' as const, unit: '%', isMoney: false },
  };

  const currentMetric = metricsConfig[selectedMetric];

  const sortedPerformance = useMemo(() => {
    const targetMap: Record<string, string> = {
      revenue: 'targetRevenue',
      deals: 'targetDeals',
      deposits: 'targetDeposits',
      objects: 'targetObjects',
      meetings: 'targetMeetings'
    };

    return [...performance].sort((a, b) => {
      if (selectedMetric === 'kpi') {
        // KPI tab must rank by KPI percent, not by rating score.
        const kpiA = Number(a.kpiRate || 0);
        const kpiB = Number(b.kpiRate || 0);
        if (kpiA !== kpiB) return kpiB - kpiA;
        const ratingA = Number(a.rating || 0);
        const ratingB = Number(b.rating || 0);
        if (ratingA !== ratingB) return ratingB - ratingA;
        const gapA = a.revenueGap ?? 999999999;
        const gapB = b.revenueGap ?? 999999999;
        return gapA - gapB;
      }

      const factA = (a[selectedMetric as keyof EmployeePerformanceEntry] as number) || 0;
      const targetKey = targetMap[selectedMetric] as keyof EmployeePerformanceEntry;
      const targetA = (a[targetKey] as number) || 0;
      const progressA = targetA > 0 ? factA / targetA : 0;

      const factB = (b[selectedMetric as keyof EmployeePerformanceEntry] as number) || 0;
      const targetB = (b[targetKey] as number) || 0;
      const progressB = targetB > 0 ? factB / targetB : 0;

      return progressB - progressA;
    });
  }, [performance, selectedMetric]);

  const totalFact = useMemo(() => {
    if (selectedMetric === 'kpi') return 0;
    return sortedPerformance.reduce((sum, emp) => sum + ((emp[selectedMetric as keyof EmployeePerformanceEntry] as number) || 0), 0);
  }, [sortedPerformance, selectedMetric]);

  const totalTarget = useMemo(() => {
    if (selectedMetric === 'kpi') return 1;
    // Prefer aggregatedTargets from the plans API over summing individual employee targets
    // (individual targets may be 0 if plans haven't been distributed to all employees yet)
    const targetMap: Record<string, keyof typeof aggregatedTargets> = {
      revenue: 'target_revenue',
      deals: 'target_deals',
      deposits: 'target_deposits',
      objects: 'target_objects',
      meetings: 'target_meetings'
    };
    const aggregated = aggregatedTargets?.[targetMap[selectedMetric]] as number | undefined;
    if (aggregated && aggregated > 0) return aggregated;
    // Fallback: sum from employee performance data
    const empTargetMap: Record<string, keyof EmployeePerformanceEntry> = {
      revenue: 'targetRevenue',
      deals: 'targetDeals',
      deposits: 'targetDeposits',
      objects: 'targetObjects',
      meetings: 'targetMeetings'
    };
    return sortedPerformance.reduce((sum, emp) => sum + ((emp[empTargetMap[selectedMetric]] as number) || 0), 0) || 1;
  }, [sortedPerformance, selectedMetric, aggregatedTargets]);

  const totalProgress = totalFact / Math.max(totalTarget, 1) * 100;

  /** Строки мини-блока «Все показатели плана» — всегда свои факт/цель, не зависят от выбранной вкладки */
  const planMetricRows = useMemo(() => {
    const revFact = sortedPerformance.reduce((s, e) => s + (e.revenue || 0), 0);
    const revTarget =
      aggregatedTargets?.target_revenue && aggregatedTargets.target_revenue > 0
        ? aggregatedTargets.target_revenue
        : sortedPerformance.reduce((s, e) => s + (e.targetRevenue || 0), 0);
    return [
      { key: 'revenue', label: 'Валовая', fact: revFact, target: revTarget, icon: DollarSign, color: 'text-primary', isMoney: true },
      {
        key: 'deals',
        label: 'Сделки',
        fact: kpis.totalDeals,
        target: aggregatedTargets?.target_deals ?? 0,
        icon: Target,
        color: 'text-rose-500',
      },
      {
        key: 'deposits',
        label: 'Задатки',
        fact: kpis.totalDeposits,
        target: aggregatedTargets?.target_deposits ?? 0,
        icon: DollarSign,
        color: 'text-emerald-500',
      },
      {
        key: 'objects',
        label: 'Объекты',
        fact: kpis.totalObjects,
        target: aggregatedTargets?.target_objects ?? 0,
        icon: Home,
        color: 'text-primary',
      },
      {
        key: 'meetings',
        label: 'Встречи',
        fact: kpis.totalMeetings,
        target: aggregatedTargets?.target_meetings ?? 0,
        icon: Users,
        color: 'text-purple-500',
      },
    ];
  }, [sortedPerformance, aggregatedTargets, kpis]);

  const getRoleInfo = (role: string | undefined, positionName: string = '') => {
    const pos = (positionName || '').toLowerCase();
    const r = (role || '').toLowerCase();
    if (pos.includes('ипот') || r === 'mortgage_broker') return { label: 'Ипотека', icon: Milestone, color: 'text-purple-400' };
    if (pos.includes('риел') || r === 'realtor') return { label: 'Риелтор', icon: Home, color: 'text-emerald-400' };
    if (pos.includes('моп') || r === 'sales_manager') return { label: 'МОП', icon: Users, color: 'text-primary' };
    if (pos.includes('роп') || r === 'head_sales') return { label: 'РОП', icon: Target, color: 'text-rose-400' };
    return { label: 'Сотрудник', icon: Star, color: 'text-white/40' };
  };


  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-10">
      
      <div className="bg-zinc-900/40 p-1 md:p-1.5 rounded-2xl border border-white/5 backdrop-blur-3xl inline-flex w-full xl:w-auto overflow-hidden">
        <Tabs value={selectedMetric} onValueChange={(v: any) => setSelectedMetric(v)} className="w-full">
          <TabsList className="bg-transparent h-auto p-0 flex flex-wrap xl:flex-nowrap gap-1">
            {(Object.entries(metricsConfig) as [keyof typeof metricsConfig, any][]).map(([key, config]) => (
              <TabsTrigger 
                key={key} 
                value={key} 
                className={cn(
                  "flex-1 xl:flex-none xl:min-w-[140px] py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest gap-2 transition-all duration-500",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-white/40 hover:text-white/70"
                )}
              >
                <config.icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                {config.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        
          <Card className="lg:col-span-8 bg-zinc-900/60 backdrop-blur-3xl border-white/5 overflow-hidden shadow-2xl rounded-[1.5rem] md:rounded-[2.5rem]">
            <CardHeader className="p-4 md:p-6 px-0 md:px-0 pb-2 border-b border-white/5">
              <div className="flex items-center justify-between px-3 md:px-5">
                <CardTitle className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                  <currentMetric.icon className={cn("h-6 w-6", currentMetric.color)} />
                  {selectedMetric === 'kpi' ? 'Сравнение KPI' : `План по критерию: ${currentMetric.label}`}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-primary/20">
                      <th className="text-left py-4 pl-3 md:pl-5 pr-2 text-[10px] font-black uppercase tracking-widest text-primary/80">Сотрудник</th>
                      {selectedMetric === 'kpi' ? (
                        <>
                          <th className="px-4 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] text-white/40 font-black uppercase tracking-widest">{prevPeriodLabel}</span>
                            </div>
                          </th>
                          <th className="px-4 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] text-primary/60 font-black uppercase tracking-widest">{currentPeriodLabel}</span>
                            </div>
                          </th>
                          <th className="text-left py-4 pl-2 pr-3 md:pr-5 text-[10px] font-black uppercase tracking-widest text-primary/80">До новой цели</th>
                        </>
                      ) : (
                        <>
                          <th className="text-right py-4 px-2 text-[10px] font-black uppercase tracking-widest text-primary/80">{currentMetric.label} (Факт)</th>
                          <th className="text-right py-4 px-2 hidden sm:table-cell text-[10px] font-black uppercase tracking-widest text-primary/80">Дельта</th>
                          <th className="text-left py-4 pl-2 pr-3 md:pr-5 text-[10px] font-black uppercase tracking-widest text-primary/80">Выполнение</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sortedPerformance.map((emp, i) => {
                      const roleInfo = getRoleInfo(emp.role, emp.position_name || emp.position?.name);
                      const RoleIcon = roleInfo.icon;

                      if (selectedMetric === 'kpi') {
                        return (
                          <motion.tr 
                            key={emp.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="group hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="p-3 md:p-5">
                              <div className="flex items-center gap-3 md:gap-4">
                                <Avatar className="h-10 w-10 border border-white/10 rounded-xl">
                                  <AvatarImage src={getAvatarUrl(emp.avatar_url)} className="object-cover" />
                                  <AvatarFallback className="bg-zinc-800 text-white font-black text-xs">{emp.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-white truncate uppercase tracking-tight group-hover:text-primary transition-colors">{emp.name}</p>
                                  <div className="flex items-center gap-1 mt-1">
                                    <RoleIcon className={cn("h-3 w-3", roleInfo.color)} />
                                    <p className={cn("text-[9px] font-bold uppercase tracking-widest", roleInfo.color)}>{roleInfo.label}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="p-2 md:p-4 text-right">
                              <span className="text-sm md:text-base font-black text-white/40 tabular-nums">
                                {emp.prevKpiRate === null || emp.prevKpiRate === undefined ? (
                                  "—"
                                ) : (
                                  `${Math.round(Number(emp.prevKpiRate))}%`
                                )}
                              </span>
                            </td>
                            <td className="p-2 md:p-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className={cn(
                                  "text-sm md:text-base font-black tabular-nums",
                                  emp.kpiRate === null || emp.kpiRate === undefined ? "text-white/20" :
                                  (emp.kpiRate || 0) > (emp.prevKpiRate || 0) ? "text-emerald-400" : (emp.kpiRate || 0) < (emp.prevKpiRate || 0) ? "text-rose-400" : "text-white"
                                )}>
                                  {emp.kpiRate === null || emp.kpiRate === undefined ? (
                                    "—"
                                  ) : (
                                    `${Math.round(Number(emp.kpiRate))}%`
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 md:p-5">
                              {emp.revenueGap !== undefined ||
                              (emp.nextKpiPercent !== undefined && emp.nextKpiPercent !== null) ? (
                                <div className="space-y-1">
                                  {emp.nextKpiPercent != null && (
                                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                                      До {emp.nextKpiPercent}%
                                    </p>
                                  )}
                                  {emp.revenueGap !== undefined && (
                                    <>
                                      <p className="text-[14px] font-black text-primary tabular-nums">
                                        {formatMoney(emp.revenueGap)}
                                      </p>
                                      <div className="h-1 w-24 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-primary rounded-full transition-all duration-500"
                                          style={{
                                            width: `${Math.min(
                                              100,
                                              (emp.revenue / (emp.nextThreshold || 1)) * 100,
                                            )}%`,
                                          }}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                              ) : emp.kpiAtMaxTier ? (
                                <span className="text-[10px] font-black text-white/25 uppercase tracking-widest">
                                  Макс. уровень KPI
                                </span>
                              ) : (
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">—</span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      }

                      const fact = selectedMetric === 'revenue' ? (emp.revenue || 0) : (emp[selectedMetric as keyof EmployeePerformanceEntry] as number || 0);

                      const targetMap: Record<string, string> = {
                        revenue: 'targetRevenue',
                        deals: 'targetDeals',
                        deposits: 'targetDeposits',
                        objects: 'targetObjects',
                        meetings: 'targetMeetings'
                      };
                      const targetKey = targetMap[selectedMetric] as keyof EmployeePerformanceEntry;
                      const target = (emp[targetKey] as number) || 0;
                      
                      const delta = fact - target;
                      const progress = target > 0 ? (fact / target) * 100 : 0;
                      const isNegative = delta < 0;

                      return (
                        <motion.tr 
                          key={emp.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="group hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="p-3 md:p-5">
                            <div className="flex items-center gap-3 md:gap-4">
                              <div className="relative shrink-0">
                                <div className="absolute -inset-1 bg-primary/20 blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Avatar className="h-10 w-10 md:h-12 md:w-12 border border-white/10 rounded-xl overflow-hidden relative z-10">
                                  <AvatarImage src={getAvatarUrl(emp.avatar_url)} className="object-cover" />
                                  <AvatarFallback className="bg-zinc-800 text-white font-black text-xs">
                                    {emp.name?.substring(0, 1)}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm md:text-base font-black text-white truncate leading-none uppercase tracking-tight group-hover:text-primary transition-colors">
                                  {emp.name}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <RoleIcon className={cn("h-3 w-3", roleInfo.color)} />
                                  <p className={cn("text-[9px] font-bold uppercase tracking-widest", roleInfo.color)}>
                                    {roleInfo.label}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 md:p-4 text-right">
                            <p className="text-sm md:text-base font-black text-white tabular-nums whitespace-nowrap">
                              {currentMetric.isMoney ? formatMoney(fact) : `${fact} ${currentMetric.unit}`}
                            </p>
                          </td>
                          <td className="p-2 md:p-4 text-right hidden sm:table-cell">
                            <div className={cn(
                              "inline-flex items-center gap-1.5 font-black tabular-nums text-xs md:text-sm whitespace-nowrap",
                              (target > 0 && isNegative) ? "text-rose-500" : (target > 0) ? "text-emerald-500" : "text-white/20"
                            )}>
                              {target > 0 ? (currentMetric.isMoney ? formatMoney(delta) : `${delta > 0 ? '+' : ''}${delta}`) : '-'}
                              {target > 0 && (isNegative ? <TrendingDown className="h-3 w-3 shrink-0" /> : <TrendingUp className="h-3 w-3 shrink-0" />)}
                            </div>
                          </td>
                          <td className="p-3 md:p-5 min-w-[120px] sm:min-w-[150px] md:min-w-[200px]">
                            {target > 0 ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                  <span className={cn(
                                    "font-black text-xs",
                                    progress < 30 ? "text-rose-500" : progress < 70 ? "text-orange-500" : "text-emerald-500"
                                  )}>{Number(progress || 0).toFixed(0)}%</span>
                                  <span className="text-white/20 ml-2">{currentMetric.isMoney ? formatMoney(target) : `${target} ${currentMetric.unit}`}</span>
                                </div>
                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                  <motion.div 
                                    className={cn(
                                      "h-full rounded-full transition-all duration-1000",
                                      progress < 30 ? "bg-rose-500" : progress < 70 ? "bg-orange-500" : "bg-emerald-500"
                                    )}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    style={{ boxShadow: `0 0 10px ${progress < 30 ? '#f43f5e' : progress < 70 ? '#f97316' : '#10b981'}33` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="text-[10px] font-black text-white/10 uppercase tracking-widest text-center">План не установлен</div>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        {/* Правая колонка: Итоговые карточки */}
        <div className="lg:col-span-4 space-y-6 md:space-y-8">
          
          {/* Общий план по выбранному критерию */}
          <Card className="bg-zinc-900/60 backdrop-blur-3xl border-white/5 overflow-hidden shadow-2xl rounded-[1.5rem] md:rounded-[2.5rem] group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50 pointer-events-none" />
            <CardHeader className="p-4 md:p-6 pb-0 shrink-0">
              <div className="flex items-center gap-3">
                <div className={cn("p-2.5 bg-primary/20 rounded-xl border border-primary/30 rotate-3 group-hover:rotate-6 transition-transform", currentMetric.color)}>
                  <currentMetric.icon className="h-5 w-5 fill-current/30" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Итого: {currentMetric.label}</span>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-4">
              <div className="space-y-6">
                <div>
                  <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-1">Фактический результат:</p>
                  <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter tabular-nums leading-none">
                    {currentMetric.isMoney ? formatMoney(totalFact) : `${totalFact} ${currentMetric.unit}`}
                  </h2>
                  <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-4 flex items-center gap-2 text-white/40">
                    <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                    Общая цель на {period === 'month' ? 'месяц' : 'период'}: {currentMetric.isMoney ? formatMoney(totalTarget) : `${totalTarget} ${currentMetric.unit}`}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-black text-white uppercase tracking-widest text-white/40">Процент выполнения</span>
                    <span className={cn("text-3xl font-black tabular-nums", currentMetric.color)}>{Number(totalProgress || 0).toFixed(0)}%</span>
                  </div>
                  <div className="h-4 w-full bg-white/5 rounded-2xl overflow-hidden border border-white/10 p-1">
                    <motion.div 
                      className={cn("h-full rounded-xl transition-all duration-1000 relative overflow-hidden", currentMetric.color.replace('text-', 'bg-'))}
                      initial={{ width: 0 }}
                      animate={{ width: `${totalProgress}%` }}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-shimmer" />
                    </motion.div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mb-1">Осталось</p>
                    <p className="text-xs md:text-sm font-black text-rose-500 truncate">
                      {currentMetric.isMoney ? formatMoney(Math.max(totalTarget - totalFact, 0)) : `${Math.max(totalTarget - totalFact, 0)} ${currentMetric.unit}`}
                    </p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mb-1">Лучший вклад</p>
                    <p className="text-xs md:text-sm font-black text-emerald-500 truncate">
                      {sortedPerformance[0]
                        ? (currentMetric.isMoney
                            ? formatMoney(sortedPerformance[0].revenue)
                            : `${(sortedPerformance[0][selectedMetric as keyof EmployeePerformanceEntry] as number) || 0} ${currentMetric.unit}`)
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Планы по активностям (мини-карточки) */}
          <Card className="bg-zinc-900/60 backdrop-blur-3xl border-white/5 overflow-hidden shadow-2xl rounded-[1.5rem] md:rounded-[2.5rem]">
            <CardHeader className="p-2 md:p-4">
              <CardTitle className="text-base md:text-lg font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                <Milestone className="h-5 w-5 text-primary" />
                Все показатели плана
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4 pt-0 space-y-4">
              {planMetricRows.map((item, idx) => {
                const safeTarget = typeof item.target === 'number' && item.target > 0 ? item.target : 0;
                const perc = safeTarget > 0 ? Math.min(100, (item.fact / safeTarget) * 100) : 0;
                return (
                  <div
                    key={item.key} 
                    className={cn(
                      "space-y-2 group cursor-pointer p-2 rounded-xl transition-all",
                      selectedMetric === item.key ? "bg-white/5 border border-white/10" : "hover:bg-white/5"
                    )}
                    onClick={() => setSelectedMetric(item.key as any)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <item.icon className={cn("h-4 w-4", item.color)} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">{item.label}</span>
                      </div>
                      <span className="text-[10px] font-black tabular-nums text-white/40">
                        {item.isMoney ? formatMoney(item.fact) : item.fact} / {item.isMoney ? formatMoney(item.target) : (item.target || 0)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative border border-white/5">
                      <motion.div 
                        className={cn("h-full rounded-full shadow-[0_0_8px_currentColor]", item.color.replace('text-', 'bg-'))}
                        initial={{ width: 0 }}
                        animate={{ width: `${perc}%` }}
                        transition={{ duration: 1, delay: idx * 0.1 }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
