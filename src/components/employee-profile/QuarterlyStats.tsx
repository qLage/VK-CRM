import { motion } from 'framer-motion';
import { TrendingUp, DollarSign, Home, FileText, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useEmployeeStats } from '@/hooks/useEmployeeStats';
import { getPositionName, isRatingParticipant } from '@/lib/positions';

interface Employee {
  id: string;
  full_name: string;
  personal_kpi_current?: number;
  commission_percent?: number;
  custom_total_deals?: number;
  custom_total_objects?: number;
  custom_total_revenue?: number;
}

interface QuarterlyStatsProps {
  employee: Employee;
}

const getCurrentQuarter = () => {
  const month = new Date().getMonth();
  return Math.floor(month / 3) + 1;
};

const getQuarterName = (quarter: number) => {
  return `Q${quarter} ${new Date().getFullYear()}`;
};

import { startOfQuarter, endOfQuarter } from 'date-fns';

export function QuarterlyStats({ employee }: QuarterlyStatsProps) {
  const currentQuarter = getCurrentQuarter();
  const quarterName = getQuarterName(currentQuarter);
  
  const now = new Date();
  const start = startOfQuarter(now).toISOString();
  const end = endOfQuarter(now).toISOString();
  
  const { stats, loading, error } = useEmployeeStats(employee.id, start, end);

  // Use real stats data with fallback to employee's custom fields
  const deals = stats?.custom_deals ?? employee.custom_total_deals ?? 0;
  const objects = stats?.custom_objects ?? employee.custom_total_objects ?? 0;
  const revenue = stats?.custom_revenue ?? employee.custom_total_revenue ?? 0;
  const mortgage = stats?.mortgage_deduction ?? 0;

  // Conversion rate (deals / objects) with division by zero checks
  const conversionRate = objects > 0 ? Math.round((deals / objects) * 100) : 0;

  const statsData = [
    {
      label: 'Сделки закрыты',
      value: deals,
      icon: FileText,
      color: 'primary',
      target: 50,
    },
    {
      label: 'Объекты проданы',
      value: objects,
      icon: Home,
      color: 'purple',
      target: 60,
    },
    {
      label: 'Ипотека',
      value: mortgage,
      icon: Target,
      color: 'amber',
      format: 'currency',
      target: 500000,
    },
    {
      label: 'Выручка',
      value: revenue,
      icon: DollarSign,
      color: 'green',
      format: 'currency',
      target: 5000000,
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
      className="rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 sm:p-6 md:p-8 shadow-2xl w-full h-full"
      aria-label="Квартальная статистика"
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-primary/10 border border-primary/20" aria-hidden="true">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight">
              Квартальная статистика
            </h2>
            <p className="text-[9px] md:text-[10px] font-bold text-white/70 uppercase tracking-wider mt-0.5">
              {quarterName}
            </p>
          </div>
        </div>
      </header>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true"></div>
          <span className="sr-only">Загрузка статистики...</span>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {statsData.map((stat, index) => {
              const Icon = stat.icon;
              const colorClasses = {
                primary: 'bg-primary/10 border-primary/20 text-primary',
                purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
                green: 'bg-green-500/10 border-green-500/20 text-green-400',
                amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
              };

              const progressColorClasses = {
                primary: 'bg-primary shadow-[0_0_15px_rgba(var(--primary),0.4)]',
                purple: 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]',
                green: 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]',
                amber: 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]',
              };

              const formatShortValue = (val: number) => {
                if (!isFinite(val) || val === 0) return '0 ₽';
                if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M ₽`;
                if (val >= 1000) return `${(val / 1000).toFixed(0)}k ₽`;
                return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(val);
              };

              const formattedValue = stat.format === 'currency'
                ? formatShortValue(stat.value)
                : stat.format === 'percent'
                  ? `${stat.value}%`
                  : stat.value;

              const progressPercent = Math.min(Math.round((stat.value / stat.target) * 100), 100);

              return (
                <motion.article
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
                  className="relative overflow-hidden rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5 p-4 md:p-5 group hover:bg-white/[0.04] transition-all focus-within:ring-2 focus-within:ring-primary/50"
                >
                  {/* Icon */}
                  <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div className={cn('p-2 rounded-lg border', colorClasses[stat.color as keyof typeof colorClasses])} aria-hidden="true">
                      <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    </div>
                  </div>

                  {/* Label */}
                  <p className="text-[9px] md:text-[10px] font-black text-white/60 uppercase tracking-wider mb-1 md:mb-2">
                    {stat.label}
                  </p>

                  {/* Value */}
                  <div className="mb-3 md:mb-4">
                    <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tabular-nums tracking-tighter">
                      {formattedValue}
                    </p>
                  </div>

                  {/* Progress to Target */}
                  <div className="space-y-1.5 md:space-y-2">
                    <div className="flex justify-between items-center text-[8px] md:text-[9px] font-black uppercase tracking-wider">
                      <span className="text-white/50">Цель квартала</span>
                      <span className="text-white/70 tabular-nums">
                        {progressPercent}%
                      </span>
                    </div>
                    <Progress
                      value={progressPercent > 0 ? progressPercent : null}
                      max={100}
                      className="h-1.5 bg-white/5 rounded-full"
                      indicatorClassName={progressColorClasses[stat.color as keyof typeof progressColorClasses]}
                      aria-label={`${stat.label}: ${formattedValue} из цели, прогресс ${progressPercent} процентов`}
                    />
                  </div>
                </motion.article>
              );
            })}
          </div>

          {/* Quarterly Insights & Efficiency */}
          {isRatingParticipant(getPositionName(employee)) && (
            <div className="mt-8 space-y-6">
              {/* Efficiency Metrics Grid - 2x2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-all">
                  <div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">KPI Итог</p>
                    <p className="text-2xl font-black text-white tabular-nums">{Math.round(employee.personal_kpi_current ?? 0)}%</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-all">
                  <div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Всего сделок</p>
                    <p className="text-2xl font-black text-primary tabular-nums">{deals}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <FileText className="h-5 w-5 text-emerald-400" />
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-all">
                  <div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Конверсия</p>
                    <p className="text-2xl font-black text-white tabular-nums">{conversionRate}%</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                    <TrendingUp className="h-5 w-5 text-purple-400" />
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:bg-white/5 transition-all">
                  <div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Cр. чек</p>
                    <p className="text-2xl font-black text-white tabular-nums">
                      {deals > 0 ? `${Math.round(revenue / deals / 1000)}k` : '0'} ₽
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <DollarSign className="h-5 w-5 text-amber-400" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
