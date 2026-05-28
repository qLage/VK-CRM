import { motion } from 'framer-motion';
import { TrendingUp, DollarSign, BarChart3, Building2 } from 'lucide-react';

interface MetricsPanelProps {
  totals: {
    total_deals: string | number;
    pending_count: string | number;
    total_commission_fact: string | number;
    total_agent_income: string | number;
    total_company_revenue: string | number;
    avg_check: string | number;
  } | null;
  isLoading?: boolean;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);

const fmtM = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return fmt(v);
};

export function MetricsPanel({ totals, isLoading }: MetricsPanelProps) {
  const metrics = [
    {
      label: 'Всего сделок',
      value: isLoading ? '—' : String(parseInt(totals?.total_deals?.toString() || '0')),
      sub: 'шт.',
      icon: TrendingUp,
      color: 'from-blue-500/20 to-blue-500/5',
      border: 'border-blue-500/20',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      glow: 'group-hover:shadow-blue-500/10',
    },
    {
      label: 'Общая комиссия',
      value: isLoading ? '—' : fmtM(parseFloat(totals?.total_commission_fact?.toString() || '0')),
      sub: '₽',
      icon: DollarSign,
      color: 'from-emerald-500/20 to-emerald-500/5',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      glow: 'group-hover:shadow-emerald-500/10',
    },
    {
      label: 'Средний чек',
      value: isLoading ? '—' : fmtM(parseFloat(totals?.avg_check?.toString() || '0')),
      sub: '₽',
      icon: BarChart3,
      color: 'from-violet-500/20 to-violet-500/5',
      border: 'border-violet-500/20',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-400',
      glow: 'group-hover:shadow-violet-500/10',
    },
    {
      label: 'В ожидании',
      value: isLoading ? '—' : String(parseInt(totals?.pending_count?.toString() || '0')),
      sub: 'шт.',
      icon: TrendingUp,
      color: 'from-amber-500/20 to-amber-500/5',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      glow: 'group-hover:shadow-amber-500/10',
    },
    {
      label: 'Выручка АН',
      value: isLoading ? '—' : fmtM(parseFloat(totals?.total_company_revenue?.toString() || '0')),
      sub: '₽',
      icon: Building2,
      color: 'from-primary/20 to-primary/5',
      border: 'border-primary/20',
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      glow: 'group-hover:shadow-primary/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {metrics.map((m, i) => {
        const Icon = m.icon;
        return (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4 }}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${m.color} border ${m.border} p-5 md:p-6 flex flex-col justify-between shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${m.glow}`}
          >
            {/* Ambient blur */}
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/5 blur-2xl" />

            <div className="flex items-center justify-between mb-4 relative z-10">
              <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                {m.label}
              </p>
              <div className={`p-2 md:p-2.5 rounded-xl ${m.iconBg} border ${m.border}`}>
                <Icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${m.iconColor}`} />
              </div>
            </div>

            <div className="relative z-10">
              {isLoading ? (
                <div className="h-8 w-24 bg-white/10 rounded-lg animate-pulse" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl md:text-3xl font-black text-white tracking-tighter">
                    {m.value}
                  </span>
                  <span className="text-xs font-bold text-white/30">{m.sub}</span>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
