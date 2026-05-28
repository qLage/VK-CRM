import { motion } from 'framer-motion';
import { Clock, TrendingUp, Zap, Loader2, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { useEmployeeDailyActivity } from '@/hooks/useEmployeeDailyActivity';

interface Employee {
  id: string;
  full_name: string;
}

interface DailyActivityProps {
  employee: Employee;
}

const getActivityColor = (value: number) => {
  if (value === 0) return 'bg-white/[0.03] border-white/[0.05]';
  if (value < 20) return 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]';
  if (value < 40) return 'bg-emerald-500/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]';
  if (value < 60) return 'bg-emerald-500/50 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.3)]';
  if (value < 80) return 'bg-emerald-500/70 border-emerald-500/80 shadow-[0_0_25px_rgba(16,185,129,0.4)]';
  return 'bg-emerald-500 border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.6)]';
};

const getActivityLabel = (value: number) => {
  if (value === 0) return 'Нет активности';
  if (value < 20) return 'Низкая';
  if (value < 40) return 'Умеренная';
  if (value < 60) return 'Средняя';
  if (value < 80) return 'Высокая';
  return 'Очень высокая';
};

// Check if heatmap data is empty (all zeros)
const isHeatmapEmpty = (data: number[][] | undefined) => {
  if (!data || data.length === 0) return true;
  return data.every(dayData => dayData.every(val => val === 0));
};

