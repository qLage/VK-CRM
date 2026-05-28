import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { motion } from 'framer-motion';
import { TrendingUp, DollarSign, Target, BarChart3 } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { startOfQuarter, endOfMonth, format } from 'date-fns';

interface EmployeeDealsStatsProps {
  employeeName: string;
}

export function EmployeeDealsStats({ employeeName }: EmployeeDealsStatsProps) {
  const now = new Date();
  const quarterStart = startOfQuarter(now);
  const quarterEnd = endOfMonth(now);
  
  const startStr = format(quarterStart, 'yyyy-MM-01');
  const endStr = format(quarterEnd, 'yyyy-MM-dd');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['employee-deal-stats', employeeName, startStr, endStr],
    queryFn: async () => {
      const { data, error } = await localAPI.request(
        `/deal-table/employee/${encodeURIComponent(employeeName)}?start=${startStr}&end=${endStr}`
      );
      if (error) throw error;
      return data;
    },
    enabled: !!employeeName,
    staleTime: 60000
  });

  if (!employeeName) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const totalDeals = parseInt(stats.total_deals || 0);
  const totalCommission = parseFloat(stats.total_commission || 0);
  const personalIncome = parseFloat(stats.personal_income || 0);
  const avgCheck = parseFloat(stats.avg_check || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 sm:p-6 md:p-8 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-black text-white uppercase tracking-tight">
            Сделки сотрудника
          </h3>
          <p className="text-xs text-white/40 uppercase tracking-wider">
            Данные за текущий квартал
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Deals */}
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/5 space-y-2">
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 w-fit">
            <Target className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white tabular-nums">
              {totalDeals}
            </p>
            <p className="text-xs font-black text-white/20 uppercase tracking-widest mt-1">
              Сделок
            </p>
          </div>
        </div>

        {/* Total Commission */}
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/5 space-y-2">
          <div className="p-2 bg-green-500/10 rounded-lg border border-green-500/20 w-fit">
            <DollarSign className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white tabular-nums">
              {new Intl.NumberFormat('ru-RU').format(totalCommission)}
            </p>
            <p className="text-xs font-black text-white/20 uppercase tracking-widest mt-1">
              Комиссия ₽
            </p>
          </div>
        </div>

        {/* Personal Income */}
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/5 space-y-2">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/20 w-fit">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-black text-white tabular-nums">
              {new Intl.NumberFormat('ru-RU').format(personalIncome)}
            </p>
            <p className="text-xs font-black text-white/20 uppercase tracking-widest mt-1">
              Личный доход ₽
            </p>
          </div>
        </div>

        {/* Average Check */}
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/5 space-y-2">
          <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 w-fit">
            <BarChart3 className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white tabular-nums">
              {new Intl.NumberFormat('ru-RU').format(avgCheck)}
            </p>
            <p className="text-xs font-black text-white/20 uppercase tracking-widest mt-1">
              Средний чек ₽
            </p>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {totalDeals === 0 && (
        <div className="mt-6 text-center py-8">
          <p className="text-sm text-white/40">
            Нет сделок за текущий квартал
          </p>
        </div>
      )}
    </motion.div>
  );
}
