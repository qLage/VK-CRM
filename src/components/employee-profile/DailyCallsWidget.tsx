import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, Users, ChevronDown, TrendingUp, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DailyCallsWidgetProps {
  employeeId: string;
}

type Period = 'week' | 'month' | 'quarter';

const PERIOD_LABELS: Record<Period, string> = {
  week: '7 ДНЕЙ',
  month: 'МЕСЯЦ',
  quarter: 'КВАРТАЛ',
};

interface CallsSeriesPoint {
  date: string;
  in: number;
  out: number;
  total: number;
  meetings: number;
}

interface CallsStats {
  period: Period;
  series: CallsSeriesPoint[];
  totals: { in: number; out: number; total: number; meetings: number; days: number };
  conversion: number;
  avgPerDay: number;
  bestDay: CallsSeriesPoint | null;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function DailyCallsWidget({ employeeId }: DailyCallsWidgetProps) {
  const [period, setPeriod] = useState<Period>('month');

  const { data, isLoading } = useQuery<CallsStats>({
    queryKey: ['employee-calls-stats', employeeId, period],
    queryFn: async () => {
      const { data } = await localAPI.request<CallsStats>(
        `/employees/${employeeId}/calls-stats?period=${period}`
      );
      return (
        data || {
          period,
          series: [],
          totals: { in: 0, out: 0, total: 0, meetings: 0, days: 0 },
          conversion: 0,
          avgPerDay: 0,
          bestDay: null,
        }
      );
    },
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const maxTotal = useMemo(() => {
    if (!data?.series?.length) return 1;
    return Math.max(...data.series.map((s) => s.total), 1);
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 sm:p-6 md:p-8 shadow-2xl w-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <Phone className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
              Звонки
            </h2>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">
              Конверсии и статистика из дневного отчёта
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:border-white/20">
              {PERIOD_LABELS[period]}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white">
            {(['week', 'month', 'quarter'] as Period[]).map((p) => (
              <DropdownMenuItem
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'text-[10px] font-bold uppercase tracking-widest cursor-pointer',
                  period === p && 'bg-white/5 text-emerald-400'
                )}
              >
                {PERIOD_LABELS[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        {[
          {
            label: 'Всего звонков',
            value: data?.totals.total || 0,
            icon: Phone,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            sub: `${PERIOD_LABELS[period]}`,
          },
          {
            label: 'Входящие',
            value: data?.totals.in || 0,
            icon: PhoneIncoming,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10 border-blue-500/20',
            sub: `${data?.totals.total ? Math.round(((data?.totals.in || 0) / data.totals.total) * 100) : 0}%`,
          },
          {
            label: 'Исходящие',
            value: data?.totals.out || 0,
            icon: PhoneOutgoing,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10 border-amber-500/20',
            sub: `${data?.totals.total ? Math.round(((data?.totals.out || 0) / data.totals.total) * 100) : 0}%`,
          },
          {
            label: 'Конверсия',
            value: `${data?.conversion ?? 0}%`,
            icon: TrendingUp,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10 border-purple-500/20',
            sub: `${data?.totals.meetings || 0} встреч`,
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="p-4 md:p-5 rounded-2xl bg-white/[0.03] border border-white/10 transition-all duration-500 hover:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={cn('p-2 rounded-xl border', s.bg)}>
                <s.icon className={cn('w-4 h-4', s.color)} />
              </div>
              <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                {s.sub}
              </span>
            </div>
            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">
              {s.label}
            </p>
            <AnimatePresence mode="wait">
              <motion.p
                key={`${s.label}-${s.value}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="text-2xl md:text-3xl font-black text-white tracking-tighter tabular-nums leading-none"
              >
                {isLoading ? '—' : typeof s.value === 'number' ? formatNumber(s.value) : s.value}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Bar chart by day */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            По дням
          </p>
          <div className="flex items-center gap-3 text-[9px] font-black text-white/40 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Вх.
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Исх.
            </span>
          </div>
        </div>

        {!isLoading && data && data.series.length > 0 ? (
          <div className="h-40 flex items-end gap-1.5 overflow-x-auto no-scrollbar pb-6 relative">
            {data.series.map((p, i) => {
              const inH = (p.in / maxTotal) * 100;
              const outH = (p.out / maxTotal) * 100;
              return (
                <motion.div
                  key={p.date}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: 'bottom' }}
                  className="flex flex-col items-center gap-0.5 min-w-[20px] flex-1 group/b relative"
                >
                  {/* Tooltip */}
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-800/95 backdrop-blur-md border border-white/20 px-2.5 py-1.5 rounded-lg text-[9px] font-black text-white opacity-0 group-hover/b:opacity-100 transition-all scale-75 group-hover/b:scale-100 whitespace-nowrap z-50 shadow-2xl tabular-nums pointer-events-none">
                    {formatDate(p.date)}: {p.total}
                  </div>
                  <div className="w-full flex flex-col gap-0.5 h-full justify-end">
                    <div
                      className="w-full bg-amber-400/80 rounded-t-sm hover:bg-amber-400 transition-colors"
                      style={{ height: `${outH}%` }}
                    />
                    <div
                      className="w-full bg-blue-400/80 rounded-b-sm hover:bg-blue-400 transition-colors"
                      style={{ height: `${inH}%` }}
                    />
                  </div>
                  <span className="absolute -bottom-5 text-[8px] font-black text-white/20 tabular-nums">
                    {i % Math.max(1, Math.ceil(data.series.length / 8)) === 0 ? formatDate(p.date) : ''}
                  </span>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Phone className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-sm font-black text-white/40 uppercase tracking-tighter">
              Нет данных
            </p>
            <p className="text-[10px] text-white/20 mt-1">
              Дневные отчёты со звонками не найдены
            </p>
          </div>
        )}
      </div>

      {/* Footer mini-stats */}
      {data && data.series.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-8 pt-6 border-t border-white/5">
          <div>
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">
              <Users className="inline w-3 h-3 mr-1" />
              Встречи
            </p>
            <p className="text-lg font-black text-white tabular-nums">{data.totals.meetings}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">
              Среднее
            </p>
            <p className="text-lg font-black text-white tabular-nums">{data.avgPerDay} <span className="text-[10px] font-bold text-white/30">/день</span></p>
          </div>
          <div>
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">
              Лучший
            </p>
            <p className="text-lg font-black text-white tabular-nums">
              {data.bestDay ? `${data.bestDay.total} ` : '—'}
              {data.bestDay && (
                <span className="text-[10px] font-bold text-white/30">{formatDate(data.bestDay.date)}</span>
              )}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