export function DailyActivity({ employee }: DailyActivityProps) {
  const { heatmapData, isLoading, error } = useEmployeeDailyActivity(employee.id, 7);

  const days = useMemo(() => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], []);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // Check if we have valid data
  const hasData = !isLoading && !error && heatmapData && !isHeatmapEmpty(heatmapData);
  const data = hasData ? heatmapData : Array(7).fill(null).map(() => Array(24).fill(0));

  // Calculate peak activity time
  let maxActivity = 0;
  let peakDay = 0;
  let peakHour = 0;

  data.forEach((dayData: number[], dayIndex: number) => {
    dayData.forEach((activity: number, hourIndex: number) => {
      if (activity > maxActivity) {
        maxActivity = activity;
        peakDay = dayIndex;
        peakHour = hourIndex;
      }
    });
  });

  // Calculate average activity by day
  const avgByDay = data.map((dayData: number[]) =>
    Math.round(dayData.reduce((sum: number, val: number) => sum + val, 0) / dayData.length)
  );

  const totalAvg = Math.round(avgByDay.reduce((sum: number, val: number) => sum + val, 0) / avgByDay.length);

  // New Analytical Stats
  const dailyTotals = data.map((dayData: number[]) => dayData.reduce((sum: number, val: number) => sum + val, 0));
  const maxDailyTotal = Math.max(...dailyTotals, 1);
  
  const intensityStats = {
    low: data.flat().filter((v: number) => v > 0 && v < 40).length,
    medium: data.flat().filter((v: number) => v >= 40 && v < 80).length,
    high: data.flat().filter((v: number) => v >= 80).length,
    none: data.flat().filter((v: number) => v === 0).length,
  };
  const totalActiveSlots = intensityStats.low + intensityStats.medium + intensityStats.high || 1;

  const consistency = Math.round(
    (data.flat().filter((v: number, i: number) => {
      const hour = i % 24;
      return hour >= 9 && hour <= 18 && v > 0;
    }).length / (7 * 10)) * 100
  );

  const streak = [...dailyTotals].reverse().reduce((acc: { count: number; counting: boolean }, val: number) => {
    if (val > 0 && acc.counting) return { count: acc.count + 1, counting: true };
    return { ...acc, counting: false };
  }, { count: 0, counting: true }).count;

  const hourlyTotals = hours.map(hour => {
    const total = data.reduce((sum: number, dayData: number[]) => sum + dayData[hour], 0);
    return Math.round(total / 7);
  });



  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 sm:p-6 md:p-8 shadow-2xl w-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <Clock className="h-6 w-6 text-white/60" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
              Дневная активность
            </h2>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">
              Аналитика за последние 7 дней
            </p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      )}

      {!isLoading && !hasData && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Clock className="h-16 w-16 text-white/10 mb-6" />
          <p className="text-lg font-black text-white/40 uppercase tracking-tighter">Данные не найдены</p>
          <p className="text-xs text-white/20 mt-2 max-w-[200px]">Активность за указанный период не зафиксирована</p>
        </div>
      )}

      {!isLoading && hasData && (
        <div className="space-y-12">
          {/* Stats Summary Grid - 2x2 to match Quarterly Stats */}
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            {[
              { label: 'Пик активности', value: `${days[peakDay]} ${peakHour}:00`, icon: Zap, color: 'primary', trend: '+12%', trendUp: true },
              { label: 'Стабильность', value: `${consistency}%`, icon: TrendingUp, color: 'emerald-400', trend: 'Стаб.', trendUp: true },
              { label: 'Серия дней', value: `${streak} дн.`, icon: Clock, color: 'blue-400', trend: 'Best', trendUp: true },
              { label: 'Рабочий тонус', value: `${totalAvg}%`, icon: Activity, color: 'amber-400', trend: 'High', trendUp: true }
            ].map((stat, i) => (
              <div key={i} className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/10 relative overflow-hidden group hover:bg-white/5 transition-all duration-500">
                <div className={cn("absolute top-0 right-0 w-32 h-32 blur-[80px] -translate-y-1/2 translate-x-1/2 transition-colors duration-500 opacity-20", `bg-${stat.color}`)} />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <stat.icon className={cn("h-4 w-4", `text-${stat.color}`)} />
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{stat.label}</p>
                  </div>
                  <div className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter", stat.trendUp ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/30")}>
                    {stat.trend}
                  </div>
                </div>
                <p className="text-3xl md:text-4xl font-black text-white tracking-tighter tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Heatmap Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Тепловая карта активности</p>
                <p className="text-[9px] font-bold text-white/20 uppercase">Динамика вовлеченности за неделю</p>
              </div>
              <div className="hidden sm:flex items-center gap-3">
                <span className="text-[9px] font-bold text-white/20 uppercase">Меньше</span>
                <div className="flex gap-1.5">
                  {[0, 20, 40, 60, 80, 100].map(v => (
                    <div key={v} className={cn("w-3.5 h-3.5 rounded-[4px] border", getActivityColor(v))} />
                  ))}
                </div>
                <span className="text-[9px] font-bold text-white/20 uppercase">Больше</span>
              </div>
            </div>

            <div className="hidden md:block">
              <div className="flex gap-6">
                {/* Day Labels - Static column */}
                <div className="flex flex-col gap-2 pt-8 shrink-0">
                  {days.map(day => (
                    <div key={day} className="h-6 flex items-center justify-end">
                      <span className="text-[10px] font-black text-white/30 uppercase">{day}</span>
                    </div>
                  ))}
                </div>

                {/* Grid - Scrollable area */}
                <div className="flex-1 min-w-0 overflow-x-auto pb-4 scrollbar-none">
                  {/* Hours Header */}
                  <div className="flex gap-1.5 mb-2 h-6 items-end">
                    {hours.map(hour => (
                      <div key={hour} className="flex-1 min-w-[17px] text-center">
                        {hour % 3 === 0 && <span className="text-[9px] font-bold text-white/20 tabular-nums">{hour}</span>}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div className="space-y-2">
                    {data.map((dayData: number[], dayIndex: number) => (
                      <div key={dayIndex} className="flex gap-1.5 h-6">
                        {dayData.map((activity: number, hourIndex: number) => (
                          <motion.div
                            key={hourIndex}
                            whileHover={{ scale: 1.4, zIndex: 10 }}
                            className={cn(
                              "flex-1 min-w-[17px] rounded-[4px] md:rounded-[5px] border transition-all duration-300 cursor-help",
                              getActivityColor(activity)
                            )}
                            title={`${days[dayIndex]}, ${hourIndex}:00 — ${getActivityLabel(activity)} (${activity}%)`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile simplified heatmap */}
            <div className="md:hidden grid grid-cols-7 gap-3">
              {days.map((day, dayIndex) => (
                <div key={day} className="flex flex-col items-center gap-2">
                  <span className="text-[8px] font-black text-white/20 uppercase">{day}</span>
                  <div className="w-full aspect-square rounded-xl bg-white/5 border border-white/10 relative overflow-hidden">
                    <div 
                      className="absolute inset-0 bg-emerald-500 transition-all duration-1000"
                      style={{ opacity: avgByDay[dayIndex] / 100 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Analytical Footer - Fully Grid-based */}
          <div className="pt-12 border-t border-white/5 space-y-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
              {/* Load distribution */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Распределение нагрузки
                </h4>
                <div className="h-2.5 flex rounded-full overflow-hidden bg-white/5 shadow-inner">
                  <div className="h-full bg-emerald-500/20 border-r border-white/5" style={{ width: `${(intensityStats.low / totalActiveSlots) * 100}%` }} />
                  <div className="h-full bg-emerald-500/50 border-r border-white/5" style={{ width: `${(intensityStats.medium / totalActiveSlots) * 100}%` }} />
                  <div className="h-full bg-emerald-500" style={{ width: `${(intensityStats.high / totalActiveSlots) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-5">
                  {[
                    { label: 'Лёгкая', color: 'bg-emerald-500/30' },
                    { label: 'Средняя', color: 'bg-emerald-500/60' },
                    { label: 'Макс.', color: 'bg-emerald-500' }
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 group cursor-default">
                      <div className={cn("w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125", item.color)} />
                      <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hourly Profiling */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] text-center flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Почасовой профиль
                </h4>
                <div className="h-32 flex items-end justify-between gap-[3px]">
                  {hourlyTotals.map((hourAvg, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-white/5 rounded-t-sm relative group/h"
                      style={{ height: `${Math.max(hourAvg, hourAvg > 0 ? 10 : 0)}%` }}
                    >
                      <div className={cn("absolute inset-0 transition-opacity duration-300", i >= 9 && i <= 18 ? "bg-primary/50" : "bg-primary/10")} />
                      {i % 4 === 0 && (
                        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-black text-white/10 tabular-nums">{i}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Trend */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] text-right flex items-center justify-end gap-2">
                  Тренд вовлеченности
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </h4>
                <div className="h-32 flex items-end justify-between gap-3">
                  {dailyTotals.map((total: number, i: number) => (
                    <div
                      key={i}
                      className="flex-1 bg-emerald-500/10 rounded-t-lg relative group/t hover:bg-emerald-500/20 transition-all duration-300"
                      style={{ height: `${(total / maxDailyTotal) * 100}%` }}
                    >
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: '100%' }}
                        className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-emerald-500/60 rounded-t-lg border-t border-emerald-500/30" 
                      />
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-800/90 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-lg text-[10px] font-black text-white opacity-0 group-hover/t:opacity-100 transition-all scale-75 group-hover/t:scale-100 whitespace-nowrap z-50 shadow-2xl tabular-nums">
                        {total} балл.
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between">
                  {days.map(d => (
                    <span key={d} className="text-[9px] font-black text-white/20 uppercase w-full text-center tabular-nums">{d}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
