import { motion } from 'framer-motion';
import { 
  Briefcase, 
  TrendingUp, 
  Target, 
  Activity, 
  Clock, 
  Trophy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface PerformanceStatsRowProps {
  stats: any;
  loading: boolean;
  hideRevenue?: boolean;
  hideRating?: boolean;
}

export function PerformanceStatsRow({ stats, loading, hideRevenue, hideRating }: PerformanceStatsRowProps) {
  const navigate = useNavigate();

  const formatWithSpaces = (value: number) => {
    return value.toLocaleString('ru-RU');
  };

  const MetricItem = ({ 
    icon: Icon, 
    label, 
    value, 
    subValue, 
    color, 
    onClick, 
    className,
    isPlan = false,
    planPercent = 0
  }: any) => (
    <div 
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col justify-center px-4 md:px-6 py-4 relative group transition-all duration-500",
        onClick && "cursor-pointer hover:bg-white/[0.03]",
        className
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={cn("p-2 rounded-xl border transition-all duration-500 group-hover:scale-110", color)}>
          <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </div>
        <p className="text-[8px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap group-hover:text-white/40 transition-colors">
          {label}
        </p>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tighter tabular-nums leading-none">
          {loading ? '—' : value}
        </span>
        {subValue && !loading && (
          <span className="text-[10px] md:text-[11px] font-bold text-white/30 truncate max-w-[80px]">
            {subValue}
          </span>
        )}
      </div>

      {isPlan && !loading && (
        <div className="mt-3 w-full h-1 bg-white/5 rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${planPercent}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={cn("h-full absolute left-0 top-0 rounded-full", color.split(' ')[0].replace('bg-', 'bg-').replace('/10', ''))}
          />
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl md:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 shadow-2xl overflow-hidden w-full"
    >
      <div className="flex flex-col md:flex-row md:divide-x divide-white/5 overflow-x-auto no-scrollbar">
        {/* Revenue */}
        {!hideRevenue && (
          <MetricItem
            icon={TrendingUp}
            label="Выручка"
            value={loading ? '0' : `${formatWithSpaces(stats?.totalRevenue ?? stats?.revenue ?? 0)} ₽`}
            subValue="Квартал (как в рейтинге)"
            color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          />
        )}

        {/* Rank */}
        {!hideRating && (
          <MetricItem
            icon={Trophy}
            label="Рейтинг"
            value={loading ? '—' : `#${stats?.rank || '-'}`}
            subValue={stats?.rating ? `${Number(stats.rating).toFixed(2)} балла` : "Место в команде"}
            color="bg-amber-500/10 border-amber-500/20 text-amber-500"
            onClick={() => navigate('/rating')}
          />
        )}

        {/* Personal Plan */}
        <MetricItem
          icon={Target}
          label="Личный план"
          value={`${loading ? '0' : (stats?.planPercent || 0)}%`}
          isPlan={true}
          planPercent={stats?.planPercent || 0}
          color="bg-primary/10 border-primary/20 text-primary"
        />

        {/* Management Plan (If applicable) */}
        {stats?.dualKpi?.hasDualKpi && (
          <MetricItem
            icon={Activity}
            label="Команда"
            value={`${loading ? '0' : (stats?.dualKpi?.kpis[1]?.planCompletion || 0)}%`}
            isPlan={true}
            planPercent={stats?.dualKpi?.kpis[1]?.planCompletion || 0}
            color="bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
          />
        )}

        {/* Total Deals */}
        <MetricItem
          icon={Briefcase}
          label="Сделки"
          value={loading ? '—' : (stats?.totalDeals || 0)}
          subValue="Всего"
          color="bg-blue-500/10 border-blue-500/20 text-blue-400"
        />

        {/* Pending Deals */}
        <MetricItem
          icon={Clock}
          label="На проверке"
          value={loading ? '—' : (stats?.pendingDeals || 0)}
          subValue="Ожидание"
          color="bg-rose-500/10 border-rose-500/20 text-rose-500"
        />
      </div>
    </motion.div>
  );
}
