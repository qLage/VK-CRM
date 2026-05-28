import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Handshake, Building2, Wallet } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

type Period = 'month' | 'quarter';

interface KpiMetrics {
  dealsCount?: number;
  totalDeposits?: number;
  deposits?: number;
  totalObjects?: number;
  objects?: number;
  totalRevenue?: number;
  planDeals?: number;
  planDeposits?: number;
  planObjects?: number;
  planRevenue?: number;
  planCompletion?: number;
  dealsPercent?: number;
  depositsPercent?: number;
  objectsPercent?: number;
  revenuePercent?: number;
}

function PeriodToggle({
  period,
  onChange,
  small = false,
}: {
  period: Period;
  onChange: (p: Period) => void;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center rounded-xl border border-white/[0.08] bg-white/[0.05] shadow-inner select-none',
        small ? 'p-0.5 gap-0.5' : 'p-1 gap-1 rounded-2xl',
      )}
    >
      <button
        type="button"
        onClick={() => onChange('month')}
        className={cn(
          'rounded-lg font-bold transition-all duration-200 whitespace-nowrap',
          small ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-1.5 text-xs rounded-xl',
          period === 'month'
            ? 'bg-white text-zinc-900 shadow-md'
            : 'text-white/40 hover:text-white/70 hover:bg-white/5',
        )}
      >
        Месяц
      </button>
      <div className="w-px h-3 bg-white/10 flex-shrink-0" />
      <button
        type="button"
        onClick={() => onChange('quarter')}
        className={cn(
          'rounded-lg font-bold transition-all duration-200 whitespace-nowrap',
          small ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-1.5 text-xs rounded-xl',
          period === 'quarter'
            ? 'bg-white text-zinc-900 shadow-md'
            : 'text-white/40 hover:text-white/70 hover:bg-white/5',
        )}
      >
        Квартал
      </button>
    </div>
  );
}

function MetricBar({
  label,
  current,
  target,
  percent,
  colorClass,
  valueCaption,
}: {
  label: string;
  current: number;
  target: number;
  percent: number;
  colorClass: string;
  valueCaption?: string;
}) {
  const pct = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-white/45">{label}</span>
        <span className="text-[10px] font-bold text-white/70 tabular-nums text-right">
          {valueCaption ?? (
            <>
              {current} <span className="text-white/30">/</span> {target}
            </>
          )}
        </span>
      </div>
      <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className={cn('h-full rounded-full', colorClass)}
        />
      </div>
    </div>
  );
}

