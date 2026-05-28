import { motion } from 'framer-motion';
import { TrendingUp, BarChart3, Target, Loader2 } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { useEmployeeMonthlyTrends, MonthlyTrend } from '@/hooks/useEmployeeMonthlyTrends';
import { getPositionName, shouldHidePersonalRevenue, isRatingParticipant } from '@/lib/positions';
import { startOfQuarter, endOfMonth, isWithinInterval, parseISO, format } from 'date-fns';

interface Employee {
  id: string;
  full_name: string;
  personal_kpi_current?: number;
  commission_percent?: number;
  custom_total_deals?: number;
  custom_total_revenue?: number;
}

interface EfficiencyAnalyticsProps {
  employee: Employee;
}

const getRussianMonthFull = (month: string) => {
  const months: Record<string, string> = {
    'Янв': 'Январь',
    'Фев': 'Февраль',
    'Мар': 'Март',
    'Апр': 'Апрель',
    'Май': 'Май',
    'Июн': 'Июнь',
    'Июл': 'Июль',
    'Авг': 'Август',
    'Сен': 'Сентябрь',
    'Окт': 'Октябрь',
    'Ноя': 'Ноябрь',
    'Дек': 'Декабрь',
    // Fallback for full names if already provided
    'Январь': 'Январь', 'Февраль': 'Февраль', 'Март': 'Март', 'Апрель': 'Апрель',
    'Июнь': 'Июнь', 'Июль': 'Июль', 'Август': 'Август', 'Сентябрь': 'Сентябрь',
    'Октябрь': 'Октябрь', 'Ноябрь': 'Ноябрь', 'Декабрь': 'Декабрь'
  };
  return months[month] || month;
};

export function EfficiencyAnalytics({ employee }: EfficiencyAnalyticsProps) {
  // Fetch real monthly trends data
  const { trends, isLoading, error } = useEmployeeMonthlyTrends(employee.id, 12);

  // Check if we have valid data
  const hasData = !isLoading && !error && trends && trends.length > 0;
  const monthlyData = (hasData ? trends : []) as MonthlyTrend[];

  // Define current quarter interval for summary metrics
  const now = new Date();
  const quarterStart = startOfQuarter(now);
  const quarterEnd = endOfMonth(now); // Summary up to current month end

  // Filter data for the current quarter summary
  const quarterData = monthlyData.filter(item => {
    // Note: item.month should ideally be a parseable date string or ISO
    // The trends API returns ISO dates in 'month' field based on backend implementation
    try {
      const itemDate = parseISO(item.month);
      return isWithinInterval(itemDate, { start: quarterStart, end: quarterEnd });
    } catch (e) {
      return false;
    }
  });

  // Calculate trends with division by zero checks
  const avgEfficiency = quarterData.length > 0
    ? Math.round(quarterData.reduce((sum: number, item: MonthlyTrend) => sum + (Number(item.efficiency) || 0), 0) / quarterData.length)
    : 0;
    
  const lastMonthEfficiency = Number(monthlyData[monthlyData.length - 1]?.efficiency) || 0;
  const prevMonthEfficiency = Number(monthlyData[monthlyData.length - 2]?.efficiency) || 0;
  const monthlyGrowth = prevMonthEfficiency > 0
    ? Number(((lastMonthEfficiency - prevMonthEfficiency) / prevMonthEfficiency) * 100)
    : 0;

  const totalDeals = quarterData.reduce((sum: number, item: MonthlyTrend) => sum + (Number(item.deals) || 0), 0);
  const totalVolume = quarterData.reduce((sum: number, item: MonthlyTrend) => sum + (Number(item.revenue) || 0), 0);
  const totalRevenue = totalVolume;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 sm:p-6 md:p-8 shadow-2xl w-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-purple-500/10 border border-purple-500/20">
            <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight">
              Аналитика эффективности
            </h2>
            <p className="text-[9px] md:text-[10px] font-bold text-white/40 uppercase tracking-wider mt-0.5">
              Квартальные итоги и годовая динамика
            </p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !hasData && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="h-12 w-12 text-white/20 mb-4" />
          <p className="text-sm md:text-base font-bold text-white/40">
            Нет данных за этот период
          </p>
          <p className="text-xs text-white/30 mt-2">
            Статистика эффективности отсутствует
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && hasData && (
        <>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            {isRatingParticipant(getPositionName(employee)) && (
              <>
                <div className="p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-wider mb-2">
                    Средняя эффективность (Квартал)
                  </p>
                  <p className="text-xl sm:text-2xl md:text-3xl font-black text-white tabular-nums">
                    {avgEfficiency}%
                  </p>
                </div>

                <div className="p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-wider mb-2">
                    Рост за месяц
                  </p>
                  <p className={cn(
                    "text-xl sm:text-2xl md:text-3xl font-black tabular-nums",
                    monthlyGrowth >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {monthlyGrowth >= 0 ? '+' : ''}{isFinite(monthlyGrowth) ? monthlyGrowth.toFixed(1) : '0'}%
                  </p>
                </div>
              </>
            )}

            <div className="p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-wider mb-2">
                Всего сделок (Квартал)
              </p>
              <p className="text-xl sm:text-2xl md:text-3xl font-black text-white tabular-nums">
                {totalDeals}
              </p>
            </div>

            {!shouldHidePersonalRevenue(getPositionName(employee)) && (
              <div className="p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-wider mb-2">
                  Выручка (Квартал)
                </p>
                <p className="text-xl sm:text-2xl md:text-3xl font-black text-white tabular-nums">
                  {(totalRevenue / 1000000).toFixed(0)}M
                </p>
              </div>
            )}
          </div>

          {/* Performance Trend Chart - only for participants */}
          {isRatingParticipant(getPositionName(employee)) && (
            <div className="mb-6 md:mb-8">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tight">
                  Динамика эффективности
                </h3>
              </div>
              <div className="p-4 md:p-6 rounded-xl bg-white/[0.02] border border-white/5">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="efficiencyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="month"
                      stroke="rgba(255,255,255,0.2)"
                      style={{ fontSize: '10px', fontWeight: 'bold' }}
                      tickFormatter={getRussianMonthFull}
                      interval={0}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.2)"
                      style={{ fontSize: '10px', fontWeight: 'bold' }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      labelFormatter={(label) => `Месяц: ${getRussianMonthFull(label)}`}
                      contentStyle={{
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                      labelStyle={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}
                      itemStyle={{ color: 'hsl(var(--primary))' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="efficiency"
                      name="Эффективность"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#efficiencyGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Performance Summary - only for participants */}
          {isRatingParticipant(getPositionName(employee)) && (
            <div className="mt-6 md:mt-8 p-4 md:p-5 rounded-xl bg-gradient-to-br from-purple-500/5 to-transparent border border-purple-500/10">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <Target className="h-4 w-4 text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs md:text-sm font-black text-white/80 mb-1">
                    Общая оценка производительности
                  </p>
                  <p className="text-[10px] md:text-xs font-bold text-white/40 leading-relaxed">
                    Сотрудник демонстрирует {avgEfficiency >= 80 ? 'отличные' : avgEfficiency >= 60 ? 'хорошие' : 'удовлетворительные'} показатели эффективности.
                    {monthlyGrowth > 0 && ' Наблюдается положительная динамика роста.'}
                    {monthlyGrowth < 0 && ' Требуется внимание к снижению показателей.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
