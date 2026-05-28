import { motion } from 'framer-motion';
import { Users, Building2, Briefcase, ArrowRight, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { GroupData, Totals } from '@/hooks/useDrillDownDeals';

interface GroupedDealsViewProps {
  groups: GroupData[];
  totals: Totals;
  level: 'team' | 'branch' | 'company';
  isLoading?: boolean;
  onDrillDown?: (groupId: string, groupName: string, level: 'team' | 'branch' | 'company') => void;
  /** Колонки и метрики «Выручка АН» — только директор (access ≥ 90) */
  showAgencyRevenue?: boolean;
}

const fmtM = (v: string | number) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!n) return '0';
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toString();
};

const fmtFull = (v: string | number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
    typeof v === 'string' ? parseFloat(v) : v || 0
  );

export function GroupedDealsView({
  groups,
  totals,
  level,
  isLoading,
  onDrillDown,
  showAgencyRevenue = true,
}: GroupedDealsViewProps) {
  const getGroupIcon = () => {
    if (level === 'team') return Users;
    if (level === 'branch') return Briefcase;
    return Building2;
  };

  const getGroupName = (g: GroupData) => {
    if (level === 'team') return g.agent_name || 'Без агента';
    if (level === 'branch') return g.team_name || 'Без команды';
    return g.branch_name || 'Без филиала';
  };

  const getGroupKey = (g: GroupData) => {
    if (level === 'team') return g.agent_name || 'no-agent';
    if (level === 'branch') return g.team_id || 'no-team';
    return g.branch_id || 'no-branch';
  };

  const canDrillDown = (g: GroupData) => {
    if (level === 'company') return !!g.branch_id;
    if (level === 'branch') return !!g.team_id;
    if (level === 'team') return !!g.agent_name;
    return false;
  };

  const handleDrillDown = (g: GroupData) => {
    if (!onDrillDown || !canDrillDown(g)) return;
    onDrillDown(getGroupKey(g), getGroupName(g), level);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-zinc-900/40 border border-white/5 rounded-2xl h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="rounded-2xl bg-zinc-900/40 border border-white/5 py-20 flex flex-col items-center gap-3 text-center">
        <TrendingUp className="h-10 w-10 text-white/10" />
        <p className="text-sm font-bold text-white/30 uppercase tracking-wider">Нет данных</p>
      </div>
    );
  }

  const totalsItems = useMemo(() => {
    const rows: { label: string; value: string; color: string; glow: string }[] = [
      {
        label: 'Комиссия факт',
        value: fmtFull(totals.total_commission_fact),
        color: 'text-white',
        glow: 'group-hover:text-white',
      },
      {
        label: 'Доход агентов',
        value: fmtFull(totals.total_agent_income),
        color: 'text-emerald-400',
        glow: 'group-hover:text-emerald-300',
      },
      {
        label: 'Выручка МОП / РОП',
        value: fmtFull(totals.total_mop_revenue + totals.total_rop_payout),
        color: 'text-blue-400',
        glow: 'group-hover:text-blue-300',
      },
      {
        label: 'Ипотека',
        value: fmtFull(totals.total_mortgage_deduction),
        color: 'text-orange-400',
        glow: 'group-hover:text-orange-300',
      },
      {
        label: 'Прочие расходы',
        value: fmtFull(totals.total_other_expenses),
        color: 'text-red-400',
        glow: 'group-hover:text-red-300',
      },
    ];
    if (showAgencyRevenue) {
      rows.push({
        label: 'Выручка АН',
        value: fmtFull(totals.total_company_revenue),
        color: 'text-primary',
        glow: 'group-hover:text-primary',
      });
    }
    return rows;
  }, [
    totals.total_agent_income,
    totals.total_commission_fact,
    totals.total_company_revenue,
    totals.total_mop_revenue,
    totals.total_mortgage_deduction,
    totals.total_other_expenses,
    totals.total_rop_payout,
    showAgencyRevenue,
  ]);

  const Icon = getGroupIcon();

  return (
    <div className="space-y-3">
      {groups.map((group, idx) => {
        const key = getGroupKey(group);
        const name = getGroupName(group);
        const canDrill = canDrillDown(group);
        const dealCount = parseInt(group.deal_count.toString());
        const commFact = parseFloat(group.total_commission_fact.toString()) || 0;
        const compRev = parseFloat(group.total_company_revenue.toString()) || 0;

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.3 }}
            onClick={() => canDrill && handleDrillDown(group)}
            className={cn(
              "group bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all duration-300",
              canDrill && "cursor-pointer hover:bg-zinc-900/60 hover:shadow-xl"
            )}
          >
            {/* Header */}
            <div className="w-full flex items-center gap-4 px-5 md:px-6 py-4 md:py-5">
              {/* Icon */}
              <div className="shrink-0 p-2.5 rounded-xl bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-all">
                <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>

              {/* Name & deals count */}
              <div className="flex-1 min-w-0">
                <p className="text-sm md:text-base font-black text-white truncate">{name}</p>
                <p className="text-[9px] md:text-[10px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
                  {dealCount} {dealCount === 1 ? 'сделка' : dealCount > 4 ? 'сделок' : 'сделки'}
                </p>
              </div>

              {/* Metrics summary */}
              <div className="hidden sm:flex items-center gap-6 shrink-0">
                <div className="text-right flex items-center gap-3">
                  {group.pending_count !== undefined && parseInt(group.pending_count.toString()) > 0 && (
                    <motion.div 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/40 border border-amber-400/50"
                      title="Сделки в ожидании"
                    >
                      <span className="text-[10px] font-black text-white leading-none">
                        {group.pending_count}
                      </span>
                    </motion.div>
                  )}
                  <div>
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-wider">Комиссия</p>
                    <p className="text-sm md:text-base font-black text-white">{fmtM(commFact)} ₽</p>
                  </div>
                </div>
                {showAgencyRevenue ? (
                  <div className="text-right">
                    <p className="text-[9px] font-black text-primary/60 uppercase tracking-wider">Выручка АН</p>
                    <p className="text-sm md:text-base font-black text-primary">{fmtM(compRev)} ₽</p>
                  </div>
                ) : null}
              </div>

              {/* Arrow icon for drill-down */}
              {canDrill && (
                <ArrowRight className="h-4 w-4 text-white/30 shrink-0 group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Total summary bar - Redesigned sleek horizontal layout */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: groups.length * 0.05 + 0.1, duration: 0.3 }}
        className="rounded-2xl md:rounded-[1.5rem] bg-zinc-900/60 border border-white/5 overflow-hidden shadow-2xl backdrop-blur-xl"
      >
        <div className="flex flex-col md:flex-row items-stretch">
          {/* Main Title Section */}
          <div className="px-5 md:px-8 py-5 md:py-6 bg-white/[0.02] border-b md:border-b-0 md:border-r border-white/5 flex items-center gap-4 shrink-0">
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 hidden sm:block">
              <TrendingUp className="h-5 w-5 text-white/50" />
            </div>
            <div>
              <p className="text-[10px] md:text-xs font-black text-primary/80 uppercase tracking-[0.2em] mb-1">
                Итого
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tighter">
                  {totals.deal_count}
                </span>
                <span className="text-xs md:text-sm font-bold text-white/30 uppercase tracking-widest">
                  {totals.deal_count === 1 ? 'сделка' : totals.deal_count > 4 ? 'сделок' : 'сделки'}
                </span>
              </div>
            </div>
          </div>

          {/* Metrics Section */}
          <div
            className={cn(
              'flex-1 grid grid-cols-2 md:grid-cols-3 divide-x divide-y md:divide-y-0 lg:divide-y-0 divide-white/5',
              showAgencyRevenue ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
            )}
          >
            {totalsItems.map((item, idx) => (
              <div
                key={item.label}
                className={cn(
                  "p-5 lg:p-6 group relative overflow-hidden transition-colors hover:bg-white/[0.02] flex flex-col justify-center",
                  // Handle borders for mobile grid to avoid double borders
                  idx === 0 || idx === 1 ? 'border-t-0' : '',
                  idx % 2 === 0 ? 'border-l-0 lg:border-l' : '' // Keep left boundary clean on mobile, restore on desktop
                )}
              >
                <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-1.5 md:mb-2 line-clamp-1">
                  {item.label}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <p className={cn('text-lg md:text-xl lg:text-2xl font-black transition-colors', item.color, item.glow)}>
                    {item.value || 0}
                  </p>
                  <span className={cn("text-xs md:text-sm font-black opacity-50", item.color)}>₽</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
