import { motion } from 'framer-motion';
import { Building2, ArrowRight, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MortgageBranchGroup {
  branch_key: string;
  branch_name: string;
  row_count: number;
  pending_count: number;
  total_service: number;
  total_broker: number;
  total_agency: number;
}

interface MortgageBranchTotals {
  row_count: number;
  pending_count: number;
  total_service: number;
  total_broker: number;
  total_agency: number;
}

const fmtM = (v: number) => {
  const n = v || 0;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toString();
};

const fmtFull = (v: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v || 0);

interface GroupedMortgageBranchesViewProps {
  groups: MortgageBranchGroup[];
  totals: MortgageBranchTotals;
  isLoading?: boolean;
  onDrillDown?: (branchKey: string, branchName: string) => void;
}

/** Карточки филиалов в стиле GroupedDealsView (компания → провалиться в филиал). */
export function GroupedMortgageBranchesView({
  groups,
  totals,
  isLoading,
  onDrillDown,
}: GroupedMortgageBranchesViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
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

  return (
    <div className="space-y-3">
      {groups.map((group, idx) => {
        const canDrill = !!onDrillDown;
        return (
          <motion.div
            key={group.branch_key || '__empty__'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.3 }}
            onClick={() => canDrill && onDrillDown!(group.branch_key, group.branch_name)}
            className={cn(
              'group bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all duration-300',
              canDrill && 'cursor-pointer hover:bg-zinc-900/60 hover:shadow-xl'
            )}
          >
            <div className="w-full flex items-center gap-4 px-5 md:px-6 py-4 md:py-5">
              <div className="shrink-0 p-2.5 rounded-xl bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-all">
                <Building2 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm md:text-base font-black text-white truncate">{group.branch_name}</p>
                <p className="text-[9px] md:text-[10px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
                  {group.row_count} {group.row_count === 1 ? 'запись' : group.row_count > 4 ? 'записей' : 'записи'}
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-6 shrink-0">
                <div className="text-right flex items-center gap-3">
                  {group.pending_count > 0 && (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/40 border border-amber-400/50"
                      title="В ожидании"
                    >
                      <span className="text-[10px] font-black text-white leading-none">{group.pending_count}</span>
                    </motion.div>
                  )}
                  <div>
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-wider">Услуги</p>
                    <p className="text-sm md:text-base font-black text-white">{fmtM(group.total_service)} ₽</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-primary/60 uppercase tracking-wider">ЗП брокера</p>
                  <p className="text-sm md:text-base font-black text-primary">{fmtM(group.total_broker)} ₽</p>
                </div>
              </div>

              {canDrill && (
                <ArrowRight className="h-4 w-4 text-white/30 shrink-0 group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
              )}
            </div>
          </motion.div>
        );
      })}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: groups.length * 0.05 + 0.1, duration: 0.3 }}
        className="rounded-2xl md:rounded-[1.5rem] bg-zinc-900/60 border border-white/5 overflow-hidden shadow-2xl backdrop-blur-xl"
      >
        <div className="flex flex-col md:flex-row items-stretch">
          <div className="px-5 md:px-8 py-5 md:py-6 bg-white/[0.02] border-b md:border-b-0 md:border-r border-white/5 flex items-center gap-4 shrink-0">
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 hidden sm:block">
              <TrendingUp className="h-5 w-5 text-white/50" />
            </div>
            <div>
              <p className="text-[10px] md:text-xs font-black text-primary/80 uppercase tracking-[0.2em] mb-1">Итого</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tighter">{totals.row_count}</span>
                <span className="text-xs md:text-sm font-bold text-white/30 uppercase tracking-widest">
                  {totals.row_count === 1 ? 'запись' : totals.row_count > 4 ? 'записей' : 'записи'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/5">
            {[
              { label: 'Сумма услуг', value: fmtFull(totals.total_service), color: 'text-white' },
              { label: 'ЗП брокера', value: fmtFull(totals.total_broker), color: 'text-primary' },
              { label: 'Доля агентства', value: fmtFull(totals.total_agency), color: 'text-amber-400' },
              { label: 'В ожидании', value: String(totals.pending_count), color: 'text-amber-400' },
            ].map((item, idx) => (
              <div
                key={item.label}
                className={cn(
                  'p-5 lg:p-6 relative overflow-hidden transition-colors hover:bg-white/[0.02] flex flex-col justify-center',
                  idx === 0 || idx === 1 ? 'border-t-0' : '',
                  idx % 2 === 0 ? 'border-l-0 lg:border-l' : ''
                )}
              >
                <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-1.5 md:mb-2 line-clamp-1">
                  {item.label}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <p className={cn('text-lg md:text-xl lg:text-2xl font-black transition-colors', item.color)}>
                    {item.value}
                  </p>
                  {item.label !== 'В ожидании' && (
                    <span className={cn('text-xs md:text-sm font-black opacity-50', item.color)}>₽</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