function MetricRowFlexible({
  label,
  current,
  target,
  percent,
  colorClass,
  valueCaption,
}: {
  label: string;
  current: number;
  target: number;
  percent: number;
  colorClass: string;
  valueCaption?: string;
}) {
  if (target > 0) {
    return (
      <MetricBar
        label={label}
        current={current}
        target={target}
        percent={percent}
        colorClass={colorClass}
        valueCaption={valueCaption}
      />
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-white/45">{label}</span>
        <span className="text-[10px] font-medium text-white/35 text-right tabular-nums">
          {valueCaption ? (
            <>
              {valueCaption} <span className="text-white/20">·</span> цель не задана
            </>
          ) : (
            <>
              факт {current} <span className="text-white/20">·</span> цель не задана
            </>
          )}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-white/[0.04] border border-white/5 overflow-hidden">
        <div className="h-full w-[3%] rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export function PersonalPlanProgressWidget({ className }: { className?: string }) {
  const { user, profile, accessLevel } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const isManager = accessLevel >= 50;

  const { data: kpiStats, isLoading } = useQuery({
    queryKey: ['my-kpi-stats-personal-plan-widget', user?.id, period, isManager, profile?.branch_id],
    queryFn: async () => {
      const { data } = await localAPI.request(`/kpi/my-stats?period=${period}&branch_id=all`);
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });

  if (isLoading && !kpiStats) {
    return <Skeleton className={cn('h-full min-h-[280px] w-full rounded-[2.5rem] opacity-20', className)} />;
  }

  const m = (kpiStats?.metrics || {}) as KpiMetrics;
  const depositsFact = m.totalDeposits ?? m.deposits ?? 0;
  const objectsFact = m.totalObjects ?? m.objects ?? 0;
  const dealsFact = m.dealsCount ?? 0;
  const revenueFact = m.totalRevenue ?? 0;

  const planDeals = m.planDeals ?? 0;
  const planDeposits = m.planDeposits ?? 0;
  const planObjects = m.planObjects ?? 0;
  const planRevenue = m.planRevenue ?? 0;

  const dealsPct = planDeals > 0 ? (dealsFact / planDeals) * 100 : m.dealsPercent ?? 0;
  const depositsPct = planDeposits > 0 ? (depositsFact / planDeposits) * 100 : m.depositsPercent ?? 0;
  const objectsPct = planObjects > 0 ? (objectsFact / planObjects) * 100 : m.objectsPercent ?? 0;
  const revenuePct = planRevenue > 0 ? (revenueFact / planRevenue) * 100 : m.revenuePercent ?? 0;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(val);

  const overall = m.planCompletion ?? 0;
  const hasAnyTarget = planDeals > 0 || planDeposits > 0 || planObjects > 0 || planRevenue > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 h-full flex flex-col relative overflow-hidden shadow-2xl cursor-default select-none',
        className,
      )}
    >
      <div className="absolute top-0 right-0 p-32 bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-35" />

      <div className="relative z-10 flex flex-col h-full gap-4 md:gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="p-3 md:p-3.5 bg-white/5 rounded-xl md:rounded-2xl border border-white/10 flex-shrink-0">
            <Target className="h-6 w-6 md:h-8 md:w-8 text-white" />
          </div>
          <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
            <PeriodToggle period={period} onChange={setPeriod} small />
            <div
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-black border backdrop-blur-md',
                overall >= 75 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-primary/10 text-primary border-primary/20',
              )}
            >
              {Number(overall).toFixed(0)}% плана
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.25em]">Факт за период</p>
          <p className="text-xs md:text-sm font-black text-white uppercase tracking-tight">Планирование</p>
        </div>

        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3 py-3 md:px-4 md:py-3.5 pointer-events-none">
          <p className="text-[9px] font-black text-white/35 uppercase tracking-widest mb-2">Уже выполнено</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] md:text-xs font-bold text-white/90 tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Handshake className="h-3.5 w-3.5 text-rose-400/90 shrink-0" />
              {dealsFact} сдел.
            </span>
            <span className="text-white/25">·</span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-sky-400/90 shrink-0" />
              {depositsFact} задат.
            </span>
            <span className="text-white/25">·</span>
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-amber-400/90 shrink-0" />
              {objectsFact} объек.
            </span>
            <span className="text-white/25">·</span>
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 text-emerald-400/90 shrink-0" />
              {formatCurrency(revenueFact)}
            </span>
          </div>
        </div>

        {!hasAnyTarget ? (
          <p className="text-xs text-white/35 font-medium leading-relaxed">
            На выбранный период в планировании не заданы целевые показатели (или план ещё не распределён).
          </p>
        ) : (
          <div className="space-y-3 md:space-y-4 flex-1 min-h-0">
            <MetricRowFlexible
              label="Сделки"
              current={dealsFact}
              target={planDeals}
              percent={dealsPct}
              colorClass="bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
            />
            <MetricRowFlexible
              label="Задатки"
              current={depositsFact}
              target={planDeposits}
              percent={depositsPct}
              colorClass="bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.35)]"
            />
            <MetricRowFlexible
              label="Объекты"
              current={objectsFact}
              target={planObjects}
              percent={objectsPct}
              colorClass="bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
            />
            <MetricRowFlexible
              label="Выручка"
              current={Math.round(revenueFact)}
              target={Math.round(planRevenue)}
              percent={revenuePct}
              colorClass="bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
              valueCaption={
                planRevenue > 0
                  ? `${formatCurrency(revenueFact)} / ${formatCurrency(planRevenue)}`
                  : formatCurrency(revenueFact)
              }
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
